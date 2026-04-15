## MODIFIED Requirements

### Requirement: Apply phase writes back bundle status to task graph

The apply phase SHALL update bundle and task status in `task-graph.json` after execution. The status transitions SHALL be:
- `"pending"` → `"in_progress"`: when bundle execution begins
- `"in_progress"` → `"done"`: when bundle completion check passes
- `"pending"` → `"skipped"`: when explicitly skipped by user or system

The system SHALL provide `updateBundleStatus(taskGraph, bundleId, newStatus)` that returns a new `TaskGraph` with the specified bundle's status updated. The original task graph SHALL NOT be mutated.

When the new bundle status is a **terminal** status (`"done"` or `"skipped"`), `updateBundleStatus` SHALL also **normalize all child task statuses** within that bundle so they match the bundle's terminal status in the returned `TaskGraph`:
- `bundle.status = "done"` → every `tasks[*].status` in that bundle SHALL be `"done"`
- `bundle.status = "skipped"` → every `tasks[*].status` in that bundle SHALL be `"skipped"`

Normalization applies unconditionally regardless of the prior child status (including children that already hold a different terminal status). The bundle is the authoritative execution unit; per-task status is informational. A bundle with an empty `tasks` array is a no-op with respect to child coercion; the terminal bundle status is still applied.

Normalization applies **only on terminal transitions**. Non-terminal transitions (`pending → in_progress`, and any other transition whose target is `pending` or `in_progress`) SHALL NOT modify child task statuses.

The returned `TaskGraph` SHALL contain both the bundle status change and all child coercions as a single in-memory update. When the caller persists `task-graph.json`, it SHALL be written atomically (e.g., write-to-temp + rename) so that the persisted graph is either the pre-update state or the fully normalized post-update state — never a mismatched intermediate state.

Whenever normalization actually changes a child task's status (from a value different from the target terminal status), the apply path SHALL emit a structured audit log entry containing at minimum: `bundle_id`, `task_id`, `from_status`, and `to_status`. Coercions that do not change a child's status (the child already matched the bundle's terminal status) SHALL NOT emit a log entry.

After status update, `tasks.md` SHALL be re-rendered from the normalized `TaskGraph` returned by `updateBundleStatus` (never from an unnormalized intermediate graph) to keep the human-readable view in sync.

#### Scenario: Status transitions from pending to in_progress

- **WHEN** `updateBundleStatus` is called with `("pending" bundle, "in_progress")`
- **THEN** the returned task graph SHALL have the bundle's status as `"in_progress"`
- **AND** the original task graph SHALL be unchanged
- **AND** every child task's status in that bundle SHALL be unchanged

#### Scenario: Status transitions from in_progress to done

- **WHEN** `updateBundleStatus` is called with `("in_progress" bundle, "done")`
- **THEN** the returned task graph SHALL have the bundle's status as `"done"`
- **AND** every child task's status in that bundle SHALL be `"done"` in the returned graph

#### Scenario: Invalid status transition is rejected

- **WHEN** `updateBundleStatus` is called with `("done" bundle, "pending")`
- **THEN** it SHALL return a typed error indicating an invalid status transition

#### Scenario: Bundle transition to done normalizes pending child tasks

- **WHEN** `updateBundleStatus` is called with `("in_progress" bundle, "done")` and that bundle's `tasks` contains at least one task with `status = "pending"`
- **THEN** the returned task graph SHALL have every `tasks[*].status` in that bundle equal to `"done"`
- **AND** the original task graph SHALL be unchanged

#### Scenario: Bundle transition to skipped normalizes child tasks

- **WHEN** `updateBundleStatus` is called with `("pending" bundle, "skipped")`
- **THEN** the returned task graph SHALL have every `tasks[*].status` in that bundle equal to `"skipped"`

#### Scenario: Normalization force-coerces conflicting prior terminal child status

- **WHEN** `updateBundleStatus` is called with a terminal target status and at least one child task already holds a different terminal status (e.g., child is `"done"` and the new bundle status is `"skipped"`)
- **THEN** the returned task graph SHALL have that child's status rewritten to match the bundle's new terminal status
- **AND** a structured audit log entry SHALL be emitted containing `bundle_id`, `task_id`, `from_status`, and `to_status`

#### Scenario: Terminal transition on empty bundle is a no-op for children

- **WHEN** `updateBundleStatus` is called with a terminal target status on a bundle whose `tasks` array is empty
- **THEN** the returned task graph SHALL have the bundle's status set to the terminal value
- **AND** no audit log entry for child coercion SHALL be emitted

#### Scenario: Audit log suppressed when coercion does not change status

- **WHEN** `updateBundleStatus` is called with a terminal target status and every child task already holds the same status as the bundle's new terminal status
- **THEN** the returned task graph SHALL reflect the bundle terminal status
- **AND** no audit log entry for child coercion SHALL be emitted

#### Scenario: updateBundleStatus does not mutate input graph

- **WHEN** `updateBundleStatus` is called with any valid arguments
- **THEN** the original `TaskGraph` argument SHALL be structurally unchanged (bundle statuses and every `tasks[*].status` preserved)
- **AND** any mutations SHALL only appear in the returned `TaskGraph`

#### Scenario: tasks.md is re-rendered from normalized graph after terminal transition

- **WHEN** a bundle status is updated to a terminal value and `task-graph.json` is persisted
- **THEN** `tasks.md` SHALL be re-rendered from the normalized `TaskGraph` returned by `updateBundleStatus`
- **AND** the rendered checklist for that bundle SHALL show every task's checkbox state as matching the bundle's terminal status

#### Scenario: Atomic persistence avoids mismatched intermediate state

- **WHEN** `task-graph.json` is written after a terminal bundle transition
- **THEN** the persistence path SHALL use an atomic write (e.g., write-to-temp + rename) so that a concurrent reader observes either the pre-update graph or the fully normalized post-update graph
- **AND** the persisted file SHALL NOT contain a bundle whose status is terminal while any of its child task statuses disagree
