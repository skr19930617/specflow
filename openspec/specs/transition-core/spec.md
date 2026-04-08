# transition-core Specification

## Purpose
TBD - created by archiving change workflow-state-machine. Update Purpose after archive.
## Requirements
### Requirement: specflow-run start command
The system SHALL provide a `specflow-run start <run_id>` command that initializes a new run with the `start` state and creates the run state file.

#### Scenario: Start a new run
- **WHEN** `specflow-run start workflow-state-machine` is executed
- **THEN** the command SHALL create `.specflow/runs/workflow-state-machine/run.json` with `current_phase: "start"`
- **THEN** the command SHALL exit with code 0
- **THEN** the command SHALL output the initial run state as JSON to stdout

#### Scenario: Start with issue metadata
- **WHEN** `specflow-run start workflow-state-machine --issue-url "https://github.com/owner/repo/issues/71"` is executed
- **THEN** the run state SHALL include the `issue` object populated from the URL

#### Scenario: Start when run already exists
- **WHEN** `specflow-run start workflow-state-machine` is executed and a run state file already exists
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message indicating the run already exists

### Requirement: specflow-run advance command
The system SHALL provide a `specflow-run advance <run_id> <event>` command that validates and applies a state transition.

#### Scenario: Valid transition
- **WHEN** `specflow-run advance workflow-state-machine propose` is executed while the run is in `start` state
- **THEN** the run state SHALL transition to `proposal`
- **THEN** the command SHALL exit with code 0
- **THEN** the command SHALL output the updated run state as JSON to stdout

#### Scenario: Invalid transition
- **WHEN** `specflow-run advance workflow-state-machine approve` is executed while the run is in `start` state
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message listing the allowed events for the current state
- **THEN** the run state SHALL remain unchanged

#### Scenario: Run does not exist
- **WHEN** `specflow-run advance nonexistent-run propose` is executed
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message indicating the run was not found

#### Scenario: Revise event self-transition
- **WHEN** `specflow-run advance workflow-state-machine revise` is executed while the run is in `design` state
- **THEN** the run state SHALL remain in `design`
- **THEN** a history entry SHALL be recorded with `from: "design"`, `to: "design"`, `event: "revise"`

### Requirement: specflow-run status command
The system SHALL provide a `specflow-run status <run_id>` command that outputs the current run state as JSON.

#### Scenario: Status of existing run
- **WHEN** `specflow-run status workflow-state-machine` is executed
- **THEN** the command SHALL output the full run state JSON to stdout
- **THEN** the command SHALL exit with code 0

#### Scenario: Status of nonexistent run
- **WHEN** `specflow-run status nonexistent-run` is executed
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message

### Requirement: Transition validation against workflow definition
The `advance` command SHALL load `global/workflow/state-machine.json` and validate that the requested event is a valid transition from the current state before applying it.

#### Scenario: Validation reads definition at runtime
- **WHEN** a transition is requested
- **THEN** the command SHALL read `global/workflow/state-machine.json` to determine validity
- **THEN** the command SHALL NOT hardcode transition rules in the script itself

#### Scenario: Modified definition is reflected immediately
- **WHEN** `state-machine.json` is modified to add a new transition
- **THEN** the next `advance` call SHALL recognize the new transition without restarting any process

### Requirement: Command output format
All `specflow-run` subcommands SHALL output JSON to stdout for success responses and plain text error messages to stderr for failures.

#### Scenario: Success output is JSON
- **WHEN** any subcommand succeeds
- **THEN** stdout SHALL contain valid JSON
- **THEN** stderr SHALL be empty

#### Scenario: Error output to stderr
- **WHEN** any subcommand fails
- **THEN** stderr SHALL contain a human-readable error message
- **THEN** the exit code SHALL be non-zero

