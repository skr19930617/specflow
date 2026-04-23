## Why

`/specflow.apply` already dispatches subagents at the bundle/window level, but the contract does not define an isolated workspace boundary per subagent execution. Parallel bundle implementation today shares a single mutable working tree, which risks write collisions, cross-bundle side effects, hard recovery after fail-fast stops, ambiguous artifact attribution, and weak integration control between subagent output and bundle completion.

We want to add an **optional isolated-worktree execution mode** so dispatched subagents run in ephemeral git worktrees, while the main agent remains the **sole workflow-state mutator** and the **integration authority** that validates and imports subagent results. This is an apply-time execution strategy concern — we deliberately do NOT introduce multi-run decomposition.

Source: https://github.com/skr19930617/specflow/issues/182

## What Changes

- Introduce **two bundle execution modes** for `/specflow.apply` (no third mode; `subagent-shared` is explicitly NOT supported):
  - `inline-main`: bundle implemented directly by the main agent in the primary workspace.
  - `subagent-worktree`: bundle dispatched to a subagent running inside a dedicated ephemeral git worktree.
- Extend the dispatcher so execution mode is derived purely from the existing `bundle-subagent-execution` eligibility rule:
  - subagent-eligible bundles (where `apply.subagent_dispatch.enabled = true` and `size_score > threshold`) → `subagent-worktree`.
  - all other bundles → `inline-main`.
  - No additional signals (side-effect risk, file-touch heuristics) are introduced in this change; extending signals is deferred to Phase 2.
- Define a **worktree lifecycle** owned by the main agent:
  1. Main agent creates an ephemeral worktree at `.specflow/worktrees/<run-id>/<bundle-id>/` via `git worktree add` **from the current HEAD at worktree-creation time** — no rebase, no shared base snapshot; later-created worktrees naturally observe imports from earlier-settled bundles in the same run.
  2. Main agent prepares the bundle context package (reusing `bundle-subagent-execution` assembly rules).
  3. Main agent advances the bundle to `in_progress` via `specflow-advance-bundle`.
  4. Subagent executes only inside the worktree and returns a structured result: `status` (`"success"` | `"failure"`), `produced_artifacts` (set of repo-relative paths), and `error` on failure.
  5. Main agent inspects the worktree diff via `git -C <worktree> diff --binary <base-sha>..HEAD` and cross-checks it against `produced_artifacts`.
  6. Main agent imports accepted changes into the main workspace via **git patch import**: `git -C <worktree> diff --binary <base-sha>..HEAD | git apply --binary`. Patch-import coverage SHALL match full git-apply coverage: creates, deletes, modifications, mode changes, renames, binary files.
  7. Only after a successful import does the main agent advance the bundle to `done`.
  8. Worktree cleanup follows the retention policy below.
- Define the **main-agent integration authority** contract. Integration validation in Phase 1 is limited to **diff inspection + produced-artifact cross-check**. The main agent SHALL reject integration when any of the following findings occur:
  - **Undeclared path**: a diff path (added, modified, deleted, or rename-new) that is not present in `produced_artifacts`. Rename matches by the new path; delete by the deleted path; mode-only change counts as a modification. Over-declared entries in `produced_artifacts` (declared paths not touched by the diff) produce a warning but do NOT reject.
  - **Protected-path touch**: any diff path under `openspec/changes/<CHANGE_ID>/task-graph.json`, `openspec/changes/<CHANGE_ID>/tasks.md`, or anywhere under `.specflow/`. These are main-agent-only per existing invariants.
  - **Empty-diff-on-success**: subagent returned `status: "success"` but the worktree diff is empty.
  - **Patch-apply failure**: `git apply --binary` exits non-zero at the repo root. No `--3way` retry in Phase 1.
  - Running lint/tests inside integration is explicitly out of scope for Phase 1 (may be added later via a hook).
- Introduce **new bundle statuses** for failure classification (expanding `task-planner`'s status enum):
  - `subagent_failed`: subagent returned `status: "failure"`.
  - `integration_rejected`: subagent returned `status: "success"` but main-agent integration validation (any reason listed above) rejected.
  - Both statuses are terminal for the bundle within this apply invocation and trigger the existing fail-fast behavior (apply STOPS, run stays in `apply_draft`). Recovery paths via `/specflow.fix_apply` distinguish these two states explicitly.
- Define **worktree retention policy** (fixed in Phase 1, not configurable):
  - On subagent success AND successful integration: worktree SHALL be removed immediately (`git worktree remove`).
  - On `subagent_failed` OR `integration_rejected`: worktree SHALL be retained at its path so `/specflow.fix_apply` and manual inspection can diagnose.
- Define **worktree-unavailable behavior**: if `git worktree add` fails for any reason (binary missing, path collision unable to reclaim, filesystem/permission error) on a bundle that is subagent-eligible, the dispatcher SHALL fail-fast the entire apply. The run SHALL remain in `apply_draft`. No silent fallback to `inline-main`. The error SHALL identify the attempted worktree path and the underlying git/OS error.
- Preserve existing invariants unchanged:
  - Single-run model for `/specflow.apply`.
  - Main agent is the sole caller of `specflow-advance-bundle`.
  - Subagents SHALL NOT edit `task-graph.json` or `tasks.md`.
  - Fail-fast and chunking semantics in `bundle-subagent-execution` remain.
  - Default behavior unchanged when `apply.subagent_dispatch.enabled = false` (everything runs `inline-main`; no worktrees created).

Out of scope for this change:
- Multi-run apply decomposition.
- Redefining `/specflow.decompose`.
- Autonomous git merge performed by subagents.
- Making worktree execution mandatory when dispatch is disabled.
- Additional dispatch signals beyond `size_score`.
- Running lint/tests as part of integration validation.
- Configurable retention policy.
- `git apply --3way` fallback.
- Silent degradation to `inline-main` when worktree creation fails.

## Capabilities

### New Capabilities
- `apply-worktree-integration`: Worktree lifecycle for subagent-dispatched bundles (create from HEAD-at-creation-time → prepare → in_progress → subagent run → inspect → patch import → done → cleanup), the main-agent integration authority contract (diff inspection + produced-artifact cross-check with precise rules for undeclared/protected-path/empty-diff/patch-apply-failure rejection), patch-import mechanism (`git diff --binary | git apply --binary` covering creates/deletes/mods/mode/renames/binary), worktree path convention (`.specflow/worktrees/<run-id>/<bundle-id>/`), retention policy (remove on success; retain on failure), and worktree-unavailable fail-fast behavior.

### Modified Capabilities
- `bundle-subagent-execution`: Add the two-mode bundle execution model (`inline-main` vs `subagent-worktree`), clarify that subagent-eligible bundles route to `subagent-worktree`, and clarify that bundle `done` now requires main-agent integration success (not just subagent `status: success`). Replace the existing fail-fast clause that kept failed bundles in `in_progress` with a clause that transitions them to the new `subagent_failed` / `integration_rejected` statuses. All other dispatch semantics (eligibility rule, window/chunk processing, sole-mutation-caller, context-package assembly) remain unchanged.
- `task-planner`: Extend the bundle status enum from `"pending" | "in_progress" | "done" | "skipped"` to also include `"subagent_failed"` and `"integration_rejected"`. Both new statuses are non-terminal for the run (the run stays in `apply_draft` and can be recovered) but terminal for the bundle within the current apply invocation. `updateBundleStatus` SHALL reject transitions out of these statuses except via `/specflow.fix_apply` or an explicit operator reset. Child-task normalization rules for the new statuses: no automatic coercion (treated like `in_progress` — informational child statuses preserved).

## Impact

- Code:
  - `/specflow.apply` dispatcher: branch between `inline-main` and `subagent-worktree` per bundle based on existing eligibility.
  - New worktree helper (CLI or library): create (`git worktree add` from HEAD), prepare context, inspect (`git diff --binary`), patch-import (`git apply --binary`), cleanup (`git worktree remove`).
  - Main-agent integration step: compute diff, run the four rejection checks, apply patch, handle rejection.
  - `task-planner`: widen status enum; expose the two new statuses through `updateBundleStatus`; update `tasks.md` rendering to represent them.
- Config:
  - No new config keys required in Phase 1 (path, retention, and worktree-unavailable behavior are all fixed).
- Contracts:
  - `bundle-subagent-execution` spec gains execution-mode clauses and replaces the "failed stays in_progress" clause with the new-status clauses.
  - `task-planner` spec gains the two new status values and their transition/normalization rules.
  - `apply-worktree-integration` spec is new and owns worktree lifecycle + integration authority + retention + worktree-unavailable behavior.
- Tooling:
  - Host must support `git worktree` (standard since git 2.5).
  - `/specflow.fix_apply` guidance updated to reference retained worktrees at `.specflow/worktrees/<run-id>/<bundle-id>/` and to branch recovery on the `subagent_failed` vs `integration_rejected` status.
  - Any UI/watch TUI that renders bundle status must handle the two new values.
- Backward compatibility:
  - When `apply.subagent_dispatch.enabled = false` (default), every bundle runs `inline-main` and no worktree is created — behavior identical to today.
  - Existing `task-graph.json` files using only the old four-value enum remain valid; the new statuses are only written by the extended dispatcher.
  - When enabled, only dispatched bundles change path (worktree instead of shared tree); inline bundles behave as today.
