# workflow-run-state Specification

## Purpose

Describe the authoritative workflow state machine and the persisted run-state
CLI used by `specflow`.

Related specs:
- `workflow-observation-events`: every run-state transition emits corresponding observation events; the event stream remains consistent with the snapshot readable via the run-state CLI.
- `workflow-gate-semantics`: gate lifecycle events are part of the observation stream.

## Requirements
### Requirement: The workflow machine defines the authoritative phase graph

The system SHALL expose a flat workflow machine with version `4.1` and the
exact states, events, and transitions declared in
`src/lib/workflow-machine.ts`. Version `4.1` introduces the `spec_verify`
phase between `spec_validate` and `spec_ready`, along with the
`spec_verified` and `revise_spec` events that drive it.

#### Scenario: The workflow graph includes the mainline and utility branches

- **WHEN** the workflow exports are inspected
- **THEN** they SHALL include the mainline states from `start` through
  `approved`
- **AND** they SHALL also include `decomposed`, `rejected`, `explore`, and
  `spec_bootstrap`
- **AND** they SHALL include the new state `spec_verify`

#### Scenario: Final states are terminal

- **WHEN** `approved`, `decomposed`, or `rejected` is inspected
- **THEN** the state SHALL expose no allowed events

#### Scenario: Branch-path events are explicit

- **WHEN** the workflow events are inspected
- **THEN** they SHALL include `explore_start`, `explore_complete`,
  `spec_bootstrap_start`, and `spec_bootstrap_complete`
- **AND** they SHALL also include `spec_verified` and `revise_spec`

#### Scenario: Spec verification sits between spec_validate and spec_ready

- **WHEN** the transitions out of `spec_validate` are inspected
- **THEN** the `spec_validated` event SHALL transition to `spec_verify`
  (not directly to `spec_ready`)
- **AND** the `spec_verified` event SHALL transition from `spec_verify`
  to `spec_ready`

#### Scenario: Revise_spec sends the run back to spec_draft

- **WHEN** the transitions out of `spec_verify` are inspected
- **THEN** the `revise_spec` event SHALL transition from `spec_verify`
  to `spec_draft`
- **AND** on the next forward pass the run SHALL traverse
  `spec_draft → spec_validate → spec_verify` again (no fast-path that
  skips `spec_validate`)

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL orchestrate run creation by
(1) verifying preconditions via `RunArtifactStore`,
`ChangeArtifactStore`, and `WorkspaceContext` in the wiring
layer, (2) invoking the pure core start function with explicit
precondition inputs and a `LocalRunState` adapter seed, and
(3) persisting the returned `CoreRunState & LocalRunState` value
via `await RunArtifactStore.write()`. The persisted run state
SHALL be identical in shape and content to the pre-existing
`run.json` layout. The run_id generation SHALL continue to use
`run-store-ops.generateRunId(store, changeId)`, invoked from the
wiring layer.

#### Scenario: Change runs require an existing local proposal artifact

- **WHEN** `specflow-run start <change_id>` is invoked with the
  default run kind
- **THEN** the wiring layer SHALL use `ChangeArtifactStore` to
  verify that `(change_id, proposal)` exists and SHALL pass
  `proposalExists: boolean` to the core start function
- **AND** the core function SHALL return a typed
  `change_proposal_missing` error when `proposalExists` is
  `false`
- **AND** the CLI SHALL map that error to exit code `1` with the
  pre-existing stderr text

#### Scenario: Started runs capture repository metadata via WorkspaceContext

- **WHEN** a run is started inside a valid workspace
- **THEN** the wiring layer SHALL construct the `LocalRunState`
  slice from `WorkspaceContext.projectIdentity()`,
  `projectDisplayName()`, `projectRoot()`, `branchName()`,
  `worktreePath()`, and the literal `null` for
  `last_summary_path`
- **AND** it SHALL pass the slice as the adapter seed to
  `startChangeRun<LocalRunState>`
- **AND** the persisted `run.json` SHALL include `run_id`,
  `change_name`, `project_id`, `repo_name`, `repo_path`,
  `branch_name`, `worktree_path`, `agents`, `allowed_events`,
  `created_at`, and `updated_at`

#### Scenario: Synthetic runs bypass change-directory lookup

- **WHEN** `specflow-run start <run_id> --run-kind synthetic` is
  invoked
- **THEN** the wiring layer SHALL NOT call `ChangeArtifactStore`
- **AND** it SHALL pass `existingRunExists` computed via
  `await RunArtifactStore.exists(runRef(runId))`
- **AND** the run_kind in the persisted state SHALL be
  `synthetic` with `change_name` set to `null`

#### Scenario: run_id is auto-generated from change_id and sequence

- **WHEN** `specflow-run start <change_id>` is invoked
- **THEN** the wiring layer SHALL compute `nextRunId` via
  `await generateRunId(store, changeId)` and SHALL pass it as
  a precondition input to the core function
- **AND** the resulting run_id SHALL be `<changeId>-<N>` where
  N is one greater than the highest existing sequence number

#### Scenario: Start writes run state through the store from the wiring layer

- **WHEN** `specflow-run start` completes successfully
- **THEN** the wiring layer SHALL persist the returned state via
  `await RunArtifactStore.write(runRef(run_id), JSON.stringify(state, null, 2))`
- **AND** the core start function SHALL NOT call any store method
- **AND** the atomic-replacement guarantee SHALL be provided by
  `RunArtifactStore.write` — not by any new helper layer

### Requirement: `specflow-run advance` validates and records transitions

`specflow-run advance <run_id> <event>` SHALL, in the wiring
layer, (1) load the current run state via `await
RunArtifactStore.read(runRef(runId))`, (2) invoke the pure
`advanceRun<LocalRunState>` core function with the loaded state,
the requested event, and `nowIso`, (3) persist the returned state
via `await RunArtifactStore.write()` on success, and (4) map the
`Result` to stdout / stderr / exit code. The core function SHALL
apply only declared transitions, validate required artifacts via
the artifact-phase gate matrix (using precondition inputs rather
than store calls), recompute allowed events, and append immutable
history entries.

#### Scenario: Happy-path advancement reaches approved

- **WHEN** the mainline events are applied in order from
  `propose` through `accept_apply`
- **THEN** the run SHALL reach `approved`
- **AND** `allowed_events` SHALL become an empty array
- **AND** each transition SHALL read the prior state, invoke the
  pure core function, and write the result via the store

#### Scenario: Advance checks artifact-phase gate via precondition inputs

- **WHEN** `specflow-run advance <run_id> <event>` is invoked
- **AND** the gate matrix requires artifacts for the target
  transition
- **THEN** the wiring layer SHALL verify artifact existence via
  the appropriate store interface and SHALL pass the resulting
  boolean(s) to the core advance function
- **AND** the core function SHALL return a typed
  missing-artifact error when a required artifact is absent

#### Scenario: Invalid transitions report allowed events

- **WHEN** an event is not valid for the current phase
- **THEN** the core function SHALL return a typed
  `invalid_event` error whose `details` list the allowed events
  for that phase
- **AND** the CLI SHALL map the error to exit code `1`

### Requirement: Run-state reads and writes are stable CLI operations

The run-state CLI SHALL read and write run state through the
`RunArtifactStore` interface in the wiring layer, never through
direct filesystem path construction and never from within the
core runtime. The `specflow-prepare-change` CLI SHALL also use
the store for run enumeration from its wiring layer. All store
operations SHALL be asynchronous and the CLI SHALL `await` them.

#### Scenario: `status` returns the stored run state

- **WHEN** `specflow-run status <run_id>` is invoked
- **THEN** the CLI SHALL read from `await
  RunArtifactStore.read(runId, run-state)` and print the payload
- **AND** no core module SHALL participate in `status`

#### Scenario: `get-field` returns a single field value

- **WHEN** `specflow-run get-field <run_id> current_phase` is
  invoked
- **THEN** the CLI SHALL read from `await
  RunArtifactStore.read(runId, run-state)` and print the stored
  `current_phase` value as JSON
- **AND** no core module SHALL participate in `get-field`

#### Scenario: `update-field` persists targeted metadata via wiring

- **WHEN** `specflow-run update-field <run_id> last_summary_path
  <value>` is invoked
- **THEN** the CLI SHALL read from `await RunArtifactStore.read`,
  invoke the pure `updateField<LocalRunState>` core function,
  and write back via `await RunArtifactStore.write()`

#### Scenario: No CLI binary contains hardcoded `.specflow/runs` paths

- **WHEN** the source of `specflow-run.ts` and
  `specflow-prepare-change.ts` is inspected
- **THEN** neither file SHALL contain the string literal
  `.specflow/runs`

### Requirement: Run-state files are written atomically and resolved from the workflow definition

Run-state persistence SHALL use the `RunArtifactStore` interface which guarantees atomic writes. The workflow definition SHALL be loaded from the current project before falling back to packaged or installed copies. All `RunArtifactStore` methods SHALL return `Promise` and callers SHALL `await` them.

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

Each history entry appended to run-state SHALL include actor provenance, regardless of which surface or adapter initiated the transition. The provenance SHALL identify the actor kind and the actor identity. History entries for transitions that create or update interaction records SHALL additionally include a `record_ref` field linking the entry to the associated persistence record.

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

#### Scenario: History entry includes record_ref for record-associated transitions

- **WHEN** a transition creates or updates an interaction record (e.g., entering `spec_ready`, processing `accept_spec`, issuing a clarify question, or receiving a clarify response)
- **THEN** the history entry SHALL include a `record_ref` field containing the `record_id` of the associated interaction record
- **AND** the `record_ref` field SHALL be a string matching the `record_id` of the corresponding `ApprovalRecord` or `ClarifyRecord`

#### Scenario: History entry omits record_ref for non-record transitions

- **WHEN** a transition does not involve interaction record creation or update (e.g., `check_scope`, `continue_proposal`, `validate_spec`)
- **THEN** the history entry SHALL NOT include a `record_ref` field
- **AND** the absence of `record_ref` SHALL NOT cause an error

#### Scenario: Existing history entries without record_ref remain valid

- **WHEN** run-state is read and a history entry lacks the `record_ref` field
- **THEN** the system SHALL treat the entry as having no associated interaction record
- **AND** no migration of existing data SHALL be required

### Requirement: CLI entry points resolve and inject the RunArtifactStore

CLI entry points SHALL instantiate a `RunArtifactStore` implementation at startup. The entry points covered by this requirement SHALL be `specflow-run` and `specflow-prepare-change`. The CLI SHALL perform all workflow-related I/O — reads, writes, enumeration, and artifact existence checks — via the injected store and related collaborators `ChangeArtifactStore`, `WorkspaceContext`, and `WorkflowDefinition`. The CLI SHALL compute precondition inputs in the wiring layer and SHALL invoke pure core-runtime commands with those inputs. The default `RunArtifactStore` implementation SHALL be `LocalFsRunArtifactStore`. No runtime store-switching mechanism SHALL be provided by this change. The CLI SHALL map rejected promises by translating `ArtifactStoreError` kinds to appropriate stderr messages and exit codes.

#### Scenario: specflow-run instantiates all collaborators at startup

- **WHEN** `specflow-run` is invoked with any subcommand that
  needs them
- **THEN** it SHALL create a `LocalFsRunArtifactStore`, a
  `LocalFsChangeArtifactStore` (for commands that read change
  artifacts), and a `WorkspaceContext` using the repository root
- **AND** it SHALL load a `WorkflowDefinition` from
  `state-machine.json` (for commands that need it)
- **AND** it SHALL compute precondition inputs (existing runs,
  proposal existence, next run_id, current time) before invoking
  the core command
- **AND** it SHALL invoke the core command with those
  precondition inputs and the `LocalRunState` adapter seed

#### Scenario: specflow-prepare-change uses injected store for run lookup

- **WHEN** `specflow-prepare-change` searches for existing
  non-terminal runs
- **THEN** it SHALL use `await RunArtifactStore.list()` with a
  `changeId` query
- **AND** it SHALL NOT construct `.specflow/runs/` paths directly

#### Scenario: CLI maps ArtifactStoreError to stderr and exit codes

- **WHEN** a core runtime function rejects with an
  `ArtifactStoreError` surfaced by a wiring-layer read or write
- **THEN** the CLI SHALL map the error `kind` to the appropriate
  stderr message
- **AND** it SHALL exit with code `1`

### Requirement: High-level run operations use RunArtifactStore

A `run-store-ops` module SHALL provide high-level run operations that accept a `RunArtifactStore` parameter. These operations SHALL replace direct filesystem helpers previously in `run-identity`. All operations SHALL be `async` (returning `Promise`).

#### Scenario: findLatestRun retrieves the most recent run for a change

- **WHEN** `await findLatestRun(store, changeId)` is invoked
- **THEN** it SHALL call `await store.list({ changeId })` to enumerate runs
- **AND** it SHALL parse each run_id to extract the sequence number
- **AND** it SHALL return the run state with the highest sequence number

#### Scenario: generateRunId computes the next sequential ID

- **WHEN** `await generateRunId(store, changeId)` is invoked
- **THEN** it SHALL call `await store.list({ changeId })` to find existing runs
- **AND** it SHALL return `<changeId>-<N>` where N is one greater than the highest existing sequence number
- **AND** it SHALL return `<changeId>-1` when no prior runs exist

#### Scenario: findRunsForChange returns all runs for a change

- **WHEN** `await findRunsForChange(store, changeId)` is invoked
- **THEN** it SHALL call `await store.list({ changeId })` and read each run state via `await store.read()`
- **AND** it SHALL return the results sorted by sequence number ascending

#### Scenario: extractSequence parses the sequence from a run ID

- **WHEN** `extractSequence(runId, changeId)` is invoked
- **THEN** it SHALL return the integer N from the `<changeId>-<N>` format
- **AND** it SHALL throw if the run_id does not match the expected format

### Requirement: Core runtime returns typed Results instead of writing to process I/O

The core runtime SHALL NOT call `process.stdout.write`,
`process.stderr.write`, or `process.exit`. Every command SHALL return a
`Result<Ok, CoreRuntimeError>` discriminated union, where `Ok` is the JSON
payload that the CLI currently prints to stdout and `CoreRuntimeError` is
an object shaped `{ kind, message, details? }` with `kind` drawn from a
closed set (e.g. `not_in_git_repo`, `run_not_found`, `invalid_event`,
`invalid_arguments`, `change_proposal_missing`, `schema_mismatch`).

#### Scenario: Successful commands return an Ok Result

- **WHEN** a core-runtime command completes successfully
- **THEN** it SHALL return `{ ok: true, value: <payload> }`
- **AND** `<payload>` SHALL equal the JSON object that the CLI prints to
  stdout for that command

#### Scenario: Failed commands return a typed error Result

- **WHEN** a core-runtime command fails because of a known error condition
- **THEN** it SHALL return `{ ok: false, error: { kind, message } }`
- **AND** `kind` SHALL be one of the declared error kinds
- **AND** `message` SHALL equal the stderr text the current CLI produces
  for that condition
- **AND** the function SHALL NOT throw, call `process.exit`, or write to
  `process.stderr`

### Requirement: `specflow-run` is the local wiring layer over the core runtime

The `specflow-run` binary at `src/bin/specflow-run.ts` SHALL be the local
wiring layer that adapts the core runtime to a command-line interface. Its
responsibilities SHALL be limited to: parsing `process.argv`, discovering
and loading `state-machine.json` (project local → dist → installed),
constructing `LocalFsRunArtifactStore`, `LocalFsChangeArtifactStore`, and
`createLocalWorkspaceContext()`, invoking a core-runtime command, and
mapping its `Result` to `process.stdout`, `process.stderr`, and
`process.exit`.

#### Scenario: CLI writes Ok payloads to stdout as JSON

- **WHEN** a core-runtime command returns `{ ok: true, value }`
- **THEN** `specflow-run` SHALL write `JSON.stringify(value, null, 2)\n`
  to `process.stdout`
- **AND** it SHALL exit with code `0`

#### Scenario: CLI maps typed errors to stderr and exit code 1

- **WHEN** a core-runtime command returns `{ ok: false, error: { kind,
  message } }`
- **THEN** `specflow-run` SHALL write `"Error: " + message + "\n"` (or the
  exact message already prefixed today) to `process.stderr`
- **AND** it SHALL exit with code `1`
- **AND** the observable stderr text SHALL match the text emitted before
  this refactor for the same failure

#### Scenario: Observable CLI surface is preserved

- **WHEN** any existing `specflow-run <subcommand>` invocation is compared
  before and after this refactor
- **THEN** its command-line flags, stdout JSON shape, stderr message text,
  and exit codes SHALL be identical

### Requirement: Core-runtime tests exercise the runtime without the CLI

The `src/tests/` suite SHALL include tests that drive the core
runtime directly as pure function invocations — supplying an
explicit current state, precondition inputs, and adapter seed —
without spawning `specflow-run`, without instantiating any
`RunArtifactStore` or `ChangeArtifactStore`, and without
touching a real filesystem or git repository. The behavioral
assertions previously carried by the CLI test layer SHALL be
migrated into these core-runtime tests; the CLI test layer SHALL
keep only smoke tests for argv parsing, store wiring, and
stderr/exit mapping.

#### Scenario: Core tests cover every command branch

- **WHEN** the core-runtime test suite runs
- **THEN** it SHALL cover each command (`startChangeRun`,
  `startSyntheticRun`, `advanceRun`, `suspendRun`, `resumeRun`,
  `updateField`) including every currently-tested failure branch
  (e.g. `run_not_found` surfaced as a missing-state precondition,
  `invalid_event`, `run_suspended_exists`,
  `change_proposal_missing`)
- **AND** each test SHALL invoke the core command as a plain
  function without constructing any store

#### Scenario: CLI smoke tests remain for wiring

- **WHEN** the CLI test suite runs
- **THEN** it SHALL assert that argv parsing routes to the
  expected core command, that precondition inputs are gathered
  from the injected collaborators, that a representative success
  payload is written back via the store, and that a
  representative typed error maps to the correct
  stdout/stderr/exit outputs
- **AND** it SHALL NOT re-assert the full behavioral surface
  already covered by the core-runtime tests

### Requirement: Run-state types are partitioned into core and local-adapter partitions

The run-state type system SHALL expose three named types in `src/types/contracts.ts`:

- `CoreRunState` — the run-state fields every runtime persists
  regardless of adapter: `run_id`, `change_name`, `current_phase`,
  `status`, `allowed_events`, `agents`, `history`, `source`,
  `created_at`, `updated_at`, `previous_run_id`, and `run_kind`.
- `LocalRunState` — the run-state fields owned by the local
  filesystem adapter only: `project_id`, `repo_name`, `repo_path`,
  `branch_name`, `worktree_path`, and `last_summary_path`.
- `RunState` — the pre-existing compatibility alias, defined as
  `CoreRunState & LocalRunState`. Every consumer that imports
  `RunState` today SHALL keep compiling without modification.

The field membership of `CoreRunState` and `LocalRunState` SHALL be
disjoint, and their union SHALL equal the field set of `RunState`. No
field SHALL be added or removed from `RunState` by this partition.

#### Scenario: CoreRunState exposes the runtime-agnostic fields

- **WHEN** the `CoreRunState` type from `src/types/contracts.ts` is
  inspected
- **THEN** its keys SHALL be exactly `run_id`, `change_name`,
  `current_phase`, `status`, `allowed_events`, `agents`, `history`,
  `source`, `created_at`, `updated_at`, `previous_run_id`, and
  `run_kind`
- **AND** the type SHALL NOT expose any local-adapter field

#### Scenario: LocalRunState exposes only local-adapter fields

- **WHEN** the `LocalRunState` type from `src/types/contracts.ts` is
  inspected
- **THEN** its keys SHALL be exactly `project_id`, `repo_name`,
  `repo_path`, `branch_name`, `worktree_path`, and
  `last_summary_path`
- **AND** the type SHALL NOT expose any core runtime field

#### Scenario: RunState remains the intersection alias

- **WHEN** the `RunState` type is inspected
- **THEN** it SHALL equal `CoreRunState & LocalRunState`
- **AND** every existing consumer importing `RunState` SHALL continue
  to compile without code change

### Requirement: Compile-time drift guard enforces the core/local partition

A dedicated compile-time test SHALL live under `src/tests/` and SHALL
fail the TypeScript build if `CoreRunState` and `LocalRunState` stop
being disjoint or stop exhaustively covering `RunState`.

#### Scenario: Disjoint and exhaustive keys pass the guard

- **WHEN** `keyof CoreRunState` and `keyof LocalRunState` are disjoint
- **AND** their union equals `keyof RunState`
- **THEN** the type-level assertion in the drift-guard test SHALL
  resolve to a satisfied constraint
- **AND** the TypeScript build SHALL succeed

#### Scenario: Overlapping or missing keys break the build

- **WHEN** a field appears in both `CoreRunState` and `LocalRunState`
- **OR** a field in `RunState` appears in neither partition
- **THEN** the type-level assertion SHALL resolve to an error
- **AND** the TypeScript build SHALL fail before any runtime test runs

### Requirement: Core runtime signatures depend only on CoreRunState

Every core runtime function SHALL depend only on `CoreRunState &
TAdapter` where `TAdapter extends AdapterFields<TAdapter>`. No
core function SHALL reference a `LocalRunState` field by name. The
wiring layer under `src/bin/**` and the local filesystem adapter
under `src/adapters/**` SHALL continue to produce and pass the
combined `RunState` value by supplying `LocalRunState` as the
adapter seed.

#### Scenario: Core functions accept CoreRunState & TAdapter

- **WHEN** any function under `src/core/**` is inspected
- **AND** its signature accepts a run-state argument
- **THEN** the parameter type SHALL be `CoreRunState & TAdapter`
  (or a narrower subtype parameterized the same way)
- **AND** it SHALL NOT accept `RunState` directly, SHALL NOT
  accept `LocalRunState` directly, and SHALL NOT reference any
  `LocalRunState` field by name

#### Scenario: Wiring layer supplies LocalRunState as adapter seed

- **WHEN** `src/bin/specflow-run.ts` invokes a core command
- **THEN** it SHALL compute the `LocalRunState` slice from
  `WorkspaceContext` (for start) or from the previously-read
  state (for transitions) and pass it as the
  `TAdapter = LocalRunState` seed or state
- **AND** the persisted value SHALL be `CoreRunState &
  LocalRunState`, preserving the pre-existing `run.json` shape

### Requirement: ArtifactStore interfaces are asynchronous

The `RunArtifactStore` and `ChangeArtifactStore` interfaces SHALL define all methods as asynchronous, returning `Promise`. This enables non-blocking implementations for DB-backed, network-backed, and other async storage backends.

#### Scenario: RunArtifactStore methods return Promise

- **WHEN** the `RunArtifactStore` interface is inspected
- **THEN** `read()` SHALL return `Promise<string>`
- **AND** `write()` SHALL return `Promise<void>`
- **AND** `exists()` SHALL return `Promise<boolean>`
- **AND** `list()` SHALL return `Promise<readonly RunArtifactRef[]>`

#### Scenario: ChangeArtifactStore methods return Promise

- **WHEN** the `ChangeArtifactStore` interface is inspected
- **THEN** `read()` SHALL return `Promise<string>`
- **AND** `write()` SHALL return `Promise<void>`
- **AND** `exists()` SHALL return `Promise<boolean>`
- **AND** `list()` SHALL return `Promise<readonly ChangeArtifactRef[]>`
- **AND** `listChanges()` SHALL return `Promise<readonly string[]>`
- **AND** `changeExists()` SHALL return `Promise<boolean>`

#### Scenario: LocalFs adapters implement async interface with sync internals

- **WHEN** `LocalFsRunArtifactStore` or `LocalFsChangeArtifactStore` methods are called
- **THEN** they SHALL return resolved `Promise` values wrapping the synchronous filesystem result
- **AND** the caller SHALL not observe any behavioral difference other than the async wrapper

### Requirement: ArtifactStore errors use a typed error hierarchy

All `RunArtifactStore` and `ChangeArtifactStore` implementations SHALL reject with `ArtifactStoreError` instances. `ArtifactStoreError` SHALL be a typed error with a `kind` field from a closed set and a human-readable `message` field.

#### Scenario: ArtifactStoreError defines the error kind set

- **WHEN** the `ArtifactStoreError` type is inspected
- **THEN** `kind` SHALL be one of: `not_found`, `write_failed`, `read_failed`, `conflict`
- **AND** `message` SHALL be a non-empty string describing the error

#### Scenario: Read of non-existent artifact rejects with not_found

- **WHEN** `read()` is called for an artifact that does not exist
- **THEN** the store SHALL reject with `ArtifactStoreError` where `kind` is `not_found`

#### Scenario: Write failure rejects with write_failed

- **WHEN** `write()` fails due to an underlying I/O or storage error
- **THEN** the store SHALL reject with `ArtifactStoreError` where `kind` is `write_failed`

#### Scenario: Retry and rollback are adapter responsibilities

- **WHEN** an `ArtifactStoreError` is thrown
- **THEN** the core runtime SHALL NOT retry the operation
- **AND** rollback logic, if any, SHALL be the adapter's responsibility

### Requirement: CoreRunState fields provide a vendor-neutral DB mapping reference

The system SHALL document a mapping table from `CoreRunState` fields to recommended vendor-neutral SQL types. This mapping SHALL be informational guidance for external runtime implementors, not a normative schema.

#### Scenario: Mapping table covers all CoreRunState fields

- **WHEN** the mapping guidance is inspected
- **THEN** it SHALL include an entry for every field in `CoreRunState`: `run_id`, `change_name`, `current_phase`, `status`, `allowed_events`, `agents`, `history`, `source`, `created_at`, `updated_at`, `previous_run_id`, and `run_kind`

#### Scenario: Mapping table uses vendor-neutral SQL types

- **WHEN** the mapping table is inspected
- **THEN** it SHALL use vendor-neutral types (e.g., `TEXT`, `TIMESTAMP WITH TIME ZONE`, `JSONB` or `JSON`)
- **AND** it SHALL NOT reference vendor-specific types (e.g., PostgreSQL `serial`, MySQL `AUTO_INCREMENT`)

#### Scenario: Mapping table is non-normative

- **WHEN** the mapping table is inspected
- **THEN** it SHALL include a disclaimer that the mapping is informational guidance
- **AND** external runtimes MAY choose different column types provided they preserve the semantics

### Requirement: Core runtime commands are pure and perform no I/O

Core runtime commands SHALL be pure transition functions. Production modules under `src/core/**/*.ts` SHALL NOT import `WorkspaceContext`, SHALL NOT accept a `RunArtifactStore` or `ChangeArtifactStore` in any `*Deps` parameter, and SHALL NOT call `read`, `write`, `exists`, or `list` on any store. All run-artifact and change-artifact I/O for the workflow commands SHALL happen exclusively in the CLI wiring layer under `src/bin/**`. Test files under `src/core/` are out of scope because the repository convention places every test file under `src/tests/`.

#### Scenario: Core modules do not import WorkspaceContext

- **WHEN** any file matching `src/core/**/*.ts` is inspected
- **THEN** it SHALL NOT contain an import of
  `../lib/workspace-context` or any re-export of the
  `WorkspaceContext` interface

#### Scenario: Core *Deps types omit stores and workspace

- **WHEN** any `*Deps` type declared in `src/core/types.ts` is
  inspected
- **THEN** it SHALL NOT contain a `runs`, `changes`, or
  `workspace` member

#### Scenario: Core modules do not call store methods

- **WHEN** any file matching `src/core/**/*.ts` is inspected
- **THEN** it SHALL NOT contain `deps.runs.read`,
  `deps.runs.write`, `deps.runs.exists`, `deps.runs.list`,
  `deps.changes.read`, `deps.changes.exists`, or
  `deps.changes.list`

#### Scenario: Local-adapter field names are absent from core object literals

- **WHEN** any file matching `src/core/**/*.ts` is inspected
- **THEN** it SHALL NOT contain any of the `LocalRunState` keys
  (`project_id:`, `repo_name:`, `repo_path:`, `branch_name:`,
  `worktree_path:`, `last_summary_path:`) used as an object
  property key

### Requirement: Workflow core commands share an adapter-parameterized signature

Every workflow core command SHALL be generic over `<TAdapter extends AdapterFields<TAdapter>>`. The type `AdapterFields<TAdapter>` SHALL resolve to `TAdapter` when `keyof TAdapter & keyof CoreRunState` is `never`, and SHALL resolve to `never` otherwise. Every transition command SHALL accept `state: CoreRunState & TAdapter` as its first argument and SHALL return `Result<CoreRunState & TAdapter, CoreRuntimeError>`. The commands covered by this requirement SHALL be `startChangeRun`, `startSyntheticRun`, `advanceRun`, `suspendRun`, `resumeRun`, and `updateField`.

#### Scenario: AdapterFields rejects key collisions with CoreRunState

- **WHEN** a caller instantiates a command with `TAdapter =
  { run_id: number }` (a key that already exists in
  `CoreRunState`)
- **THEN** the TypeScript compiler SHALL report a type error at
  the call site
- **AND** no value of type `CoreRunState & TAdapter` SHALL be
  assignable with a colliding `run_id` shape

#### Scenario: Transition commands take state as input and return new state

- **WHEN** `advanceRun`, `suspendRun`, `resumeRun`, or
  `updateField` is inspected
- **THEN** its first parameter SHALL be typed
  `CoreRunState & TAdapter`
- **AND** its return type SHALL be
  `Result<CoreRunState & TAdapter, CoreRuntimeError>`
- **AND** it SHALL NOT accept a `runId: string` parameter for the
  purpose of loading state

### Requirement: Start precondition inputs replace store and workspace deps

`startChangeRun` and `startSyntheticRun` SHALL accept all
previously-resolved information as plain precondition inputs
instead of store or workspace dependencies. The exhaustive set of
preconditions derived from the current start path SHALL be:
`proposalExists: boolean`, `priorRuns: readonly CoreRunState[]`,
`nextRunId: string`, `nowIso: string`, and
`existingRunExists?: boolean`. No other store or workspace
lookups SHALL be performed inside the core start functions.

#### Scenario: Start functions accept explicit preconditions

- **WHEN** `startChangeRun` is inspected
- **THEN** its input type SHALL include `proposalExists`,
  `priorRuns`, `nextRunId`, and `nowIso` fields
- **AND** its `deps` parameter SHALL NOT contain `runs`,
  `changes`, or `workspace`

#### Scenario: Synthetic-run collision check is a precondition

- **WHEN** `startSyntheticRun` is invoked with
  `existingRunExists: true`
- **THEN** the function SHALL return a typed
  `run_already_exists` error without reading any store

#### Scenario: Core start returns adapter-seeded state

- **WHEN** `startChangeRun<TAdapter>` is invoked with an
  `adapterSeed: TAdapter` argument
- **THEN** the returned `Result.ok.value` SHALL equal
  `{ ...coreFields, ...adapterSeed }` for the newly-created run
- **AND** the value SHALL be typed `CoreRunState & TAdapter`

### Requirement: `spec_verify` runs uniformly regardless of Modified Capabilities

The `spec_verify` phase SHALL be entered on every change on the forward
path from `spec_validate`, regardless of whether
`openspec/changes/<change_id>/proposal.md` lists any `Modified
Capabilities`. When the list is empty, the phase SHALL complete
immediately by emitting `spec_verified` with a report stating
`no_modified_capabilities`, without user prompting. This uniformity
keeps the gate presence consistent across pure-addition and
modification changes.

#### Scenario: Empty Modified Capabilities advances without prompting

- **WHEN** a run reaches `spec_verify`
- **AND** `proposal.md` lists zero `Modified Capabilities` entries
- **THEN** the `/specflow` guide SHALL invoke
  `specflow-run advance "<RUN_ID>" spec_verified` without prompting the
  user
- **AND** the run SHALL land in `spec_ready`

#### Scenario: Non-empty Modified Capabilities triggers verification flow

- **WHEN** a run reaches `spec_verify`
- **AND** `proposal.md` lists one or more `Modified Capabilities`
  entries
- **THEN** the `/specflow` guide SHALL invoke `specflow-spec-verify` and
  SHALL NOT advance to `spec_verified` before processing the result

### Requirement: `spec_verify` artifact-phase gate blocks on missing / unparseable baselines

`specflow-run advance <run_id> spec_verified` SHALL, in addition to the
standard transition validation, require that every capability listed
under `Modified Capabilities` in `proposal.md` resolve to a readable and
parseable baseline spec file before the transition is accepted. When a
baseline is missing or unparseable, the core function SHALL return a
typed error and the CLI SHALL map the error to a non-zero exit code.

#### Scenario: Missing baseline blocks spec_verified

- **WHEN** `specflow-run advance <run_id> spec_verified` is invoked
- **AND** a `Modified Capabilities` entry has no corresponding
  `openspec/specs/<name>/spec.md`
- **THEN** the core function SHALL return a typed `missing_baseline`
  error
- **AND** the CLI SHALL exit non-zero without transitioning the run

#### Scenario: Unparseable baseline blocks spec_verified

- **WHEN** `specflow-run advance <run_id> spec_verified` is invoked
- **AND** a baseline spec referenced by `Modified Capabilities` exists
  but cannot be parsed into requirements + scenarios
- **THEN** the core function SHALL return a typed
  `unparseable_baseline` error
- **AND** the CLI SHALL exit non-zero without transitioning the run

### Requirement: Run-state type partition conforms to canonical workflow state semantics

The `CoreRunState` and `LocalRunState` type partitions SHALL conform to the
canonical workflow state semantics defined in
`openspec/specs/canonical-workflow-state/spec.md`. This is a normative
reference: the canonical semantics SHALL be the source of truth for which
fields belong to the canonical surface, and the type-level partition SHALL be
a representation conforming to it. This requirement SHALL NOT add, remove, or
rename any field in `CoreRunState` or `LocalRunState`; the observable type
shape remains governed by the existing requirements in this specification.

#### Scenario: CoreRunState covers the canonical surface

- **WHEN** the `CoreRunState` type is evaluated against the canonical
  workflow state semantics
- **THEN** every field in `CoreRunState` SHALL be classifiable as an
  expression of one of the nine canonical roles defined in the
  `canonical-workflow-state` capability
- **AND** the nine canonical roles SHALL each be expressible via `CoreRunState`
  fields (directly or in combination)

#### Scenario: LocalRunState contains only adapter execution state

- **WHEN** the `LocalRunState` type is evaluated against the canonical
  workflow state semantics
- **THEN** every field in `LocalRunState` SHALL be classifiable as adapter
  execution state per the exclusion rule defined in the
  `canonical-workflow-state` capability
- **AND** no `LocalRunState` field SHALL be required of a non-local runtime

#### Scenario: Field membership is not altered by this reference

- **WHEN** this normative reference is added
- **THEN** no field SHALL be added, removed, or renamed in `CoreRunState` or
  `LocalRunState` as a consequence
- **AND** all existing consumers importing `RunState`, `CoreRunState`, or
  `LocalRunState` SHALL continue to compile without code change

#### Scenario: Discrepancy is surfaced, not silently reconciled

- **WHEN** a field in `CoreRunState` or `LocalRunState` cannot be cleanly
  classified under the canonical semantics (e.g., a canonical role has no
  corresponding field, or a field resists classification)
- **THEN** the discrepancy SHALL be recorded
- **AND** reconciliation SHALL be handled by a separate change, not by
  silently editing the partition in this specification

