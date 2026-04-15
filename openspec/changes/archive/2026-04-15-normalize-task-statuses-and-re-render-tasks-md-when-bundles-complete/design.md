## Context

`task-graph.json` is the single source of truth for bundle/task state; `tasks.md` is a deterministic projection of it. Today's implementation splits that contract in a subtle way:

- `src/lib/task-planner/status.ts#updateBundleStatus()` only rewrites `bundle.status`. Child task statuses are never touched.
- `src/lib/task-planner/render.ts#renderTasksMd()` reads each task's `status` to draw its checkbox.
- As a result, a bundle can legitimately reach `"done"` while every child task remains `"pending"`. On archive, `tasks.md` then shows an inconsistent artifact: a header labeled "✓" with unchecked checkboxes underneath.

This is a **contract gap**, not a renderer bug. The fix is to tighten the bundle-status update contract so that terminal bundle transitions coerce child task statuses into a matching terminal state, preserving the "bundle = execution truth, tasks = informational" model and the existing immutable update discipline.

**Relevant files:**
- `src/lib/task-planner/status.ts` — pure `updateBundleStatus()` function
- `src/lib/task-planner/render.ts` — `renderTasksMd()`, reads `task.status` directly
- `src/lib/task-planner/types.ts` — `TaskGraph`, `Bundle`, `Task`, `BundleStatus`, `TaskStatus`
- `src/lib/task-planner/index.ts` — public barrel
- `src/tests/task-planner-core.test.ts` — existing unit tests for `updateBundleStatus`
- Apply-phase caller (persistence + logging) — wired by an earlier change (archive: `move-task-generation-from-openspec-passthrough-to-specflow-owned-task-planner`)

## Goals / Non-Goals

**Goals:**

- Close the terminal-bundle/pending-child contract gap so that, after a bundle reaches `"done"` or `"skipped"`, the persisted `task-graph.json` and the rendered `tasks.md` are internally consistent.
- Keep `updateBundleStatus()` a **pure function** — no I/O, no hidden logger coupling, deterministic output.
- Preserve backwards-compatible return shape for `updateBundleStatus()` callers that only consume `taskGraph`.
- Provide enough structured information on the return value for the apply-phase caller to emit the required audit log.
- Preserve existing immutable-update behavior: the input `TaskGraph` is never mutated.
- Honor the existing atomic-write pattern for `task-graph.json` persistence (write-to-temp + rename).

**Non-Goals:**

- No new per-task execution tracking. `Task.status` remains informational; terminal bundle transitions drive it.
- No widening of the allowed bundle-status transition set. `done → pending` etc. remain rejected.
- No schema/validator change. `validateTaskGraph()` is not taught to reject pre-existing mismatched graphs; the fix is forward-only.
- No retroactive rewrite of already-archived `tasks.md` files. Pre-change archives remain as-is.
- No change to task graph generation (`generateTaskGraph`, windowing, completion detection).

## Decisions

### D1. Normalization lives inside `updateBundleStatus()` (not a separate helper)

Put the child-coercion logic directly in `src/lib/task-planner/status.ts#updateBundleStatus`. When the target status is `"done"` or `"skipped"`, rebuild the bundle's `tasks` array with each `task.status` set to the target value, then rebuild the `bundles` array immutably as today.

**Why:** The spec ties normalization to the bundle status update — they are one semantic operation. Putting them in the same pure function guarantees "you cannot end up with a terminal bundle whose children disagree" at the type level of the return value. A caller who does `result.taskGraph` always gets a consistent graph.

**Alternative considered — separate `normalizeBundleChildren()` helper called by the caller:** Rejected. It pushes the invariant into caller discipline, re-opening the possibility that some apply path forgets to call it. Same failure mode the issue is trying to eliminate.

**Alternative considered — normalize inside the renderer (`renderTasksMd`):** Rejected. It hides the fix in the projection layer, leaves `task-graph.json` itself still inconsistent on disk, and contradicts the "task graph is the single source of truth" rule.

### D2. Extend `StatusUpdateResult` with a `coercions` array for observability

`updateBundleStatus()` currently returns:

```ts
// status.ts (today)
export interface StatusUpdateResult {
  readonly ok: true;
  readonly taskGraph: TaskGraph;
}
```

Add:

```ts
export interface TaskStatusCoercion {
  readonly bundleId: string;
  readonly taskId: string;
  readonly from: TaskStatus;
  readonly to: TaskStatus;
}

export interface StatusUpdateResult {
  readonly ok: true;
  readonly taskGraph: TaskGraph;
  readonly coercions: readonly TaskStatusCoercion[];
}
```

`coercions` contains one entry **per child task whose status actually changed** (i.e., was not already equal to the target terminal status). Non-terminal transitions always return an empty array. No-op coercions (child already matched) are not emitted.

The apply-phase caller iterates `result.coercions` and emits one structured log line per entry (`bundle_id`, `task_id`, `from_status`, `to_status`). The pure function stays pure; the caller owns the logging side effect.

**Why:** Keeps `updateBundleStatus()` a pure, testable function while still making audit data available. Unit tests assert on `coercions` without mocking a logger. Empty array → no log → matches the spec requirement that no-op coercion is silent.

**Alternative considered — accept a logger callback argument:** Rejected. Breaks purity, complicates testing, introduces a hidden dependency that every caller must wire correctly.

**Alternative considered — emit a log directly from `status.ts`:** Rejected. Same purity concern, plus couples the task-planner library to a concrete logging abstraction it does not own today.

### D3. Empty-bundle terminal transition is a silent no-op for children

If `bundle.tasks.length === 0`, the bundle's status is still updated to the terminal value; `coercions` is returned as `[]`. No error, no log.

**Why:** Vacuously satisfies the "every child matches" invariant. Matches the clarify answer (C1). Rules out a false failure mode for legitimately empty planning bundles.

### D4. Conflicting prior terminal child statuses are force-coerced

A child that already holds `"done"` when the bundle moves to `"skipped"` (or vice versa) is rewritten to match the bundle's new terminal status. A `coercions` entry is emitted because status actually changed.

**Why:** Per spec, the bundle is the authoritative execution unit and child status is informational. Force-coercion is the only policy consistent with that model. The coercion entry in the return value makes the rewrite auditable.

### D5. Renderer stays unchanged

`renderTasksMd()` continues to consume `task.status` directly — no special case for terminal bundles. This is intentional: once `updateBundleStatus()` normalizes the graph, the renderer's per-task reading is correct, and the projection remains a trivial function of the graph.

**Why:** Single point of truth for the invariant. If normalization lived only in the renderer, `task-graph.json` on disk would still carry the mismatched state, and any alternative renderer (external consumer, surface event payload) would have to re-implement the fix.

### D6. Persistence is caller's responsibility; atomic write is reused

`updateBundleStatus()` does no I/O. The caller:

1. Calls `updateBundleStatus(graph, bundleId, newStatus)`
2. If `result.ok`, writes `result.taskGraph` to `task-graph.json` using the existing atomic-write pattern (write to `task-graph.json.tmp`, then `rename` to `task-graph.json`).
3. Calls `renderTasksMd(result.taskGraph)` and writes `tasks.md` (same atomic pattern).
4. For each entry in `result.coercions`, emits a structured log line.

**Why:** Matches existing apply-phase wiring (see archived design: "caller-responsible persistence"). Keeps the pure-function boundary clean and preserves the atomic-write guarantee without bespoke transaction code. Crash mid-write cannot produce a mismatched persisted graph because `result.taskGraph` is already internally consistent before the write starts.

### D7. Validator is untouched

`validateTaskGraph()` does **not** gain a "terminal bundle children must match" check. Rationale: pre-existing archived graphs may violate the invariant; adding the check now would make historical artifacts spuriously invalid. Normalization is applied on every future terminal transition, which forward-fixes the model without breaking old data.

### D8. Public API surface update

Export the new `TaskStatusCoercion` type from `src/lib/task-planner/index.ts` so apply-phase callers can type their audit-log payloads.

## Risks / Trade-offs

- **Risk:** Existing apply-phase callers ignore `result.coercions` and fail to emit audit logs.
  **Mitigation:** Keep the default behavior useful without the audit log (graph is still normalized, `tasks.md` still consistent). Add a task that explicitly updates the apply-phase caller to iterate `coercions`. Covered by a test that asserts the caller emits one log per coercion.

- **Risk:** The additional `coercions` field in the return type is a structural change to a public API.
  **Mitigation:** It is an additive change — existing destructuring callers (`const { taskGraph } = result`) remain source-compatible. Any caller that narrows via `StatusUpdateResult` will get a non-breaking widening (new required field, but consumers generally only read the fields they care about; TS excess-property checks don't apply to read sites). Document in release notes; covered by existing tests.

- **Risk:** Silent force-coercion of a prior terminal child (e.g., child `done` → coerced to `skipped`) could hide a user-intent mismatch upstream.
  **Mitigation:** The audit log entry for every actual status change (D2) surfaces this. Operators see `(bundle_id, task_id, "done", "skipped")` in the log and can investigate upstream status tracking.

- **Risk:** A future requirement to allow reverse transitions (`done → in_progress` on re-open) would conflict with this design.
  **Mitigation:** Explicitly out of scope (clarify C4). If a future change adds reverse transitions, it will need its own normalization/re-expansion rule — this design does not paint itself into a corner because normalization is driven by the destination status, not the source.

- **Trade-off:** Putting normalization in `updateBundleStatus()` slightly couples two operations (bundle status + child coercion). That coupling is the **point** of the fix; it is the contract.

## Migration Plan

- No data migration. The change is forward-only.
- Pre-existing archived `tasks.md` files remain unchanged.
- Pre-existing `task-graph.json` files with a terminal bundle and non-matching children are not retroactively normalized. Since terminal bundles cannot leave their state under the existing transition rules, the mismatch will persist until a future change (if any) re-runs normalization across all graphs.
- Rollback strategy: revert the `status.ts` and `index.ts` edits; the pure-function return type change is backwards compatible, so callers keep working.
- No configuration, feature flag, or environment variable.

## Open Questions

None. Every challenge from the proposal (C1–C5) is resolved in the Decisions above. The tasks artifact will flesh out per-file edits and tests.
