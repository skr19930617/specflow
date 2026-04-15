## ADDED Requirements

### Requirement: `specflow-advance-bundle` advances a single bundle status with normalization and atomic persistence

`specflow-advance-bundle` SHALL be a first-class CLI in the distribution. It SHALL advance a single bundle's status within `openspec/changes/<CHANGE_ID>/task-graph.json`, normalize child-task statuses when transitioning to a terminal status per the `task-planner` specification, re-render `openspec/changes/<CHANGE_ID>/tasks.md`, and persist both files atomically.

The CLI SHALL accept exactly three positional arguments in order:

1. `<CHANGE_ID>` — the OpenSpec change identifier
2. `<BUNDLE_ID>` — the bundle id within that change's `task-graph.json`
3. `<NEW_STATUS>` — one of `pending`, `in_progress`, `done`, or `skipped`

No flags or environment variables SHALL be required for baseline operation.

#### Scenario: Usage error on missing arguments

- **WHEN** `specflow-advance-bundle` is invoked with fewer than 3 positional arguments
- **THEN** it SHALL exit with code `1`
- **AND** stdout SHALL contain a JSON error envelope whose `error` field documents the expected usage and the allowed `NEW_STATUS` values (`pending | in_progress | done | skipped`)

#### Scenario: Invalid NEW_STATUS is rejected

- **WHEN** `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <invalid-status>` is invoked with any `<invalid-status>` outside `{pending, in_progress, done, skipped}`
- **THEN** it SHALL exit with code `1`
- **AND** stdout SHALL contain a JSON error envelope reporting the invalid status

### Requirement: `specflow-advance-bundle` emits a stable stdout JSON envelope

`specflow-advance-bundle` SHALL emit exactly one JSON document to stdout per invocation, so that a programmatic caller SHALL be able to `JSON.parse` the full stdout without branching on pre- vs post-argument-parse shape.

On success, the stdout document SHALL contain the fields:

- `status`: the string `"success"`
- `change_id`: the change identifier argument
- `bundle_id`: the bundle identifier argument
- `new_status`: the status that was applied
- `coercions`: the number of child-task coercions performed during the transition (zero for non-terminal transitions; zero or more for terminal transitions)

On error, the stdout document SHALL contain the fields:

- `status`: the string `"error"`
- `error`: a human-readable error message
- `change_id`, `bundle_id`, `new_status`: present when the corresponding argument was successfully parsed; omitted when the argument could not be determined (e.g., failure before argument parsing)

#### Scenario: Successful transition emits the success envelope

- **WHEN** `specflow-advance-bundle <valid-change> <valid-bundle> done` succeeds against a task-graph with a matching bundle whose transition is valid
- **THEN** the CLI SHALL exit with code `0`
- **AND** stdout SHALL contain exactly one JSON document with `status: "success"`, `change_id`, `bundle_id`, `new_status: "done"`, and a non-negative integer `coercions`

#### Scenario: Failure emits the error envelope

- **WHEN** `specflow-advance-bundle` encounters any error (missing task-graph, schema-invalid task-graph, unknown bundle id, invalid status transition, filesystem error)
- **THEN** the CLI SHALL exit with code `1`
- **AND** stdout SHALL contain exactly one JSON document with `status: "error"` and a populated `error` field

### Requirement: `specflow-advance-bundle` emits one `task_status_coercion` line per changed child task on stderr

For each child task whose status is actually changed by normalization during a terminal bundle transition, `specflow-advance-bundle` SHALL emit exactly one JSON line to stderr. No stderr line SHALL be emitted for a child task whose prior status already matches the new bundle terminal status.

Each emitted stderr line SHALL be a single-line JSON object containing at minimum:

- `event`: the literal string `"task_status_coercion"`
- `change_id`: the change identifier
- `bundle_id`: the bundle identifier
- `task_id`: the coerced child task's id
- `from_status`: the child task's prior status
- `to_status`: the terminal status the child task was coerced to

Stdout SHALL remain reserved for the result envelope; coercion audit lines SHALL NOT be written to stdout.

#### Scenario: Coercion audit line format

- **WHEN** a terminal transition coerces a child task whose prior status differs from the new bundle terminal status
- **THEN** exactly one single-line JSON object with `event: "task_status_coercion"`, `change_id`, `bundle_id`, `task_id`, `from_status`, and `to_status` SHALL be emitted to stderr for that child task

#### Scenario: No audit line when child status already matches

- **WHEN** a terminal transition's child task already holds the new terminal status
- **THEN** NO `task_status_coercion` stderr line SHALL be emitted for that child task

### Requirement: `specflow-advance-bundle` uses exit code `0` for success and `1` for any error

`specflow-advance-bundle` SHALL use a two-valued exit code contract:

- Exit code `0`: the transition completed and both `task-graph.json` and `tasks.md` were persisted atomically.
- Exit code `1`: any error condition. The stdout envelope SHALL indicate the specific error via its `error` field.

No other exit codes SHALL be used by `specflow-advance-bundle`.

#### Scenario: Success uses exit code 0

- **WHEN** `specflow-advance-bundle` completes a valid transition and persists the files
- **THEN** it SHALL exit with code `0`

#### Scenario: Every error uses exit code 1

- **WHEN** `specflow-advance-bundle` encounters any error (argument error, schema error, unknown bundle, invalid transition, filesystem error)
- **THEN** it SHALL exit with code `1`
- **AND** it SHALL NOT use any other non-zero exit code
