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

