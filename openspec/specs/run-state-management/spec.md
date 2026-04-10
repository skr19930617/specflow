# run-state-management Specification

## Purpose

TBD - created by archiving change workflow-state-machine. Update Purpose after archive.

## Requirements

### Requirement: Per-run state file

The system SHALL store per-run state at `.specflow/runs/<run_id>/run.json`. Change-scoped runs use the OpenSpec change name as `run_id`; branch-path flows may use synthetic run ids.

#### Scenario: Run state file is created on run start

- **WHEN** a new run is started for change `workflow-state-machine`
- **THEN** the file `.specflow/runs/workflow-state-machine/run.json` SHALL be created
- **THEN** the file SHALL be valid JSON

#### Scenario: Run state directory structure

- **WHEN** the `.specflow/runs/` directory is listed
- **THEN** each subdirectory name SHALL match either an OpenSpec change name or a synthetic run id created by a branch-path command

### Requirement: Run state schema

The run state JSON SHALL contain the following fields: `run_id`, `change_name`, `current_phase`, `status`, `allowed_events`, `created_at`, `updated_at`, `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`. Synthetic runs MAY additionally include `run_kind: "synthetic"`.

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

#### Scenario: Synthetic run state contents

- **WHEN** `specflow-run start <run_id> --run-kind synthetic` is executed
- **THEN** the JSON SHALL contain `run_id` equal to the provided synthetic run id
- **THEN** `change_name` SHALL be `null`
- **THEN** `run_kind` SHALL be `"synthetic"`
- **THEN** `allowed_events` SHALL still be derived from the workflow definition for `start`

#### Scenario: Run state after transition

- **WHEN** a transition advances the run from `start` to `proposal_draft`
- **THEN** `current_phase` SHALL be `proposal_draft`
- **THEN** `allowed_events` SHALL be recomputed from the workflow definition for the `proposal_draft` state
- **THEN** `updated_at` SHALL be updated to the current time
- **THEN** all metadata fields (`project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`) SHALL be preserved unchanged

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

### Requirement: Existing run files are the source of truth

After a run file exists, lifecycle commands SHALL operate on `.specflow/runs/<run_id>/run.json` without re-validating `openspec/changes/<run_id>/proposal.md`.

#### Scenario: Synthetic status lookup

- **WHEN** `specflow-run status <synthetic-run-id>` is executed for an existing synthetic run
- **THEN** the command SHALL read the run file successfully even though there is no matching `openspec/changes/<run_id>/proposal.md`

#### Scenario: Synthetic advance

- **WHEN** `specflow-run advance <synthetic-run-id> explore_start` is executed for an existing synthetic run
- **THEN** the command SHALL update the run file and history based on the stored run state

### Requirement: Update-field subcommand

The `specflow-run` CLI SHALL support an `update-field <run_id> <field> <value>` subcommand for controlled mutation of mutable run-state fields.

#### Scenario: Update-field writes last_summary_path

- **WHEN** `specflow-run update-field <run_id> last_summary_path "openspec/changes/<run_id>/approval-summary.md"` is executed
- **THEN** `last_summary_path` SHALL be updated to the provided path
- **THEN** `updated_at` SHALL be updated to the current timestamp

#### Scenario: Update-field rejects non-mutable fields

- **WHEN** `specflow-run update-field <run_id> current_phase hacked` is executed
- **THEN** the script SHALL exit with code 1 and print an error to stderr
