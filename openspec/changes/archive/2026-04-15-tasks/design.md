## Context

The specflow repository already ships a purpose-built CLI for advancing bundle statuses: [`specflow-advance-bundle`](../../../src/bin/specflow-advance-bundle.ts). Internally it wraps `advanceBundleStatus` (`src/lib/task-planner/advance.ts`), which handles schema validation, child-task normalization on terminal transitions, atomic write-to-temp + rename of both `task-graph.json` and `tasks.md`, and structured stderr audit logging of every `task_status_coercion`. The behavior is already specified by the `task-planner` spec ([openspec/specs/task-planner/spec.md](../../specs/task-planner/spec.md)).

The problem is that the user-facing `/specflow.apply` command guide does not tell the implementing agent to use this CLI. Step 1 of `specflow.apply` — authored in `src/contracts/command-bodies.ts` and rendered to `dist/package/global/commands/specflow.apply.md` — says only "update the bundle status in `task-graph.json` (`pending → in_progress → done`) and re-render `tasks.md`". That prose is under-specified: the agent interprets it literally and writes ad-hoc `node -e '…fs.readFileSync… bundle.status = "done"… fs.writeFileSync…'` scripts per bundle (see the issue body). These scripts bypass:

- `validateTaskGraph` schema checks,
- `advanceBundleStatus` status-transition rules,
- child-task normalization on terminal transitions,
- atomic two-file persistence,
- coercion audit logging.

Each omission re-introduces exactly the drift the task-planner spec was written to prevent. Symptoms observed in prior runs include `tasks.md` that disagrees with `task-graph.json` after a manual edit, and bundles landing in `done` with children still marked `pending`.

The issue ([skr19930617/specflow#147](https://github.com/skr19930617/specflow/issues/147)) asks the straight-line fix: if the CLI exists, the slash command should use it; never hand-roll Node scripts for this. The proposal confirms the CLI already exists and scopes this change to **wiring + contract + regression test**, not new CLI or new library code.

## Goals / Non-Goals

**Goals:**

- Rewrite the `specflow.apply` → "Step 1: Apply Draft and Implement" body in `src/contracts/command-bodies.ts` so that when `task-graph.json` is present and schema-valid, every bundle status transition MUST go through `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`. Inline `node -e` / `jq` / manual writes in this path are explicitly prohibited.
- Encode a three-way pre-apply detection rule (absent → legacy fallback; present+valid → CLI-mandatory; present+malformed → fail-fast with error, stay in `apply_draft`).
- Encode fail-fast behavior on non-zero CLI exit: surface JSON envelope, stay in `apply_draft`, no retry, no skip-and-continue.
- Append a single safety-net line to `specflow.fix_apply` → "Important Rules" pointing the fix loop at `specflow-advance-bundle` for any task-graph/tasks.md mutation.
- Strengthen `task-planner` spec to name `specflow-advance-bundle` as the sole mutation entry point for apply-class workflows when a valid `task-graph.json` exists.
- Document `specflow-advance-bundle` in `utility-cli-suite` spec as a first-class distribution CLI (signature, stdout envelope, stderr coercion lines, exit-code contract).
- Add a regression test that asserts the regenerated `dist/package/global/commands/specflow.apply.md` contains the required CLI call and fail-fast language, and does NOT contain example `node -e` / `jq` mutation snippets. Extend `src/tests/generation.test.ts`.

**Non-Goals:**

- No new CLI, no new library code in `src/bin/` or `src/lib/task-planner/`. The existing `specflow-advance-bundle` + `advanceBundleStatus` already implement the behavior this change wires up.
- No automated detection of contract violations in apply review (diff scanning, reviewer-prompt update, orchestrator-level enforcement). Deliberately deferred to a follow-up change.
- No change to `/specflow.apply`'s review gate, `apply_ready` transition, approval flow, or the `specflow-review-apply` orchestrator.
- No deprecation or migration of the existing `task-graph.json`-absent legacy fallback. Legacy changes continue to edit `tasks.md` directly.
- No change to the in-memory `advanceBundleStatus` / `updateBundleStatus` library API, its audit-log shape, or the `TaskGraph` JSON schema.

## Decisions

### D1. Source of truth is `src/contracts/command-bodies.ts`, not the dist file.

The `dist/package/global/commands/specflow.apply.md` file is generated from `src/contracts/command-bodies.ts` via the existing build pipeline. We edit only the TypeScript source and let the build regenerate the markdown. Alternative — editing the dist file directly — was rejected because it would be overwritten on the next build and creates a silent drift vector. The regression test (see D6) enforces that the dist output stays in sync.

### D2. Three-way path detection runs in Step 1, not in the CLI.

Path selection (absent / valid / malformed) belongs in the slash-command guide rather than inside `specflow-advance-bundle`, because the "absent" branch must route to the legacy fallback (editing `tasks.md` directly) — a path the CLI does not and should not handle. Pushing detection into the CLI would either force the CLI to implement legacy `tasks.md` editing (scope creep) or force the agent to detect legacy mode another way (duplicated logic).

Detection semantics codified in the guide:

- **Absent** (`task-graph.json` does not exist) → legacy fallback. Unchanged current behavior: mark tasks in `tasks.md` directly.
- **Present + valid** (`task-graph.json` exists and a trial parse + `validateTaskGraph` would succeed) → CLI-mandatory path. Every transition via `specflow-advance-bundle`.
- **Present + malformed** (`task-graph.json` exists but fails schema validation or JSON parse) → fail-fast. The agent surfaces the error, stays in `apply_draft`, and does NOT silently fall through to legacy mode.

Alternative considered: collapse "malformed" into "absent" (i.e., fall back to legacy). Rejected — it would mask a real failure mode (stale or corrupted task graph) as a silent downgrade, exactly the kind of drift this change is trying to prevent. Fail-fast forces the user to fix the graph or regenerate it.

In practice, the agent does not need to pre-validate the graph — the CLI itself validates on every invocation. So the guide's detection rule is operationally: "if the file does not exist, legacy; otherwise, call the CLI on the first transition, and if it returns a schema error, treat that as the malformed branch and abort." That is: **the CLI is the validator of record**, and the guide only decides legacy-vs-CLI based on file presence.

### D3. All four transitions go through the CLI; no allowlist.

Requiring the CLI only for certain transitions (e.g., only `→ done`) would create ambiguity about who records `pending → in_progress` — the CLI or the agent. That ambiguity is how free-form instructions slide back into ad-hoc scripts. All four logical transitions (`pending → in_progress`, `in_progress → done`, `pending → skipped`, `pending → done` direct) MUST go through `specflow-advance-bundle`. Single mutation path → single audit trail → no drift.

### D4. Fail-fast on CLI error, never auto-retry or skip-and-continue.

When `specflow-advance-bundle` exits non-zero:

- The apply stops at the failing bundle. Subsequent bundles in the same Step 1 invocation are NOT advanced.
- The CLI's stdout JSON error envelope is surfaced to the user verbatim.
- The run remains in `apply_draft`.
- The guide does NOT document retry or skip-and-continue.

Rationale: every CLI error surfaces a real discrepancy — a stale bundle id after design revision, a malformed `task-graph.json`, an invalid transition caused by a prior manual edit, or a filesystem error. Retrying with identical arguments will produce the same error. Skipping subsequent bundles would complete an apply against an inconsistent task graph. The correct response is human judgment: user inspects, decides between regenerating the task graph, manually correcting `task-graph.json` (note: outside apply-class workflows, per D5), or invoking `/specflow.fix_apply`.

### D5. Contract violation is codified, detection is deferred.

The `task-planner` spec is strengthened to name `specflow-advance-bundle` as the sole mutation entry point for apply-class workflows. Direct writes from those workflows are labeled a contract violation. But this change does NOT implement any automated detection — no diff scanning in apply review, no reviewer-prompt updates, no orchestrator-level file-write monitoring.

Rationale: detection has a meaningfully larger design surface (what counts as "an apply-class workflow" at detection time? how does the reviewer see intermediate edits that happened inside a single apply run? does `specflow-review-apply` need to parse the audit log?). Coupling detection into this change would bloat its scope and force design decisions we can make better in isolation. Instead, this change locks in the contract; a follow-up change tracked separately can add detection when the right approach is clearer.

Operationally: until detection lands, the contract acts as a reviewer-facing rule ("if you notice a `node -e` script mutating task-graph.json in the diff, raise a high-severity finding"). That is acceptable because the main driver of violations is the slash-command guide itself telling the agent to do free-form edits — which this change fixes at the source.

### D6. Regression test against the dist output.

The generated `dist/package/global/commands/specflow.apply.md` is the artifact the CLI end user (another agent) actually reads. If `command-bodies.ts` and the dist file drift, the user-facing guide is wrong even when the source looks right. We add a test in `src/tests/generation.test.ts` that reads the dist file and asserts:

Positive:
- Contains literal `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`
- Contains language about fail-fast on non-zero CLI exit
- Contains the three-way detection rule (absent / present+valid / malformed)
- Contains the prohibition of inline mutation (explicit mention of `node -e` is disallowed)

Negative:
- Does NOT contain an example `node -e` snippet that reads `task-graph.json` and mutates `bundle.status` or `tasks[*].status` (i.e., a line matching `/node -e/` with `task-graph.json` in the same snippet)
- Does NOT contain a `jq` expression that rewrites a `status` field in `task-graph.json`

Similarly, a second, smaller assertion against `dist/package/global/commands/specflow.fix_apply.md` confirms the one-line safety-net reference to `specflow-advance-bundle` is present in its "Important Rules".

This test is listed as part of done-criteria per the proposal.

### D7. `specflow.fix_apply` gets one line, not a flow change.

`specflow.fix_apply` delegates all fix logic to the `specflow-review-apply fix-review` orchestrator and never directly edits `task-graph.json`. We do NOT rewrite its flow. We append one line in "Important Rules":

> "If the fix loop needs to update `task-graph.json` or `tasks.md`, use `specflow-advance-bundle`; inline edits are a contract violation per `task-planner`."

This is a cheap safety net that costs near zero and closes the single remaining loophole (an agent deciding to mutate task-graph while inside a fix loop's impl re-run).

## Risks / Trade-offs

- **[Risk]** A change elsewhere in the codebase adds new apply-class workflows that edit `task-graph.json` directly. The codified contract catches this in review, but only if the reviewer applies it. → **Mitigation:** follow-up change for automated detection (tracked). In the interim, the concentration of task-graph mutation in `src/bin/specflow-advance-bundle.ts` makes grep-based reviews cheap.
- **[Risk]** The build pipeline could legitimately update the dist file in a way that is unrelated to the apply guide, breaking the regression test. → **Mitigation:** assertions are keyed on specific substrings (CLI call, fail-fast language) rather than whole-file equality; unrelated regenerations do not disturb them.
- **[Risk]** An agent misreads "fail-fast" and leaves the user at an unrecoverable state after the first CLI error. → **Mitigation:** the guide explicitly states the recovery paths (manual correction / regenerate task-graph / `/specflow.fix_apply`), and the error message surfaced comes from the CLI's JSON envelope which already identifies the failure cause.
- **[Risk]** Agents still writing `node -e` snippets despite the new language, because they learned the habit from prior runs or from unrelated tool suggestions. → **Mitigation:** the regression test guarantees the dist file's negative assertions hold — no example `node -e` mutation snippets exist in the guide to be copied. Prohibition is stated explicitly, not just by omission.
- **[Trade-off]** Not implementing automated violation detection in this change leaves a window where a misbehaving agent can still bypass the CLI. We accept this to keep this change small and the contract crisp. The detection follow-up has a clearer design brief once this contract is in place.
- **[Trade-off]** Strict fail-fast on malformed `task-graph.json` (instead of silently falling back to legacy) means a previously-working apply might now abort if someone manually corrupts the graph. This is deliberate: silent-downgrade is exactly the drift we are eliminating.

## Migration Plan

No runtime migration. Existing active changes (with or without `task-graph.json`) work unchanged under the new guide:

- Changes with a valid `task-graph.json` start using `specflow-advance-bundle` on the next `/specflow.apply` invocation.
- Changes without `task-graph.json` continue in legacy fallback with zero code path change.
- Changes with a malformed `task-graph.json` would have silently drifted before; now they fail fast on first CLI call, which is a deliberate improvement.

Deployment: ship `command-bodies.ts` edit + regenerated dist files + new regression test + spec deltas in a single PR. Because `dist/` artifacts are committed (per repo convention), the PR diff includes the regenerated markdown, making the change auditable.

Rollback: revert the PR. `specflow-advance-bundle` and `advanceBundleStatus` are untouched, so reverting restores the old free-form Step 1 language without regressing any library behavior.

## Open Questions

None blocking implementation. Two items for awareness, not gating:

- Should the follow-up "automated violation detection" change also cover inline edits to `task-graph.json` outside apply-class workflows (e.g., an agent tweaking the graph during `/specflow.design`)? Out of scope here; to be decided when that follow-up is scoped.
- Should `specflow-advance-bundle` be surfaced in `specflow-help` / README as part of the `utility-cli-suite` registration? Decision deferred to the implementation bundle — if trivial (one README line, help output already correct), include it; otherwise open a follow-up.

## Concerns

Four user-facing concerns resolve in this change, in dependency order:

1. **`/specflow.apply` apply loop authoritatively uses the CLI.** Problem: current free-form Step 1 language causes agents to hand-roll `node -e` scripts that bypass schema validation, normalization, atomic persistence, and audit logging. Resolution: Step 1 body in `command-bodies.ts` rewritten around the three-way detection rule and CLI-mandatory instruction.

2. **Fail-fast on CLI error is explicit.** Problem: without explicit language, an agent seeing a CLI error might retry, skip, or improvise. Resolution: Step 1 body names the recovery contract (surface envelope, stay in `apply_draft`, no retry, no skip).

3. **`task-planner` and `utility-cli-suite` specs codify the contract.** Problem: behavior is documented in one place (the command guide) but needs to be a cross-cutting rule that applies review, future refactors, and alternate surfaces can rely on. Resolution: spec deltas add requirements to both capabilities.

4. **Dist regeneration does not drift from source.** Problem: a future edit to `command-bodies.ts` could silently regress the guide without anyone noticing until an apply run breaks. Resolution: regression test in `generation.test.ts` asserts the dist file contains the CLI call and fail-fast language, and does NOT contain example `node -e` mutation snippets.

## State / Lifecycle

No new state. All state transitions live in the existing run-state machine:

- `apply_draft` is the entry phase for Step 1. It remains the phase the run returns to when the apply is interrupted (CLI error, validation failure, malformed task-graph) or explicitly revised. No new phases introduced.
- `task-graph.json` lifecycle is unchanged: generated from `design.md` during `/specflow.design` via `specflow-generate-task-graph`, mutated during `/specflow.apply` via `specflow-advance-bundle`, consumed by rendering logic. This change narrows the allowed mutation path; it does not change when the file is created or destroyed.
- Bundle status transitions remain the four-state enum (`pending | in_progress | done | skipped`). Per-task status continues to be coerced on terminal transitions by `updateBundleStatus`. No schema revision.
- The run's `apply_draft` → `apply_review` transition still requires the agent to complete all bundles before advancing. On CLI error, the run stays in `apply_draft` as today. No state-machine change.

Persistence-sensitive state: `task-graph.json` and `tasks.md`. Both are written by `specflow-advance-bundle` atomically (write-to-temp + rename), per the existing `task-planner` spec. This change does not alter the atomicity contract.

## Contracts / Interfaces

- **Slash-command guide → CLI (new contract shape in prose, not code).** `specflow.apply` Step 1 body directs the agent to invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`, consume the JSON envelope on stdout, and on non-zero exit surface the envelope and stop. This is an instruction contract in markdown, rendered from `command-bodies.ts`.
- **CLI ↔ library.** `specflow-advance-bundle` calls `advanceBundleStatus` (in `src/lib/task-planner/advance.ts`) with a `writer` that uses the repo's local FS artifact store. Unchanged.
- **Library ↔ files.** `updateBundleStatus` returns a new `TaskGraph`; the writer persists `task-graph.json` via atomic rename and re-renders `tasks.md`. Unchanged.
- **CLI ↔ caller (stdout / stderr / exit code).** Stdout: exactly one JSON document per invocation — success or error envelope. Stderr: zero or more `{event: "task_status_coercion", ...}` JSON lines, one per actual child-task coercion. Exit: `0` on success, `1` on any error. Already codified by the existing binary; the `utility-cli-suite` spec delta documents this as the first-class contract.
- **Spec delta granularity.** Each of the three spec deltas uses ADDED Requirements (not MODIFIED) because none of the new requirements rewrite an existing requirement's behavior — they add new invariants on top.

No new inter-module interfaces. No new public APIs in library code.

## Persistence / Ownership

- `openspec/changes/<CHANGE_ID>/task-graph.json` and `openspec/changes/<CHANGE_ID>/tasks.md` — owned (for writes, in apply-class workflows) by `specflow-advance-bundle`. This is the ownership assertion this change is codifying. Other lifecycle writers (`specflow-generate-task-graph` for creation) are unaffected; they run during `/specflow.design`, not `/specflow.apply`.
- `src/contracts/command-bodies.ts` — owned by the contract registry. Edited by this change.
- `dist/package/global/commands/specflow.apply.md` and `specflow.fix_apply.md` — generated; regenerated as part of this change's build output.
- `openspec/specs/slash-command-guides/spec.md`, `openspec/specs/task-planner/spec.md`, `openspec/specs/utility-cli-suite/spec.md` — modified at archive time via the delta specs in `openspec/changes/tasks/specs/`.
- `src/tests/generation.test.ts` — extended with two new assertion blocks (apply dist and fix_apply dist).

No database, no external storage.

## Integration Points

- **Build pipeline.** `dist/package/global/commands/*.md` files are regenerated from `src/contracts/command-bodies.ts` via the existing build (`dist/build.js`). This change assumes the pipeline continues to work unchanged; the only new coupling is that the regression test reads from `dist/` and so requires the build to have run before tests. This is already the case for the existing `generated manifest and install plan reflect contracts` and `generated slash commands include run-state hook injections` tests in `generation.test.ts`.
- **Test runner.** Node's built-in `node:test` runner. New assertions use `assert.ok(...)` + `assert.ok(!...)` patterns identical to the existing tests in that file.
- **OpenSpec archive.** When this change archives, the three spec deltas land in `openspec/specs/<capability>/spec.md`. Standard OpenSpec archive flow; no new integration.
- **`specflow-review-apply` orchestrator.** Unchanged. The fix_apply safety-net line is pure markdown in the guide; no orchestrator logic change.

## Ordering / Dependency Notes

Execution order (one sequential bundle of work; no independent parallel slices big enough to justify multiple bundles):

1. **Edit `src/contracts/command-bodies.ts`** first. This is the single authoritative edit.
   - Rewrite `specflow.apply` → "Step 1: Apply Draft and Implement" body (detection rule, CLI-mandatory, fail-fast).
   - Append one safety-net line to `specflow.fix_apply` → "Important Rules".
2. **Run the build** to regenerate `dist/package/global/commands/specflow.apply.md` and `specflow.fix_apply.md`. These regenerated files are committed to the repo per convention.
3. **Write the three spec deltas** (already done in the spec phase; no work here — the task graph should reflect that specs are already produced). This can proceed in parallel with step 1 conceptually but is already complete.
4. **Extend `src/tests/generation.test.ts`** with positive + negative assertions against the regenerated dist files.
5. **Run the test suite.** All existing tests MUST continue to pass, and the new assertions MUST pass.

No cross-bundle dependency beyond the classic source → build → test chain. If the task-planner chooses to split into bundles, the natural split is:

- **Bundle A (contract + docs):** edit `command-bodies.ts`, regenerate dist, update spec deltas — all source-level text edits. One logical unit because the dist regeneration depends on the source edit and the spec deltas share the same semantic "contract wiring" theme.
- **Bundle B (regression test):** extend `generation.test.ts`. Depends on Bundle A because the positive assertions only pass once the dist files are regenerated.

If splitting is not beneficial at the task-planner granularity, it is acceptable to do everything in one bundle. Either decomposition is fine; the reviewer's criterion should be "is each bundle independently committable without breaking main?"

## Completion Conditions

This change is complete when ALL of the following hold:

1. `src/contracts/command-bodies.ts` contains the new `specflow.apply` Step 1 body with:
   - Literal `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` invocation.
   - Explicit three-way detection rule (absent / present+valid / malformed).
   - Fail-fast on CLI error language.
   - Explicit prohibition of `node -e` / `jq` / manual edits in the CLI path.
2. `src/contracts/command-bodies.ts` contains the safety-net line in `specflow.fix_apply` → "Important Rules".
3. `dist/package/global/commands/specflow.apply.md` and `specflow.fix_apply.md` are regenerated and committed; their content reflects (1) and (2).
4. `src/tests/generation.test.ts` contains new assertions covering:
   - apply dist: positive (CLI call, fail-fast phrase, detection rule phrase) and negative (no example `node -e` mutation snippet, no `jq` mutation expression).
   - fix_apply dist: positive (safety-net line mentions `specflow-advance-bundle`).
5. The full test suite passes (new + existing).
6. `openspec validate tasks --type change --json` reports `valid: true` (already reached in the spec phase; should still hold after task graph generation).
7. All three spec deltas in `openspec/changes/tasks/specs/<capability>/spec.md` remain consistent with the implemented `command-bodies.ts` language.

Observable independent review checkpoints (aligned to Bundle A vs Bundle B):

- After Bundle A: a reviewer reading only the regenerated dist files can confirm the apply guide names the CLI, documents fail-fast, and does not contain example inline edit scripts.
- After Bundle B: `node --test src/tests/generation.test.ts` passes the new assertions; a reviewer can run the tests locally to confirm drift-prevention coverage.

The change is NOT complete if:

- The dist files contain stale text that contradicts `command-bodies.ts`.
- The test asserts only the positive cases (allowing a future regression to re-introduce `node -e` examples without detection).
- Any of the three spec deltas accidentally document behavior that differs from the `command-bodies.ts` edit (e.g., different status enum values, wrong exit-code semantics).
