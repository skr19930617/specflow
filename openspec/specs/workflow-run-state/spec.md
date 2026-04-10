# workflow-run-state Specification

## Purpose

Describe the authoritative workflow state machine and the persisted run-state
CLI used by `specflow`.

## Requirements

### Requirement: The workflow machine defines the authoritative phase graph

The system SHALL expose a flat workflow machine with version `3.0` and the
exact states, events, and transitions declared in
`src/lib/workflow-machine.ts`.

#### Scenario: The workflow graph includes the mainline and utility branches

- **WHEN** the workflow exports are inspected
- **THEN** they SHALL include the mainline states from `start` through
  `approved`
- **AND** they SHALL also include `decomposed`, `rejected`, `explore`, and
  `spec_bootstrap`

#### Scenario: Final states are terminal

- **WHEN** `approved`, `decomposed`, or `rejected` is inspected
- **THEN** the state SHALL expose no allowed events

#### Scenario: Branch-path events are explicit

- **WHEN** the workflow events are inspected
- **THEN** they SHALL include `explore_start`, `explore_complete`,
  `spec_bootstrap_start`, and `spec_bootstrap_complete`

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL create `.specflow/runs/<run_id>/run.json` and SHALL
populate the current workflow metadata for the new run.

#### Scenario: Change runs require an existing local proposal artifact

- **WHEN** `specflow-run start <run_id>` is invoked with the default run kind
- **THEN** it SHALL require `openspec/changes/<run_id>/proposal.md` to exist

#### Scenario: Started runs capture repository metadata

- **WHEN** a run is started inside a git repository
- **THEN** `run.json` SHALL include `project_id`, `repo_name`, `repo_path`,
  `branch_name`, `worktree_path`, `agents`, `allowed_events`, `created_at`,
  and `updated_at`

#### Scenario: Started runs persist optional normalized source metadata

- **WHEN** `specflow-run start <run_id> --source-file <path>` succeeds
- **THEN** the stored run state SHALL include a `source` object loaded from the
  provided file
- **AND** the stored object SHALL include `kind`, `provider`, `reference`, and
  `title`

#### Scenario: Synthetic runs bypass change-directory lookup

- **WHEN** `specflow-run start <run_id> --run-kind synthetic` is invoked
- **THEN** the run SHALL set `run_kind` to `synthetic`
- **AND** `change_name` SHALL be `null`

### Requirement: `specflow-run advance` validates and records transitions

`specflow-run advance <run_id> <event>` SHALL apply only declared transitions,
recompute allowed events, and append immutable history entries.

#### Scenario: Happy-path advancement reaches approved

- **WHEN** the mainline events are applied in order from `propose` through
  `accept_apply`
- **THEN** the run SHALL reach `approved`
- **AND** `allowed_events` SHALL become an empty array

#### Scenario: Revision events return to the phase draft state

- **WHEN** `revise_proposal`, `revise_design`, or `revise_apply` is applied in
  an allowed review or validation state
- **THEN** the run SHALL transition back to the matching draft phase

#### Scenario: Invalid transitions report allowed events

- **WHEN** an event is not valid for the current phase
- **THEN** the command SHALL fail
- **AND** the error output SHALL list the allowed events for that phase

### Requirement: Run-state reads and writes are stable CLI operations

The run-state CLI SHALL expose status reads and targeted field updates without
changing the state-machine rules.

#### Scenario: `status` returns the stored run state

- **WHEN** `specflow-run status <run_id>` is invoked
- **THEN** it SHALL print the current `run.json` payload

#### Scenario: `get-field` returns a single field value

- **WHEN** `specflow-run get-field <run_id> current_phase` is invoked
- **THEN** it SHALL print the stored `current_phase` value as JSON

#### Scenario: `update-field` persists targeted metadata

- **WHEN** `specflow-run update-field <run_id> last_summary_path <value>` is
  invoked
- **THEN** it SHALL update `last_summary_path` while preserving the rest of the
  run state

### Requirement: Run-state files are written atomically and resolved from the workflow definition

Run-state persistence SHALL use atomic file replacement and SHALL load the
workflow definition from the current project before falling back to packaged or
installed copies.

#### Scenario: Writes use temp-file replacement

- **WHEN** `run.json` is written
- **THEN** the command SHALL write to a temporary sibling path and rename it
  into place

#### Scenario: Workflow lookup prefers project-local assets

- **WHEN** `specflow-run` resolves `state-machine.json`
- **THEN** it SHALL first check `global/workflow/state-machine.json`
- **AND** only fall back to packaged or installed copies if the project-local
  file does not exist
