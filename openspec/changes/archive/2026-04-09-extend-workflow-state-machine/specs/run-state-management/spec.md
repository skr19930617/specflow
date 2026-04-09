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
