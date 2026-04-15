## 1. Extend status update types with coercion metadata ✓

> Introduce TaskStatusCoercion type and extend StatusUpdateResult so callers can audit child-task coercions.

- [x] 1.1 Add TaskStatusCoercion interface (bundleId, taskId, from, to) in status.ts
- [x] 1.2 Extend StatusUpdateResult with readonly coercions: readonly TaskStatusCoercion[]
- [x] 1.3 Re-export TaskStatusCoercion from src/lib/task-planner/index.ts

## 2. Normalize child task statuses inside updateBundleStatus ✓

> Coerce child task statuses to the terminal bundle status on done/skipped transitions while preserving purity and immutability.

> Depends on: extend-status-update-types

- [x] 2.1 Detect terminal target status ('done' | 'skipped') inside updateBundleStatus
- [x] 2.2 Rebuild bundle.tasks immutably with each task.status set to target terminal value
- [x] 2.3 Collect one TaskStatusCoercion entry per child whose status actually changed
- [x] 2.4 Return empty coercions array for non-terminal transitions and for empty-bundle cases
- [x] 2.5 Force-coerce conflicting prior terminal child statuses (e.g. done → skipped) and emit coercion entries
- [x] 2.6 Ensure input TaskGraph is never mutated and bundles array is rebuilt immutably

## 3. Unit tests for status normalization and coercion reporting ✓

> Cover terminal transitions, non-terminal transitions, empty bundles, conflicting prior terminal states, and immutability guarantees.

> Depends on: normalize-children-in-update-bundle-status

- [x] 3.1 Test: bundle → done coerces all pending children to done and reports coercions
- [x] 3.2 Test: bundle → skipped coerces all pending children to skipped and reports coercions
- [x] 3.3 Test: no-op children (already matching target) produce no coercion entries
- [x] 3.4 Test: non-terminal transition returns empty coercions and leaves task statuses untouched
- [x] 3.5 Test: empty-bundle terminal transition updates bundle status and returns empty coercions
- [x] 3.6 Test: conflicting prior terminal child (done when bundle → skipped) is force-coerced and logged
- [x] 3.7 Test: input TaskGraph reference and nested arrays are not mutated
- [x] 3.8 Test: rejected transitions (e.g. done → pending) still return ok:false with no coercions

## 4. Renderer consistency tests after normalization ✓

> Verify renderTasksMd produces a tasks.md whose checkboxes match the bundle header after a terminal transition.

> Depends on: normalize-children-in-update-bundle-status

- [x] 4.1 Test: after bundle → done, rendered tasks.md shows checked boxes under the done header
- [x] 4.2 Test: after bundle → skipped, rendered tasks.md reflects skipped state consistently
- [x] 4.3 Confirm renderTasksMd remains unchanged (no special-casing added)

## 5. Wire coercions through the apply-phase caller ✓

> Persist the normalized graph, re-render tasks.md atomically, and emit one structured log per coercion.

> Depends on: normalize-children-in-update-bundle-status, extend-status-update-types

- [x] 5.1 Invoke updateBundleStatus and branch on result.ok in the apply-phase caller
- [x] 5.2 Persist result.taskGraph to task-graph.json using existing atomic write-temp+rename pattern
- [x] 5.3 Render tasks.md via renderTasksMd(result.taskGraph) and write atomically
- [x] 5.4 Emit one structured log line per TaskStatusCoercion with bundle_id, task_id, from_status, to_status
- [x] 5.5 Ensure no log is emitted when coercions is empty (no-op silence)

## 6. Integration tests for apply-phase persistence and logging ✓

> Assert end-to-end that a terminal bundle transition persists a consistent graph, re-renders tasks.md, and logs exactly one line per coercion.

> Depends on: apply-phase-caller-integration

- [x] 6.1 Test: apply-phase terminal transition writes consistent task-graph.json (bundle + children match)
- [x] 6.2 Test: apply-phase terminal transition writes tasks.md whose checkboxes match bundle header
- [x] 6.3 Test: exactly one audit log line is emitted per coercion entry
- [x] 6.4 Test: no audit log lines on non-terminal transitions or when all children already matched
- [x] 6.5 Test: atomic write pattern is used for both task-graph.json and tasks.md

## 7. Repository verification and release note ✓

> Run formatting, linting, type checking, tests, and build; document the additive API change.

> Depends on: unit-tests-for-normalization, renderer-consistency-tests, apply-phase-integration-tests

- [x] 7.1 Run repository-defined format, lint, type-check, test, and build commands for affected scope
- [x] 7.2 Fix any failures surfaced by verification steps
- [x] 7.3 Add release note describing additive StatusUpdateResult.coercions and new TaskStatusCoercion export
