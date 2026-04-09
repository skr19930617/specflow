## MODIFIED Requirements

### Requirement: Run state schema
The run state JSON SHALL contain the following fields: `run_id`, `change_name`, `current_phase`, `status`, `allowed_events`, `created_at`, `updated_at`, `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`.

#### Scenario: Initial run state contents
- **WHEN** a run is newly created
- **THEN** the JSON SHALL contain `run_id` equal to the change name
- **THEN** `change_name` SHALL equal the change name
- **THEN** `current_phase` SHALL be `start`
- **THEN** `status` SHALL be `active`
- **THEN** `allowed_events` SHALL list events valid for the `start` state
- **THEN** `created_at` and `updated_at` SHALL be ISO 8601 timestamps
- **THEN** `project_id` SHALL be auto-detected from git remote origin
- **THEN** `repo_name` SHALL equal `project_id`
- **THEN** `repo_path` SHALL be the git repository root absolute path
- **THEN** `branch_name` SHALL be the current git branch name
- **THEN** `worktree_path` SHALL be the git working tree root absolute path
- **THEN** `agents` SHALL be an object with `main` and `review` string fields
- **THEN** `last_summary_path` SHALL be `null`

#### Scenario: Run state after transition
- **WHEN** a transition advances the run from `start` to `proposal`
- **THEN** `current_phase` SHALL be `proposal`
- **THEN** `allowed_events` SHALL be recomputed from the workflow definition for the `proposal` state
- **THEN** `updated_at` SHALL be updated to the current time
- **THEN** all metadata fields (`project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`) SHALL be preserved unchanged

## ADDED Requirements

### Requirement: Get-field subcommand
The `specflow-run` CLI SHALL support a `get-field <run_id> <field>` subcommand that reads a single field from the run state JSON and outputs its value to stdout.

#### Scenario: Get existing field
- **WHEN** `specflow-run get-field <run_id> agents` is executed and the run exists
- **THEN** the value of the `agents` field SHALL be output to stdout as JSON

#### Scenario: Get non-existent field
- **WHEN** `specflow-run get-field <run_id> nonexistent` is executed
- **THEN** the script SHALL exit with code 1 and print an error to stderr

#### Scenario: Get-field with missing run
- **WHEN** `specflow-run get-field <run_id> agents` is executed but the run does not exist
- **THEN** the script SHALL exit with code 1 and print an error to stderr

#### Scenario: Get-field field whitelist
- **WHEN** `specflow-run get-field` is executed
- **THEN** the readable fields SHALL include all top-level fields in run.json (no whitelist restriction for reads)
