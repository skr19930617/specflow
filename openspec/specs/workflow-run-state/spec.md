# workflow-run-state Specification

## Purpose

Describe the authoritative workflow state machine and the persisted run-state
CLI used by `specflow`.
## Requirements
### Requirement: The workflow machine defines the authoritative phase graph

The system SHALL expose a flat workflow machine with version `4.0` and the
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
`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and
SHALL populate current workflow metadata including the auto-generated run_id in
`<change_id>-<sequence>` format.

Repository metadata SHALL be obtained via the injected `WorkspaceContext` interface
rather than being passed as direct parameters or resolved internally.

#### Scenario: Started runs capture repository metadata via WorkspaceContext
- **WHEN** a run is started inside a valid workspace
- **THEN** `run-state` SHALL include `run_id`, `change_name`, `project_id`,
  `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`,
  `allowed_events`, `created_at`, and `updated_at`
- **AND** `repo_name` SHALL be obtained from `WorkspaceContext.projectDisplayName()`
- **AND** `repo_path` SHALL be obtained from `WorkspaceContext.projectRoot()`
- **AND** `branch_name` SHALL be obtained from `WorkspaceContext.branchName()`
- **AND** `worktree_path` SHALL be obtained from `WorkspaceContext.worktreePath()`

#### Scenario: Run start receives WorkspaceContext via dependency injection
- **WHEN** `specflow-run start` is invoked from a CLI entry point
- **THEN** the CLI entry point SHALL construct a `WorkspaceContext` implementation and pass it to the run start function
- **AND** the run start function SHALL NOT resolve workspace metadata independently

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

The run-state CLI SHALL read and write run state through the `RunArtifactStore` interface, never through direct filesystem path construction. The `specflow-prepare-change` CLI SHALL also use the store for run enumeration.

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

#### Scenario: No CLI binary contains hardcoded `.specflow/runs` paths

- **WHEN** the source of `specflow-run.ts` and `specflow-prepare-change.ts` is inspected
- **THEN** neither file SHALL contain the string literal `.specflow/runs`

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

### Requirement: `specflow-run suspend` pauses a running workflow

`specflow-run suspend <run_id>` SHALL set the run status to `suspended`
without changing the current_phase. The run SHALL reject all events except
`resume` while suspended.

#### Scenario: Suspend preserves current phase

- **WHEN** `specflow-run suspend <run_id>` is invoked on an active run in
  `design_draft`
- **THEN** the run status SHALL change to `suspended`
- **AND** `current_phase` SHALL remain `design_draft`
- **AND** `allowed_events` SHALL contain only `resume`

#### Scenario: Suspend is rejected on terminal runs

- **WHEN** `specflow-run suspend <run_id>` is invoked on a run in `approved`
- **THEN** the command SHALL fail with error "Cannot suspend a terminal run"

#### Scenario: Suspend is rejected on already suspended runs

- **WHEN** `specflow-run suspend <run_id>` is invoked on a suspended run
- **THEN** the command SHALL fail with error "Run is already suspended"

### Requirement: `specflow-run resume` restarts a suspended workflow

`specflow-run resume <run_id>` SHALL restore the run status to `active` and
recompute `allowed_events` based on the preserved `current_phase`.

#### Scenario: Resume restores allowed events for the preserved phase

- **WHEN** `specflow-run resume <run_id>` is invoked on a suspended run
  whose `current_phase` is `design_draft`
- **THEN** the run status SHALL change to `active`
- **AND** `allowed_events` SHALL match the allowed events for `design_draft`

#### Scenario: Resume is rejected on non-suspended runs

- **WHEN** `specflow-run resume <run_id>` is invoked on an active run
- **THEN** the command SHALL fail with error "Run is not suspended"

### Requirement: Retry creates a new run via `specflow-run start --retry`

`specflow-run start <change_id> --retry` SHALL create a new run for the same
change_id, referencing the previous terminal run. Retry is a change-level
operation, not a state machine event.

#### Scenario: Retry creates a fresh run from proposal_draft

- **WHEN** `specflow-run start <change_id> --retry` is invoked
- **AND** the most recent run for the change is in `approved` or `decomposed`
- **THEN** a new run SHALL be created with `current_phase = proposal_draft`
- **AND** `previous_run_id` SHALL reference the prior run's run_id
- **AND** `source`, `change_name`, and `agents` SHALL be copied from the prior
  run
- **AND** `history` SHALL be an empty array

#### Scenario: Retry is rejected for rejected changes

- **WHEN** `specflow-run start <change_id> --retry` is invoked
- **AND** the most recent run is in `rejected`
- **THEN** the command SHALL fail with error "Rejected changes cannot be
  retried — create a new change"

#### Scenario: Retry is rejected when a non-terminal run exists

- **WHEN** `specflow-run start <change_id> --retry` is invoked
- **AND** a non-terminal run exists for that change_id
- **THEN** the command SHALL fail with error "Non-terminal run exists"

### Requirement: Run status field distinguishes active from suspended

The `status` field in `run.json` SHALL accept `active`, `suspended`, or
`terminal` values. Status is orthogonal to `current_phase`.

#### Scenario: New runs start with active status

- **WHEN** a run is created
- **THEN** `status` SHALL be `active`

#### Scenario: Terminal runs have terminal status

- **WHEN** a run reaches `approved`, `decomposed`, or `rejected`
- **THEN** `status` SHALL be `terminal`

### Requirement: Run-state files support the new identity model

Run-state persistence SHALL store runs under `.specflow/runs/<run_id>/`
using the auto-generated run_id, and SHALL include `previous_run_id` for
retry lineage tracking.

#### Scenario: Run directory uses run_id not change_id

- **WHEN** a new run is created with run_id `add-user-auth-2`
- **THEN** the run state SHALL be stored at
  `.specflow/runs/add-user-auth-2/run.json`

#### Scenario: previous_run_id is null for first runs

- **WHEN** the first run for a change_id is created
- **THEN** `previous_run_id` SHALL be `null`

#### Scenario: previous_run_id references the prior run on retry

- **WHEN** a retry run is created
- **THEN** `previous_run_id` SHALL contain the run_id of the most recent
  prior run

### Requirement: Run-state history entries record actor provenance

Each history entry appended to run-state SHALL include actor provenance, regardless of which surface or adapter initiated the transition. The provenance SHALL identify the actor kind and the actor identity.

#### Scenario: History entry includes actor kind and identity

- **WHEN** a run-state transition is recorded as a history entry
- **THEN** the entry SHALL include an `actor` field identifying the actor kind (`human`, `ai-agent`, or `automation`)
- **AND** the entry SHALL include an `actor_id` field providing a stable identifier for the specific actor (e.g., username, agent name, or automation source identifier)

#### Scenario: Delegated gated approval history captures delegating human provenance

- **WHEN** `accept_spec`, `accept_design`, or `accept_apply` is recorded as a
  delegated `approve` transition
- **THEN** the entry SHALL include `actor: "ai-agent"` and `actor_id`
  identifying the executing ai-agent actor
- **AND** the entry SHALL include `delegated_by: "human"`
- **AND** the entry SHALL include `delegated_by_id` identifying the
  delegating human actor

#### Scenario: Surface provenance is optional

- **WHEN** a history entry is created
- **THEN** the entry MAY include a `surface` field identifying the surface type
- **AND** omitting the `surface` field SHALL NOT cause an error

#### Scenario: System-generated transitions use automation actor

- **WHEN** a system-generated event (timeout, auto-advance) triggers a transition
- **THEN** the history entry SHALL record `actor: "automation"` and `actor_id` SHALL identify the automation source (e.g., `"system:timeout"`, `"ci:webhook"`)

#### Scenario: Legacy runs without provenance default to unknown

- **WHEN** run-state is read and a history entry lacks the `actor` field
- **THEN** the system SHALL treat the actor as `"unknown"`
- **AND** existing run behavior SHALL NOT be altered

### Requirement: CLI entry points resolve and inject the RunArtifactStore

CLI entry points (`specflow-run`, `specflow-prepare-change`) SHALL instantiate a `RunArtifactStore` implementation at startup and inject it into all subcommand handlers. The default implementation SHALL be `LocalFsRunArtifactStore`. No runtime store-switching mechanism is provided by this change.

#### Scenario: specflow-run instantiates LocalFsRunArtifactStore at startup

- **WHEN** `specflow-run` is invoked with any subcommand
- **THEN** it SHALL create a `LocalFsRunArtifactStore` instance using the repository root
- **AND** it SHALL pass the store instance to the subcommand handler

#### Scenario: specflow-prepare-change uses injected store for run lookup

- **WHEN** `specflow-prepare-change` searches for existing non-terminal runs
- **THEN** it SHALL use `RunArtifactStore.list()` with a `changeId` query
- **AND** it SHALL NOT construct `.specflow/runs/` paths directly

### Requirement: High-level run operations use RunArtifactStore

A `run-store-ops` module SHALL provide high-level run operations that accept a `RunArtifactStore` parameter. These operations SHALL replace direct filesystem helpers previously in `run-identity`.

#### Scenario: findLatestRun retrieves the most recent run for a change

- **WHEN** `findLatestRun(store, changeId)` is invoked
- **THEN** it SHALL call `store.list({ changeId })` to enumerate runs
- **AND** it SHALL parse each run_id to extract the sequence number
- **AND** it SHALL return the run state with the highest sequence number

#### Scenario: generateRunId computes the next sequential ID

- **WHEN** `generateRunId(store, changeId)` is invoked
- **THEN** it SHALL call `store.list({ changeId })` to find existing runs
- **AND** it SHALL return `<changeId>-<N>` where N is one greater than the highest existing sequence number
- **AND** it SHALL return `<changeId>-1` when no prior runs exist

#### Scenario: findRunsForChange returns all runs for a change

- **WHEN** `findRunsForChange(store, changeId)` is invoked
- **THEN** it SHALL call `store.list({ changeId })` and read each run state via `store.read()`
- **AND** it SHALL return the results sorted by sequence number ascending

#### Scenario: extractSequence parses the sequence from a run ID

- **WHEN** `extractSequence(runId, changeId)` is invoked
- **THEN** it SHALL return the integer N from the `<changeId>-<N>` format
- **AND** it SHALL throw if the run_id does not match the expected format

