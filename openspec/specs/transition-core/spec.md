# transition-core Specification

## Purpose

TBD - created by archiving change workflow-state-machine. Update Purpose after archive.

## Requirements

### Requirement: specflow-run start command

The system SHALL provide a `specflow-run start <run_id>` command that initializes a new run with the `start` state, auto-detects project metadata, and creates the run state file.

#### Scenario: Start a new run with enriched metadata

- **WHEN** `specflow-run start my-change` is executed in a git repository
- **THEN** the command SHALL create `.specflow/runs/my-change/run.json` with `current_phase: "start"`
- **THEN** the run state SHALL include auto-detected `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`
- **THEN** `agents` SHALL default to `{ "main": "claude", "review": "codex" }`
- **THEN** `last_summary_path` SHALL be `null`
- **THEN** the command SHALL exit with code 0

#### Scenario: Start with issue metadata

- **WHEN** `specflow-run start my-change --issue-url "https://github.com/owner/repo/issues/71"` is executed
- **THEN** the run state SHALL include the `issue` object populated from the URL
- **THEN** the run state SHALL also include all enriched metadata fields

#### Scenario: Start with custom agent configuration

- **WHEN** `specflow-run start my-change --agent-main "custom" --agent-review "custom-rev"` is executed
- **THEN** `agents.main` SHALL be `"custom"`
- **THEN** `agents.review` SHALL be `"custom-rev"`

#### Scenario: Start when run already exists

- **WHEN** `specflow-run start my-change` is executed and a run state file already exists
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message indicating the run already exists

#### Scenario: Start fails when git metadata cannot be detected

- **WHEN** `specflow-run start my-change` is executed outside a git repository
- **THEN** the command SHALL exit with code 1
- **THEN** the command SHALL output an error message about missing git context

### Requirement: specflow-run advance command

The system SHALL provide a `specflow-run advance <run_id> <event>` command that validates and applies a state transition, including the new phase-specific revision events and branch path events.

#### Scenario: Valid mainline transition

- **WHEN** `specflow-run advance my-change propose` is executed while the run is in `start` state
- **THEN** the run state SHALL transition to `proposal_draft`
- **THEN** the command SHALL exit with code 0

#### Scenario: Proposal revise transition

- **WHEN** `specflow-run advance my-change revise_proposal` is executed while the run is in `proposal_validate` state
- **THEN** the run state SHALL transition to `proposal_clarify`
- **THEN** a history entry SHALL be recorded with `from: "proposal_validate"`, `to: "proposal_clarify"`, `event: "revise_proposal"`

#### Scenario: Phase-specific revise transition

- **WHEN** `specflow-run advance my-change revise_design` is executed while the run is in `design_review` state
- **THEN** the run state SHALL transition to `design_draft`
- **THEN** a history entry SHALL be recorded with `from: "design_review"`, `to: "design_draft"`, `event: "revise_design"`

#### Scenario: Branch path transition

- **WHEN** `specflow-run advance my-change explore_start` is executed while the run is in `start` state
- **THEN** the run state SHALL transition to `explore`
- **THEN** `allowed_events` SHALL be recomputed for the `explore` state

#### Scenario: Invalid transition with updated error message

- **WHEN** `specflow-run advance my-change revise` is executed (using the removed event name)
- **THEN** the command SHALL exit with code 1
- **THEN** the error message SHALL list the allowed events for the current state

#### Scenario: Metadata preserved across transitions

- **WHEN** any transition is applied
- **THEN** all enriched metadata fields SHALL be preserved in the updated run state

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

The `advance` command SHALL load the generated workflow definition asset (`dist/package/global/workflow/state-machine.json` in a repo build, with project-local and installed overrides) and validate that the requested event is a valid transition from the current state before applying it.

#### Scenario: Validation reads definition at runtime

- **WHEN** a transition is requested
- **THEN** the command SHALL read the workflow definition asset to determine validity
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

### Requirement: specflow-run update-field command

The system SHALL provide a `specflow-run update-field <run_id> <field> <value>` command that updates the allowed mutable run-state fields without bypassing schema validation.

#### Scenario: Update summary path

- **WHEN** `specflow-run update-field my-change last_summary_path "openspec/changes/my-change/approval-summary.md"` is executed
- **THEN** the run state SHALL update `last_summary_path`
- **THEN** `updated_at` SHALL be refreshed

#### Scenario: Reject disallowed field mutation

- **WHEN** `specflow-run update-field my-change current_phase hacked` is executed
- **THEN** the command SHALL exit with code 1
- **THEN** stderr SHALL explain that `current_phase` is not updatable
