# Design — apply-worktree-isolation

## Context

This change introduces an **optional isolated-worktree execution mode** for `/specflow.apply` subagent-dispatched bundles. Subagent-eligible bundles (those whose `size_score` exceeds the configured threshold) run inside ephemeral git worktrees at `.specflow/worktrees/<run-id>/<bundle-id>/`. The main agent remains the sole workflow-state mutator and becomes the **integration authority** that validates the subagent's worktree diff, imports accepted changes via `git apply --binary`, and advances bundle status accordingly.

Two new terminal-for-invocation bundle statuses are introduced: `subagent_failed` (subagent returned `status: "failure"`) and `integration_rejected` (subagent succeeded but the main agent rejected the integration).

See `proposal.md` for why and `specs/apply-worktree-integration/spec.md`, `specs/bundle-subagent-execution/spec.md`, and `specs/task-planner/spec.md` for the normative contracts.

## Concerns

Vertical slices of this change, each independently reviewable:

1. **Execution-mode dispatch** — the dispatcher assigns `inline-main` or `subagent-worktree` per bundle based on existing subagent-eligibility. Solves: ambiguity of what "dispatched" means when a worktree mode exists alongside inline. Locus: `bundle-subagent-execution` MODIFIED clauses + `apply-worktree-integration` ADDED clauses.

2. **Worktree lifecycle** — create (from HEAD at creation time, at `.specflow/worktrees/<run-id>/<bundle-id>/`), prepare context, run subagent inside, compute diff, import, clean up. Solves: shared-working-tree collisions, cross-bundle side effects, ambiguous artifact attribution. Locus: new worktree helper (CLI or internal library) + main-agent orchestration.

3. **Integration-authority contract** — main agent inspects the worktree diff, cross-checks against `produced_artifacts`, rejects on undeclared paths / protected-path touches / empty-diff-on-success, and imports via `git apply --binary`. Solves: bundle `done` on unverified subagent output. Locus: new integration step in the apply dispatcher.

4. **Bundle-status extension** — `task-planner`'s status enum gains `subagent_failed` and `integration_rejected`. `updateBundleStatus` learns the new transitions and their reset-via-`/specflow.fix_apply` rule. Solves: distinguishing subagent failure vs. integration rejection for recovery tooling. Locus: `task-planner` MODIFIED clauses + implementation of the new transitions + `tasks.md` renderer.

5. **Worktree-unavailable fail-fast** — if `git worktree add` fails for any reason, the apply STOPS (no silent fallback to inline). Solves: hidden degradation of isolation guarantees. Locus: main-agent orchestration.

6. **Retention policy** — worktree removed on success; retained at its path on `subagent_failed` or `integration_rejected`. Solves: diagnosability after failure without persistent disk pressure after success. Locus: main-agent orchestration.

## State / Lifecycle

**Canonical persisted state (repo-level, authoritative):**
- `openspec/changes/<CHANGE_ID>/task-graph.json` — extended bundle status enum (`pending | in_progress | done | skipped | subagent_failed | integration_rejected`).
- `openspec/changes/<CHANGE_ID>/tasks.md` — re-rendered from the normalized task graph; bundles in the new statuses render with a distinct marker.
- `.specflow/runs/<RUN_ID>/` — existing run-state directory; unchanged by this change except for reading/writing bundle-status transitions through `specflow-advance-bundle`.

**Ephemeral state (per apply invocation):**
- `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` — a git worktree for one `subagent-worktree` bundle. Created at worktree-creation time from the current main-workspace HEAD. Removed on `done`. Retained on `subagent_failed` / `integration_rejected`.
- Per-worktree **integration base commit** (the SHA main HEAD pointed to at creation time) — held in main-agent memory for the duration of the bundle; used to compute the integration diff via `git diff --binary <base>..HEAD`.

**Derived / transient state:**
- Execution-mode assignment per bundle — computed at dispatch time from subagent-eligibility; not persisted.
- The worktree diff used for integration — computed on demand from `git diff --binary`; not persisted.
- Warning "over-declared artifact" messages — emitted to user output; not persisted.

**Lifecycle boundaries:**
- Bundle lifecycle: `pending` → `in_progress` → { `done` | `subagent_failed` | `integration_rejected` }. From the two new statuses, only `/specflow.fix_apply` or an explicit operator reset returns the bundle to `pending`.
- Worktree lifecycle: `git worktree add` (bound to bundle `in_progress`) → subagent execution → integration check → `git worktree remove` on success OR retention on failure. Never shared across bundles.
- Run lifecycle: unchanged. The run stays in `apply_draft` through subagent_failed / integration_rejected; it only advances when every bundle reaches `done`.

**Persistence-sensitive state:** `task-graph.json` SHALL be written atomically (write-to-temp + rename) on every transition, including the new statuses, to prevent readers from observing a mismatched intermediate state.

## Contracts / Interfaces

**Dispatcher ↔ execution-mode assignment (internal):**
```
assignExecutionMode(bundle, config, taskGraphPresent) -> "inline-main" | "subagent-worktree"
  // returns "subagent-worktree" iff bundle is subagent-eligible per existing rule
  // returns "inline-main" otherwise
```

**Main agent ↔ worktree helper (internal CLI or library):**
```
createWorktree(runId, bundleId) -> { path: string, baseSha: string } | error
  // git worktree add .specflow/worktrees/<runId>/<bundleId>/ HEAD
  // on any failure: throws worktree-unavailable error (fail-fast trigger)

computeDiff(worktreePath, baseSha) -> binary-safe patch bytes
  // git -C <worktreePath> diff --binary <baseSha>..HEAD

importPatch(patchBytes) -> ok | error
  // git apply --binary at repo root. No --3way retry in Phase 1.

removeWorktree(path) -> ok | error
  // git worktree remove <path>. Error on success path is surfaced but does not revert `done`.

listTouchedPaths(patchBytes) -> Set<path>
  // { added | modified | deleted | rename-new | mode-only } paths
```

**Main agent ↔ subagent (existing, extended by this change):**
```
SubagentResult = {
  status: "success" | "failure",
  produced_artifacts: Set<repo-relative-path>,  // over-declaration allowed
  error?: string + structured-diagnostic-fields  // required iff status = "failure"
}
```

**Main agent ↔ `specflow-advance-bundle` (existing CLI, extended):**
```
specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <status>
  // status ∈ { in_progress | done | subagent_failed | integration_rejected | pending }
  // "pending" is only accepted from { subagent_failed, integration_rejected } via
  //   /specflow.fix_apply or an explicit operator reset flag.
```

**Integration-rejection cause (surfaced to user, informative):**
One of: `undeclared_path(<path>)`, `protected_path(<path>)`, `empty_diff_on_success`, `patch_apply_failure(<git-error>)`.

**Contracts with external systems:** only `git worktree`, `git diff --binary`, and `git apply --binary`. Git 2.5+ is assumed (already in place for the existing project).

## Persistence / Ownership

| Artifact / state | Owner | Writer | Reader |
|---|---|---|---|
| `openspec/changes/<CHANGE_ID>/task-graph.json` | `task-planner` | `specflow-advance-bundle` only (CLI serializes through main agent) | Main agent dispatcher, `/specflow.fix_apply`, watch TUI |
| `openspec/changes/<CHANGE_ID>/tasks.md` | `task-planner` | `specflow-advance-bundle` (atomic rerender after transitions) | humans, review tooling |
| `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` | `apply-worktree-integration` | Main agent (`git worktree add` / `remove`) | Subagent (inside), main agent (for diff), `/specflow.fix_apply` (post-failure) |
| Worktree base SHA | Main agent (in-memory) | Main agent at worktree creation | Main agent at integration time |
| Subagent `produced_artifacts` | Subagent | Subagent return value | Main agent integration step |
| Integration-rejection cause | Main agent | Emitted to user output and surfaced via CLI | Humans, `/specflow.fix_apply` tooling |

Subagents SHALL NOT write to `task-graph.json`, `tasks.md`, or anywhere under `.specflow/` — enforced by the protected-path rejection in the integration step (beyond the existing prohibition).

No new persisted files are introduced in Phase 1. Worktrees are the only new on-disk artifacts and are managed through `git worktree`.

## Integration Points

**External to specflow:**
- `git worktree add/remove/list` — standard git ≥ 2.5.
- `git diff --binary` and `git apply --binary` — standard git.
- OS filesystem — under `.specflow/worktrees/` relative to repo root.

**Cross-capability within specflow:**
- `bundle-subagent-execution` ↔ `apply-worktree-integration`: the dispatcher in `bundle-subagent-execution` determines execution mode; `apply-worktree-integration` owns the worktree mechanics. Contract boundary: `bundle-subagent-execution` decides *whether* to use a worktree; `apply-worktree-integration` defines *how* the worktree behaves.
- `task-planner` ↔ `bundle-subagent-execution`: status enum extension. `task-planner` owns the schema; `bundle-subagent-execution` references the new statuses from its fail-fast clauses.
- `/specflow.fix_apply` — consumes the new statuses and the retained worktrees. Its own contract update (messages, recovery logic) is a downstream effect but not introduced by this change beyond the referenced recovery paths.
- Watch TUI / rendering — MUST tolerate the two new statuses and render them distinctly (per `task-planner` modified clause).

**Save / restore / regenerate boundaries:**
- Restore after failure: `/specflow.fix_apply` reads the retained worktree at the known path; reset transitions status `→ pending` and the next apply invocation re-creates a fresh worktree from the (now-updated) HEAD.
- Regenerate task graph (`specflow-generate-task-graph`): unaffected by the new statuses because `generateTaskGraph` never emits them; it always emits `pending`.

## Ordering / Dependency Notes

Work ordering suggestion (foundational → dependent), useful input for `task-planner` bundle generation:

1. **Foundational / schema** — extend `task-planner` status enum and `updateBundleStatus` to accept the two new terminal transitions and the reset-via-fix_apply transitions. Tests for the schema and reducer are independent of everything else and can be implemented in parallel with the next item.

2. **Worktree helper** — the `createWorktree` / `computeDiff` / `importPatch` / `removeWorktree` primitives are self-contained and only depend on git. Can be implemented in parallel with step 1.

3. **Main-agent integration step** — the diff inspection + produced-artifact cross-check + protected-path check + empty-diff-on-success check + patch-apply. Depends on step 2's helper for diff/import primitives.

4. **Dispatcher execution-mode assignment** — small change that routes eligible bundles to `subagent-worktree` and ineligible ones to `inline-main`. Depends on step 3 being available (so there is something to route *to*) and step 1 (to advance to the new statuses).

5. **Fail-fast + worktree-unavailable behavior** — wire steps 2–4 into the existing chunk-drain-then-stop flow; add the fail-fast-on-`git worktree add`-failure path. Depends on steps 1–4.

6. **tasks.md rendering update** — non-blocking; can land with or after step 1 but must land before this change archives.

7. **`/specflow.fix_apply` recovery-path documentation** — doc update; depends on steps 1 and 5 conceptually but has no code dependency.

**Parallelizable:** steps 1 and 2 can run concurrently. Steps 6 and 7 can run concurrently with each other and with later coding steps.

## Completion Conditions

A concern is complete when each of the following is observable:

- **Execution-mode dispatch**: a test-double or integration test demonstrates that subagent-eligible bundles are assigned `subagent-worktree` and ineligible bundles are assigned `inline-main` under every combination of `enabled = true/false`, `size_score ≷ threshold`, and `size_score = undefined`.
- **Worktree lifecycle**: an apply run with at least one subagent-worktree bundle produces a worktree at the conventional path, a non-empty diff inside the worktree, and a successful `git worktree remove` on success (verified via `git worktree list`).
- **Integration-authority contract**: the four rejection causes are each independently testable and each lands the bundle in `integration_rejected`. A positive test confirms that a well-declared non-empty diff touching only non-protected paths imports cleanly and advances to `done`.
- **Bundle-status extension**: `task-graph.json` validates as containing each new status; `updateBundleStatus` accepts/rejects transitions per the spec; `tasks.md` renders the new statuses with a distinct marker.
- **Worktree-unavailable fail-fast**: simulating `git worktree add` failure (e.g., via a pre-existing stale path) causes the apply to STOP with a clear error and leaves the run in `apply_draft` with no subsequent subagents spawned.
- **Retention policy**: on success the worktree is no longer in `git worktree list`; on failure the worktree path remains and is enumerable.

Each concern above is independently reviewable (PR-level granularity) and independently testable (unit + integration tests).

## Accepted Spec Conflicts

| id | capability | delta_clause | baseline_clause | rationale | accepted_at |
|----|------------|--------------|-----------------|-----------|-------------|
| AC1 | bundle-subagent-execution | Scenario "One failure in a chunk records siblings then stops" transitions the failed bundle X to `subagent_failed` via `specflow-advance-bundle`. | Same scenario says the main agent SHALL NOT invoke `specflow-advance-bundle` for X beyond the earlier `in_progress` transition (X stays in `in_progress`). | Intentional per proposal reclarify C6: this change introduces the new bundle statuses `subagent_failed` and `integration_rejected` so `/specflow.fix_apply` can distinguish subagent execution failure from main-agent integration rejection. The baseline clause is replaced by this change's MODIFIED block. | 2026-04-22T04:54:00Z |
