# task-planner Specification

## Purpose
TBD - created by archiving change move-task-generation-from-openspec-passthrough-to-specflow-owned-task-planner. Update Purpose after archive.
## Requirements
### Requirement: Task graph schema defines bundle-based structure

The system SHALL define a `TaskGraph` JSON schema with the following top-level fields:
- `version`: schema version string (initial value `"1.0"`)
- `change_id`: the change identifier this graph belongs to
- `bundles`: an ordered array of `Bundle` objects
- `generated_at`: ISO 8601 timestamp of generation
- `generated_from`: identifier of the source artifact (e.g. `"design.md"`)

Each `Bundle` object SHALL have the following fields:
- `id`: unique kebab-case identifier within the graph
- `title`: human-readable bundle name
- `goal`: one-sentence description of what the bundle achieves
- `depends_on`: array of bundle IDs representing soft dependencies (dependent bundle MAY start when dependency's output artifacts are available, not necessarily when dependency is fully complete)
- `inputs`: array of artifact references the bundle consumes
- `outputs`: array of artifact references the bundle produces
- `status`: enum of `"pending"` | `"in_progress"` | `"done"` | `"skipped"`
- `tasks`: array of `Task` objects within the bundle
- `owner_capabilities`: array of baseline spec names (from `openspec/specs/`) indicating which spec domain the bundle belongs to
- `size_score`: **optional** non-negative integer. When present, it SHALL equal `bundle.tasks.length` at the time of graph generation. When absent, downstream consumers (notably `bundle-subagent-execution`) SHALL treat the bundle as having an undefined `size_score` rather than substituting a default value.

Each `Task` object SHALL have at minimum:
- `id`: unique identifier within the bundle
- `title`: task description
- `status`: enum of `"pending"` | `"in_progress"` | `"done"` | `"skipped"`

#### Scenario: Valid task graph conforms to schema

- **WHEN** a task graph JSON document is validated against the `TaskGraph` schema
- **THEN** it SHALL pass validation if and only if all required fields are present with correct types

#### Scenario: Bundle IDs are unique within a graph

- **WHEN** a task graph is validated
- **THEN** all bundle `id` values SHALL be unique within the `bundles` array

#### Scenario: depends_on references are valid bundle IDs

- **WHEN** a task graph is validated
- **THEN** every `id` in every bundle's `depends_on` array SHALL reference an existing bundle `id` in the same graph

#### Scenario: No circular dependencies in depends_on

- **WHEN** a task graph is validated
- **THEN** the dependency graph formed by `depends_on` SHALL be a directed acyclic graph (DAG)

#### Scenario: owner_capabilities references valid spec names

- **WHEN** a task graph is generated
- **THEN** every entry in `owner_capabilities` SHALL correspond to a directory name in `openspec/specs/`

#### Scenario: size_score is present and matches task count for newly generated graphs

- **WHEN** a task graph is generated via `generateTaskGraph` on the post-feature code path
- **THEN** every `Bundle` SHALL have a `size_score` field equal to `bundle.tasks.length`

#### Scenario: size_score is optional — graphs without the field remain valid

- **WHEN** a pre-feature `task-graph.json` without `size_score` fields is validated against the current schema
- **THEN** validation SHALL pass
- **AND** the graph SHALL be usable by the apply phase

### Requirement: Task graph is generated from design.md via LLM-based inference

The system SHALL provide a `generateTaskGraph(designContent, changeId, specNames)` function that uses LLM-based inference to analyze `design.md` content and produce a `TaskGraph` JSON document.

The generated output SHALL be validated against the `TaskGraph` JSON schema. If validation fails, the system SHALL retry generation up to a configurable maximum number of attempts (default: 3).

The generation function SHALL accept:
- `designContent`: the full text of `design.md`
- `changeId`: the change identifier
- `specNames`: available baseline spec names for `owner_capabilities` assignment

#### Scenario: Successful generation produces valid task graph

- **WHEN** `generateTaskGraph` is called with valid design content
- **THEN** it SHALL return a `TaskGraph` document that passes JSON schema validation

#### Scenario: Generation retries on schema validation failure

- **WHEN** the LLM produces output that fails JSON schema validation
- **THEN** the system SHALL retry with error feedback up to the configured maximum attempts
- **AND** it SHALL return a validation error if all attempts fail

#### Scenario: Generated bundles reflect design structure

- **WHEN** `generateTaskGraph` is called with design content containing multiple phases or modules
- **THEN** the resulting bundles SHALL correspond to identifiable units of work from the design

### Requirement: tasks.md is rendered from task graph as the single source of truth

The system SHALL provide a `renderTasksMd(taskGraph)` function that produces a human-readable `tasks.md` document from a `TaskGraph` object.

The rendered `tasks.md` SHALL include:
- A heading per bundle with its title and goal
- A checklist of tasks within each bundle
- Dependency annotations showing which bundles depend on which
- Status indicators for each bundle and task

The system SHALL NOT use OpenSpec tasks template/instruction for `tasks.md` generation. `task-graph.json` is the single source of truth; `tasks.md` is a derived view.

#### Scenario: Rendered tasks.md reflects all bundles

- **WHEN** `renderTasksMd` is called with a task graph containing 3 bundles
- **THEN** the output SHALL contain sections for all 3 bundles with their tasks

#### Scenario: Rendered tasks.md includes dependency info

- **WHEN** a bundle has `depends_on` entries
- **THEN** the rendered section for that bundle SHALL indicate its dependencies

#### Scenario: tasks.md is regenerable from task graph

- **WHEN** `renderTasksMd` is called twice with the same task graph
- **THEN** the outputs SHALL be identical

### Requirement: Bundle completion is determined by output artifact existence

A bundle SHALL be considered complete when all artifacts listed in its `outputs` array exist. The system SHALL provide a `checkBundleCompletion(bundle, artifactChecker)` function that returns `true` if and only if every output artifact reference resolves to an existing artifact.

Task checkbox status within a bundle is informational only and SHALL NOT be used as the primary completion criterion.

#### Scenario: Bundle with all outputs present is complete

- **WHEN** `checkBundleCompletion` is called for a bundle whose `outputs` all exist
- **THEN** it SHALL return `true`

#### Scenario: Bundle with missing outputs is not complete

- **WHEN** `checkBundleCompletion` is called for a bundle where at least one `output` does not exist
- **THEN** it SHALL return `false`

#### Scenario: Empty outputs array means always complete

- **WHEN** `checkBundleCompletion` is called for a bundle with an empty `outputs` array
- **THEN** it SHALL return `true`

### Requirement: Apply phase reads task graph for next window selection

The apply phase SHALL read `task-graph.json` to determine which bundles are eligible for execution in the current window. A bundle is eligible when:
- Its `status` is `"pending"`
- All bundles in its `depends_on` have their output artifacts available (soft dependency)

The system SHALL provide a `selectNextWindow(taskGraph, artifactChecker)` function that returns the set of eligible bundles.

#### Scenario: Independent bundles are all eligible

- **WHEN** `selectNextWindow` is called and multiple bundles have no `depends_on` and status `"pending"`
- **THEN** all such bundles SHALL be returned as eligible

#### Scenario: Dependent bundle is eligible when dependency outputs exist

- **WHEN** a pending bundle depends on bundle B, and bundle B's output artifacts all exist (regardless of B's status)
- **THEN** the dependent bundle SHALL be included in the eligible set

#### Scenario: Dependent bundle is not eligible when dependency outputs are missing

- **WHEN** a pending bundle depends on bundle B, and at least one of B's output artifacts does not exist
- **THEN** the dependent bundle SHALL NOT be included in the eligible set

#### Scenario: Non-pending bundles are never eligible

- **WHEN** `selectNextWindow` is called
- **THEN** bundles with status `"in_progress"`, `"done"`, or `"skipped"` SHALL NOT be included

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

### Requirement: Legacy fallback supports changes without task graph

For existing changes where `task-graph.json` does not exist, the apply phase SHALL fall back to reading `tasks.md` directly in legacy mode. The fallback SHALL be transparent — apply phase consumers SHALL use a unified interface that resolves to task graph when available, or legacy tasks.md otherwise.

#### Scenario: Apply phase uses task graph when present

- **WHEN** the apply phase reads task information for a change with `task-graph.json`
- **THEN** it SHALL use the task graph as the source of truth

#### Scenario: Apply phase falls back to tasks.md when task graph is absent

- **WHEN** the apply phase reads task information for a change without `task-graph.json`
- **THEN** it SHALL read `tasks.md` directly as the legacy fallback
- **AND** it SHALL NOT fail with a missing artifact error

#### Scenario: New changes always generate task graph

- **WHEN** a new change completes the design phase
- **THEN** `task-graph.json` SHALL be generated and persisted
- **AND** `tasks.md` SHALL be rendered from the task graph

### Requirement: `specflow-advance-bundle` is the sole mutation entry point for apply-class workflows

In apply-class slash-command workflows (currently `/specflow.apply`, and any fix-loop code path that resumes apply-class implementation work), when `task-graph.json` exists for the change and passes `validateTaskGraph`, all bundle and child-task status transitions SHALL be performed via the `specflow-advance-bundle` CLI. `specflow-advance-bundle` SHALL be the only supported mutation entry point for `task-graph.json` and for `tasks.md` in these workflows.

Direct writes to `openspec/changes/<CHANGE_ID>/task-graph.json` or `openspec/changes/<CHANGE_ID>/tasks.md` from apply-class workflows — whether via inline `node -e` scripts, `jq`, shell here-docs, the Edit/Write tools, or any other mechanism that bypasses `specflow-advance-bundle` — SHALL be considered a contract violation against this specification.

This requirement codifies the rule. Automated detection of violations during apply review (diff scanning, reviewer-prompt changes, or orchestrator-level enforcement) is NOT required by this requirement; it is tracked as a separate follow-up change.

This requirement does not alter the `updateBundleStatus` in-memory API defined in the existing "Apply phase writes back bundle status to task graph" requirement; `specflow-advance-bundle` is the user-facing CLI wrapper that calls `updateBundleStatus` and persists the result atomically.

#### Scenario: CLI is named as the sole entry point when task-graph is present and valid

- **WHEN** a change has `openspec/changes/<CHANGE_ID>/task-graph.json` that passes `validateTaskGraph`
- **AND** an apply-class workflow needs to transition a bundle's status
- **THEN** `specflow-advance-bundle` SHALL be the only sanctioned tool for performing the transition
- **AND** any other mechanism that writes to `task-graph.json` or `tasks.md` from that workflow SHALL be a contract violation

#### Scenario: Legacy fallback is unaffected when task-graph.json is absent

- **WHEN** a change has no `openspec/changes/<CHANGE_ID>/task-graph.json`
- **THEN** this requirement SHALL NOT apply
- **AND** the existing legacy fallback (editing `tasks.md` directly) defined in the "Legacy fallback supports changes without task graph" requirement SHALL remain the supported path

#### Scenario: Malformed task-graph.json does not permit silent fallback

- **WHEN** a change has `openspec/changes/<CHANGE_ID>/task-graph.json` that fails `validateTaskGraph`
- **THEN** an apply-class workflow SHALL NOT fall back to the legacy `tasks.md`-only path
- **AND** the workflow SHALL surface the validation error and halt in the apply draft state

#### Scenario: Violation detection is explicitly out of this requirement's scope

- **WHEN** this requirement is read
- **THEN** it SHALL state that automated detection of contract violations (via apply-review diff scanning, reviewer prompt changes, or orchestrator enforcement) is NOT required here and is tracked separately

### Requirement: Pre-feature task graphs without size_score fall back to inline-only

When the apply phase consumes a `task-graph.json` in which one or more bundles do not carry a `size_score` field, those bundles SHALL be treated as inline-only by `bundle-subagent-execution` regardless of any configured threshold. This is the backward-compatibility rule for graphs generated before `size_score` was introduced and for archived changes that were never regenerated.

No automatic migration is performed. Regenerating the task graph via `generateTaskGraph` (e.g., by re-running `specflow-generate-task-graph <CHANGE_ID>`) is the documented path to upgrade a pre-feature graph onto the new schema; doing so is OUTSIDE the apply-class workflows (see `task-planner`'s sole-mutation-entry-point rule for `specflow-advance-bundle`).

#### Scenario: Bundle without size_score is inline-only at apply time

- **WHEN** the apply phase evaluates a bundle whose `size_score` field is absent
- **THEN** the bundle SHALL be classified as inline-only
- **AND** no subagent SHALL be spawned for that bundle

#### Scenario: Mixed graph with and without size_score is handled per-bundle

- **WHEN** a `task-graph.json` contains both bundles with `size_score` and bundles without
- **THEN** each bundle's eligibility SHALL be evaluated independently
- **AND** bundles without `size_score` SHALL always be inline-only
- **AND** bundles with `size_score` SHALL be evaluated against the configured threshold

#### Scenario: No auto-migration is performed at apply time

- **WHEN** the apply phase encounters a pre-feature `task-graph.json`
- **THEN** the apply phase SHALL NOT rewrite the graph, add `size_score` fields, or otherwise mutate the file to backfill the new schema

