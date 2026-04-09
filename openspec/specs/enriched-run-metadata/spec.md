# enriched-run-metadata Specification

## Purpose
TBD - created by archiving change extend-workflow-state-machine. Update Purpose after archive.
## Requirements
### Requirement: Project identification fields in run state
The run state JSON SHALL include `project_id` and `repo_name` fields. `project_id` SHALL be derived from the repository's remote origin in `owner/repo` format. `repo_name` SHALL equal the `project_id` value.

#### Scenario: project_id is auto-detected from git remote
- **WHEN** a run is started in a repository with remote origin `https://github.com/skr19930617/specflow.git`
- **THEN** `project_id` SHALL be `"skr19930617/specflow"`

#### Scenario: repo_name equals project_id
- **WHEN** a run is newly created
- **THEN** `repo_name` SHALL equal the value of `project_id`

### Requirement: Repository path fields in run state
The run state JSON SHALL include `repo_path` and `worktree_path` fields. Both SHALL be absolute filesystem paths auto-detected from git at run initialization.

#### Scenario: repo_path is the git repository root
- **WHEN** a run is started
- **THEN** `repo_path` SHALL equal the output of `git rev-parse --show-toplevel`

#### Scenario: worktree_path is the git working tree root
- **WHEN** a run is started
- **THEN** `worktree_path` SHALL equal the output of `git rev-parse --show-toplevel`

### Requirement: Branch name field in run state
The run state JSON SHALL include a `branch_name` field auto-detected from the current git branch at run initialization.

#### Scenario: branch_name is auto-detected
- **WHEN** a run is started on branch `extend-workflow-state-machine`
- **THEN** `branch_name` SHALL be `"extend-workflow-state-machine"`

### Requirement: Agent configuration fields in run state
The run state JSON SHALL include an `agents` object with `main` and `review` string fields identifying the agents used for the run.

#### Scenario: Default agent values
- **WHEN** a run is started without explicit agent flags
- **THEN** `agents.main` SHALL be `"claude"`
- **THEN** `agents.review` SHALL be `"codex"`

#### Scenario: Custom agent values via flags
- **WHEN** a run is started with `--agent-main "custom-agent" --agent-review "custom-reviewer"`
- **THEN** `agents.main` SHALL be `"custom-agent"`
- **THEN** `agents.review` SHALL be `"custom-reviewer"`

### Requirement: Summary artifact pointer in run state
The run state JSON SHALL include a `last_summary_path` field that points to the most recent summary artifact produced by the run.

#### Scenario: Initial value is null
- **WHEN** a run is newly created
- **THEN** `last_summary_path` SHALL be `null`

#### Scenario: Updated after summary generation
- **WHEN** a command produces a summary artifact at a given path
- **THEN** `last_summary_path` SHALL be updated to that path

### Requirement: All new metadata fields are required
The run state JSON SHALL always include `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, and `last_summary_path`. None of these fields SHALL be omitted from the run state.

#### Scenario: Complete run state after initialization
- **WHEN** a run is newly created
- **THEN** the JSON SHALL contain all of: `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`
- **THEN** no field SHALL be absent from the JSON output

