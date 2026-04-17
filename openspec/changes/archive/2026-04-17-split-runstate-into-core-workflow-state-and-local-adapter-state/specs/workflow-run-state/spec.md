## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Workflow commands are exposed as a CLI-independent core runtime

**Reason**: Replaced by the stricter "Core runtime commands are
pure and perform no I/O" requirement (see ADDED). The prior
wording permitted injecting `RunArtifactStore`,
`ChangeArtifactStore`, `WorkspaceContext`, and
`WorkflowDefinition` into the core runtime. The new contract
removes store and workspace injection entirely; only the pure
`WorkflowDefinition` (or the derived allowed-events helpers) and
precondition inputs are passed.

**Migration**: CLI wiring under `src/bin/**` SHALL compute
precondition inputs (read current state, enumerate prior runs,
check artifact existence, resolve workspace identity) before
invoking the pure core functions. Core commands SHALL be
invoked as plain function calls with explicit inputs and an
adapter seed. Tests previously constructing in-memory stores to
drive the core runtime SHALL be rewritten to invoke the core
functions directly with explicit state and preconditions.
