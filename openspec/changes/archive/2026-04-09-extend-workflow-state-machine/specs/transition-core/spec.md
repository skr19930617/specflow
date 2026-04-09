## MODIFIED Requirements

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
- **THEN** the run state SHALL transition to `proposal`
- **THEN** the command SHALL exit with code 0

#### Scenario: Phase-specific revise transition
- **WHEN** `specflow-run advance my-change revise_design` is executed while the run is in `design` state
- **THEN** the run state SHALL remain in `design`
- **THEN** a history entry SHALL be recorded with `from: "design"`, `to: "design"`, `event: "revise_design"`

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
