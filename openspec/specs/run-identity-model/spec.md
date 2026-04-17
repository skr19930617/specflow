# run-identity-model Specification

## Purpose
TBD - created by archiving change decide-run-identity-and-lifecycle-boundary. Update Purpose after archive.
## Requirements
### Requirement: Run identity is separated from change identity

The system SHALL distinguish between run_id (workflow instance identifier)
and change_id (artifact directory slug). A run_id SHALL follow the format
`<change_id>-<sequence>` where sequence is a monotonically increasing
integer starting at 1 for each change_id.

#### Scenario: First run for a change produces sequence 1

- **WHEN** `specflow-run start <change_id>` is invoked for a change with no
  prior runs
- **THEN** the generated run_id SHALL be `<change_id>-1`

#### Scenario: Subsequent runs increment the sequence

- **WHEN** a retry creates a new run for a change whose latest run_id ends
  with `-2`
- **THEN** the generated run_id SHALL be `<change_id>-3`

#### Scenario: run_id is persisted explicitly in run.json

- **WHEN** a run is created
- **THEN** `run.json` SHALL contain a `run_id` field with the generated
  value
- **AND** the run_id SHALL NOT be derived from the directory name at read
  time

### Requirement: change_name links a run to its change artifacts

The `change_name` field in `run.json` SHALL serve as the canonical link
from a run to its change artifacts at `openspec/changes/<change_name>/`.

#### Scenario: change_name is required for change runs

- **WHEN** a run is created with `run_kind = "change"`
- **THEN** `change_name` SHALL be a non-null string equal to the change_id
- **AND** `openspec/changes/<change_name>/` SHALL exist

#### Scenario: change_name is null for synthetic runs

- **WHEN** a run is created with `run_kind = "synthetic"`
- **THEN** `change_name` SHALL be `null`

### Requirement: Artifacts belong to the change, not the run

Artifacts SHALL be stored under `openspec/changes/<change_id>/` and SHALL
be shared across all runs for that change_id. Runs reference artifacts
through the `change_name` field but do not own them.

#### Scenario: Multiple runs reference the same artifacts

- **WHEN** a retry creates run `<change_id>-2` for the same change
- **THEN** the new run SHALL reference the same `openspec/changes/<change_id>/`
  artifacts as run `<change_id>-1`
- **AND** artifacts SHALL NOT be copied or forked

### Requirement: One non-terminal run per change

The system SHALL enforce that at most one non-terminal run exists for any
given change_id at any time. Non-terminal means the run status is `active`
or `suspended`.

#### Scenario: Start is rejected when an active run exists

- **WHEN** `specflow-run start <change_id>` is invoked
- **AND** an active run already exists for that change_id
- **THEN** the command SHALL fail with error "Active run already exists"

#### Scenario: Start is rejected when a suspended run exists

- **WHEN** `specflow-run start <change_id>` is invoked
- **AND** a suspended run exists for that change_id
- **THEN** the command SHALL fail with error "Suspended run exists — resume
  or reject it first"

#### Scenario: Start with retry is allowed when all runs are terminal

- **WHEN** `specflow-run start <change_id> --retry` is invoked
- **AND** all existing runs for that change_id are terminal
- **AND** the most recent run is not `rejected`
- **THEN** the command SHALL create a new run

### Requirement: Backward compatibility for legacy run.json

The system SHALL support reading run.json files that lack the `run_id`
field by deriving run_id from the directory name as a fallback.

#### Scenario: Legacy run.json is readable

- **WHEN** a run.json file without a `run_id` field is read
- **THEN** the system SHALL use the parent directory name as the run_id
- **AND** the system SHALL NOT modify the file on read

#### Scenario: New runs always include run_id

- **WHEN** a new run is created
- **THEN** the written run.json SHALL always include the `run_id` field

### Requirement: resolveRunId auto-resolves Change ID to the latest non-terminal Run ID

The `run-store-ops` module SHALL export a `resolveRunId(store: RunArtifactStore, changeId: string)` function that returns the run_id of the single non-terminal (active or suspended) run for the given change_id. The function SHALL rely on the existing "one non-terminal run per change" invariant.

#### Scenario: resolveRunId returns the active run_id

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** exactly one non-terminal run `my-feature-2` exists with status `active`
- **THEN** the function SHALL return `{ ok: true, value: "my-feature-2" }`

#### Scenario: resolveRunId returns the suspended run_id

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** exactly one non-terminal run `my-feature-3` exists with status `suspended`
- **THEN** the function SHALL return `{ ok: true, value: "my-feature-3" }`

#### Scenario: resolveRunId returns no_active_run when all runs are terminal

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** all runs for `my-feature` have status `terminal`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "no_active_run", message: "No active or suspended run for change 'my-feature'" } }`

#### Scenario: resolveRunId returns change_not_found when no runs exist

- **WHEN** `resolveRunId(store, "nonexistent")` is invoked
- **AND** no runs exist for `nonexistent`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "change_not_found", message: "No runs found for change 'nonexistent'" } }`

#### Scenario: resolveRunId returns multiple_active_runs on invariant violation

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** two or more non-terminal runs exist for `my-feature`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "multiple_active_runs", message: "Invariant violation: multiple non-terminal runs for change 'my-feature'" } }`

### Requirement: resolveRunId follows the Result pattern

The `resolveRunId` function SHALL return a `Result<string, ResolveRunIdError>` where `ResolveRunIdError` follows the `CoreRuntimeError` pattern with `{ kind, message }` shape. The error `kind` field SHALL be drawn from the closed set: `no_active_run`, `change_not_found`, `multiple_active_runs`.

#### Scenario: Result type is compatible with CoreRuntimeError pattern

- **WHEN** the return type of `resolveRunId` is inspected
- **THEN** the success case SHALL be `{ ok: true, value: string }` where value is the run_id
- **AND** the error case SHALL be `{ ok: false, error: { kind: ResolveRunIdErrorKind, message: string } }`
- **AND** `ResolveRunIdErrorKind` SHALL be a string literal union type

#### Scenario: resolveRunId does not throw

- **WHEN** `resolveRunId` encounters any of its defined error conditions
- **THEN** it SHALL return an error Result
- **AND** it SHALL NOT throw an exception

