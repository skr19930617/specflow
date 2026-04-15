## Why

The `task-graph.json` ↔ `tasks.md` contract has a gap at bundle completion. Today the apply path can drive a bundle to `status = "done"` while every child `task.status` remains `"pending"`. Because `tasks.md` is re-rendered directly from per-task status, archived changes end up showing unchecked checkboxes underneath a "done" bundle — a visibly inconsistent artifact.

The current `task-planner` spec defines bundle status transitions and re-render obligations, but it does not define what child task statuses must look like when the parent bundle reaches a terminal state. We need to close that contract gap so the rendered checklist always matches the bundle's executional truth.

Source: github issue [skr19930617/specflow#142](https://github.com/skr19930617/specflow/issues/142).

## What Changes

- Define **bundle-completion normalization semantics**: when a bundle transitions to a terminal status, all of its child tasks SHALL be coerced to a status consistent with that terminal state before persistence.
  - `bundle.status = "done"` → every `tasks[*].status` in that bundle MUST be `"done"`.
  - `bundle.status = "skipped"` → every `tasks[*].status` in that bundle MUST be `"skipped"` (symmetric with the `done` rule; keeps the skipped signal explicit in the rendered `tasks.md`).
- Normalize **on the transition only**, not as a validation invariant. The status-update path coerces child tasks when a bundle moves to a terminal state; the task-graph JSON schema is unchanged and the validator does not reject pre-existing inconsistent graphs.
- Non-terminal transitions (`pending`, `in_progress`) are **out of scope**. Child task statuses underneath a non-terminal bundle are not touched. This preserves the existing "bundle = execution truth, tasks = informational" model and aligns with the issue's non-goal of per-task execution tracking.
- Require the apply / status-update path to normalize child task statuses **before** writing the final `task-graph.json`, so the persisted graph never contains a terminal bundle with mismatched child tasks.
- Require `tasks.md` to be re-rendered from the **normalized** graph, so archived `tasks.md` shows checked (or explicitly skipped) boxes that match the bundle's terminal state.
- No changes to task graph generation prompts, windowing, bundle completion detection, or the renderer's per-task reading of `task.status`.

### Normalization edge cases (from challenge/reclarify)

- **Empty bundle**: A terminal transition on a bundle with zero child tasks is a **no-op** (vacuously satisfies the invariant). The bundle's terminal status is persisted as-is.
- **Conflict policy**: If a child already holds a different terminal status than the bundle's new terminal status (e.g., a child is `done` but the bundle moves to `skipped`), normalization **force-coerces** the child to the bundle's terminal status. The bundle is the authoritative execution unit; per-task state is informational.
- **Observability**: Whenever normalization actually **changes** a child's status, the apply path SHALL emit a structured log entry containing `(bundle_id, task_id, from_status, to_status)`. No-op coercions (child already matches) do not log.
- **Reverse transitions** (terminal → non-terminal, e.g., `done → in_progress`) are **out of scope**. The existing `task-planner` spec already rejects `"done" → "pending"` as an invalid transition, and this change does not broaden the allowed transition set.
- **Atomicity**: `updateBundleStatus` returns a new `TaskGraph` with **both** the bundle status change **and** the normalized child statuses applied in a single in-memory update. The caller persists the whole `task-graph.json` with the existing atomic-write pattern (write-to-temp + rename), then re-renders `tasks.md`. On crash mid-write the persisted graph is either the old state or the fully-normalized new state — never a mismatched middle. The original task graph is not mutated (preserves the immutable-update contract already in the `task-planner` spec).

## Capabilities

### New Capabilities
- None. This change tightens an existing contract rather than introducing a new capability.

### Modified Capabilities
- `task-planner`: extend the bundle-status-update requirement so terminal bundle transitions normalize child task statuses, and require `tasks.md` to be rendered from the normalized graph. Affects the "Apply phase writes back bundle status to task graph" requirement (and any related re-render requirement).

## Impact

- **Specs**: `openspec/specs/task-planner/spec.md` — add normalization scenarios and tighten the re-render requirement.
- **Code (apply / task-graph update path)**: status-update logic must normalize child tasks on terminal transitions; `tasks.md` renderer continues to read per-task status (no renderer-side special case).
- **Tests**: cover (a) normalization on `pending|in_progress → done` coerces all child tasks to `done`, (b) normalization on `pending → skipped` coerces all child tasks to `skipped`, (c) force-coercion of a conflicting prior terminal child (e.g., child `done` + bundle `skipped` → child `skipped`), (d) terminal transition on a bundle with zero tasks is a no-op, (e) coercion that actually changes status emits the audit log line; no-op coercion stays silent, (f) `tasks.md` rendered from the normalized graph shows matching checkbox state, (g) non-terminal transitions (`pending → in_progress`) do NOT touch child task statuses, (h) archived artifacts preserve the normalized state, (i) `updateBundleStatus` returns a new graph without mutating the input.
- **Archived artifacts**: post-change, archived `tasks.md` will reflect completed work consistently. Pre-change archives are not retroactively rewritten.
- **No impact** on task graph generation, windowing, or per-task execution tracking.

### Release notes (additive API surface)

This change is backwards-compatible for existing callers that only consume `result.taskGraph`. New surface:

- `StatusUpdateResult.coercions: readonly TaskStatusCoercion[]` — one entry per child task whose status was rewritten on a terminal bundle transition (empty otherwise). Existing `{ ok, taskGraph }` destructuring continues to work.
- `TaskStatusCoercion` — new interface `{ bundleId, taskId, from, to }` re-exported from `src/lib/task-planner/index.ts`.
- `advanceBundleStatus({ taskGraph, bundleId, newStatus, writer, logger })` — new orchestration helper in `src/lib/task-planner/advance.ts` that calls `updateBundleStatus`, persists the normalized graph and re-rendered `tasks.md` via an injected writer, and emits one log call per coercion via an injected logger.
- `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` — new CLI binary that wires the helper to the local-fs atomic writer and to JSON-line structured audit logging on stderr. Stdout emits an `advance-bundle-result` JSON payload.
