## MODIFIED Requirements

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

## ADDED Requirements

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
