## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and SHALL populate the current workflow metadata for the new run. The run_id SHALL be auto-generated in `<change_id>-<sequence>` format.

#### Scenario: Change runs require an existing local proposal artifact

- **WHEN** `specflow-run start <change_id>` is invoked with the default run kind
- **THEN** it SHALL use the `ChangeArtifactStore` to verify that `(change_id, proposal)` exists
- **AND** it SHALL fail with a typed missing-artifact error if the proposal does not exist

#### Scenario: Started runs capture repository metadata

- **WHEN** a run is started inside a git repository
- **THEN** `run-state` SHALL include `run_id`, `change_name`, `project_id`,
  `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`,
  `allowed_events`, `created_at`, and `updated_at`

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

#### Scenario: run_id is auto-generated from change_id and sequence

- **WHEN** `specflow-run start <change_id>` is invoked
- **THEN** the run_id SHALL be `<change_id>-<N>` where N is one greater
  than the highest existing sequence number for that change_id
- **AND** the run_id SHALL be stored explicitly in the run-state document

### Requirement: `specflow-run advance` validates and records transitions

`specflow-run advance <run_id> <event>` SHALL apply only declared transitions, validate required artifacts via the artifact-phase gate matrix, recompute allowed events, and append immutable history entries.

#### Scenario: Happy-path advancement reaches approved

- **WHEN** the mainline events are applied in order from `propose` through
  `accept_apply`
- **THEN** the run SHALL reach `approved`
- **AND** `allowed_events` SHALL become an empty array

#### Scenario: Proposal review approval enters the spec phase

- **WHEN** `proposal_review_approved` is applied in `proposal_review`
- **THEN** the run SHALL transition to `spec_draft`

#### Scenario: Successful spec validation gates access to design work

- **WHEN** `validate_spec` then `spec_validated` are applied in order
- **THEN** the run SHALL transition from `spec_draft` to `spec_validate`
- **AND** then to `spec_ready`
- **AND** only then SHALL `accept_spec` be available to enter `design_draft`

#### Scenario: Revision events return to the phase draft state

- **WHEN** `revise_proposal`, `revise_spec`, `revise_design`, or
  `revise_apply` is applied in an allowed review or validation state
- **THEN** the run SHALL transition back to the matching draft phase

#### Scenario: Invalid transitions report allowed events

- **WHEN** an event is not valid for the current phase
- **THEN** the command SHALL fail
- **AND** the error output SHALL list the allowed events for that phase

#### Scenario: Advance is rejected when run is suspended

- **WHEN** `specflow-run advance <run_id> <event>` is invoked
- **AND** the run status is `suspended`
- **AND** the event is not `resume`
- **THEN** the command SHALL fail with error "Run is suspended -- resume first"

#### Scenario: Advance checks artifact-phase gate before transition

- **WHEN** `specflow-run advance <run_id> <event>` is invoked
- **AND** the gate matrix requires artifacts for the target transition
- **THEN** the command SHALL verify artifact existence via the appropriate store interface
- **AND** it SHALL fail with a typed missing-artifact error if any required artifact is absent

### Requirement: Run-state reads and writes are stable CLI operations

The run-state CLI SHALL read and write run state through the `RunArtifactStore` interface, never through direct filesystem path construction.

#### Scenario: `status` returns the stored run state

- **WHEN** `specflow-run status <run_id>` is invoked
- **THEN** it SHALL read from `RunArtifactStore.read(runId, run-state)` and print the payload

#### Scenario: `get-field` returns a single field value

- **WHEN** `specflow-run get-field <run_id> current_phase` is invoked
- **THEN** it SHALL read from `RunArtifactStore.read(runId, run-state)` and print the stored `current_phase` value as JSON

#### Scenario: `update-field` persists targeted metadata

- **WHEN** `specflow-run update-field <run_id> last_summary_path <value>` is
  invoked
- **THEN** it SHALL read from `RunArtifactStore`, update the field, and write back via `RunArtifactStore.write(runId, run-state, content)`

### Requirement: Run-state files are written atomically and resolved from the workflow definition

Run-state persistence SHALL use the `RunArtifactStore` interface which guarantees atomic writes. The workflow definition SHALL be loaded from the current project before falling back to packaged or installed copies.

#### Scenario: Writes use atomic replacement

- **WHEN** run state is written via `RunArtifactStore`
- **THEN** the adapter SHALL ensure atomic replacement — no partial reads are possible

#### Scenario: Workflow lookup prefers project-local assets

- **WHEN** `specflow-run` resolves `state-machine.json`
- **THEN** it SHALL first check `global/workflow/state-machine.json`
- **AND** only fall back to packaged or installed copies if the project-local
  file does not exist
