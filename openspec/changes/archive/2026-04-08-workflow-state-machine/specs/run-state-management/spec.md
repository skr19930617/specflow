## ADDED Requirements

### Requirement: Per-run state file
The system SHALL store per-run state at `.specflow/runs/<run_id>/run.json` where `run_id` equals the OpenSpec change name.

#### Scenario: Run state file is created on run start
- **WHEN** a new run is started for change `workflow-state-machine`
- **THEN** the file `.specflow/runs/workflow-state-machine/run.json` SHALL be created
- **THEN** the file SHALL be valid JSON

#### Scenario: Run state directory structure
- **WHEN** the `.specflow/runs/` directory is listed
- **THEN** each subdirectory name SHALL match the corresponding OpenSpec change name

### Requirement: Run state schema
The run state JSON SHALL contain the following fields: `run_id`, `change_name`, `current_phase`, `status`, `allowed_events`, `created_at`, `updated_at`.

#### Scenario: Initial run state contents
- **WHEN** a run is newly created
- **THEN** the JSON SHALL contain `run_id` equal to the change name
- **THEN** `change_name` SHALL equal the change name
- **THEN** `current_phase` SHALL be `start`
- **THEN** `status` SHALL be `active`
- **THEN** `allowed_events` SHALL list events valid for the `start` state
- **THEN** `created_at` and `updated_at` SHALL be ISO 8601 timestamps

#### Scenario: Run state after transition
- **WHEN** a transition advances the run from `start` to `proposal`
- **THEN** `current_phase` SHALL be `proposal`
- **THEN** `allowed_events` SHALL be recomputed from the workflow definition for the `proposal` state
- **THEN** `updated_at` SHALL be updated to the current time

### Requirement: Run state history
The run state SHALL include a `history` array that records each transition event with timestamp.

#### Scenario: History entry on transition
- **WHEN** the run transitions from `proposal` to `design` via `accept_proposal`
- **THEN** a new entry SHALL be appended to `history` with `from`, `to`, `event`, and `timestamp` fields

#### Scenario: History is append-only
- **WHEN** multiple transitions occur
- **THEN** all previous history entries SHALL be preserved and the new entry SHALL be appended at the end

### Requirement: Run state immutability pattern
Run state updates SHALL create a new JSON object rather than mutating the existing file in place. The file SHALL be written atomically (write to temp file then rename).

#### Scenario: Atomic write on transition
- **WHEN** a transition updates the run state
- **THEN** the system SHALL write to a temporary file in the same directory first
- **THEN** the system SHALL rename the temporary file to `run.json`

### Requirement: Git-ignore run state
The `.specflow/runs/` directory SHALL be excluded from version control.

#### Scenario: Gitignore entry exists
- **WHEN** the `.gitignore` file is inspected
- **THEN** it SHALL contain an entry that matches `.specflow/runs/`

### Requirement: Issue metadata in run state
When the run is started from a GitHub issue, the run state SHALL include an `issue` object with `url`, `number`, `title`, and `repo` fields. When started from inline spec, the `issue` field SHALL be `null`.

#### Scenario: Run started from issue URL
- **WHEN** a run is started with a GitHub issue URL
- **THEN** the `issue` object SHALL contain `url`, `number`, `title`, and `repo`

#### Scenario: Run started from inline spec
- **WHEN** a run is started from inline text (no issue URL)
- **THEN** the `issue` field SHALL be `null`
