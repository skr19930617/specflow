## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and SHALL populate the current workflow metadata for the new run. The run_id SHALL be auto-generated in `<change_id>-<sequence>` format. The run_id generation SHALL use `run-store-ops.generateRunId(store, changeId)` instead of direct filesystem enumeration.

All `RunArtifactStore` operations SHALL be asynchronous (returning `Promise`). The `specflow-run start` function SHALL `await` each store operation.

Repository metadata SHALL be obtained via the injected `WorkspaceContext` interface rather than being passed as direct parameters or resolved internally.

#### Scenario: Change runs require an existing local proposal artifact

- **WHEN** `specflow-run start <change_id>` is invoked with the default run kind
- **THEN** it SHALL use the `ChangeArtifactStore` to verify that `(change_id, proposal)` exists
- **AND** it SHALL fail with a typed missing-artifact error if the proposal does not exist

#### Scenario: Started runs capture repository metadata via WorkspaceContext

- **WHEN** a run is started inside a valid workspace
- **THEN** `run-state` SHALL include `run_id`, `change_name`, `project_id`,
  `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`,
  `allowed_events`, `created_at`, and `updated_at`
- **AND** `repo_name` SHALL be obtained from `WorkspaceContext.projectDisplayName()`
- **AND** `repo_path` SHALL be obtained from `WorkspaceContext.projectRoot()`
- **AND** `branch_name` SHALL be obtained from `WorkspaceContext.branchName()`
- **AND** `worktree_path` SHALL be obtained from `WorkspaceContext.worktreePath()`

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
- **AND** the sequence number SHALL be determined via `run-store-ops.generateRunId()` using the injected `RunArtifactStore`

#### Scenario: Start writes run state through the store

- **WHEN** `specflow-run start` completes successfully
- **THEN** it SHALL persist the initial run state via `await RunArtifactStore.write(ref, content)`
- **AND** it SHALL NOT use `atomicWrite()` or any direct filesystem function

#### Scenario: Run start receives WorkspaceContext via dependency injection

- **WHEN** `specflow-run start` is invoked from a CLI entry point
- **THEN** the CLI entry point SHALL construct a `WorkspaceContext` implementation and pass it to the run start function
- **AND** the run start function SHALL NOT resolve workspace metadata independently

### Requirement: Run-state reads and writes are stable CLI operations

The run-state CLI SHALL read and write run state through the `RunArtifactStore` interface, never through direct filesystem path construction. The `specflow-prepare-change` CLI SHALL also use the store for run enumeration. All store operations SHALL be asynchronous and the CLI SHALL `await` them.

#### Scenario: `status` returns the stored run state

- **WHEN** `specflow-run status <run_id>` is invoked
- **THEN** it SHALL read from `await RunArtifactStore.read(runId, run-state)` and print the payload

#### Scenario: `get-field` returns a single field value

- **WHEN** `specflow-run get-field <run_id> current_phase` is invoked
- **THEN** it SHALL read from `await RunArtifactStore.read(runId, run-state)` and print the stored `current_phase` value as JSON

#### Scenario: `update-field` persists targeted metadata

- **WHEN** `specflow-run update-field <run_id> last_summary_path <value>` is
  invoked
- **THEN** it SHALL read from `await RunArtifactStore`, update the field, and write back via `await RunArtifactStore.write(runId, run-state, content)`

#### Scenario: No CLI binary contains hardcoded `.specflow/runs` paths

- **WHEN** the source of `specflow-run.ts` and `specflow-prepare-change.ts` is inspected
- **THEN** neither file SHALL contain the string literal `.specflow/runs`

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

### Requirement: CLI entry points resolve and inject the RunArtifactStore

CLI entry points (`specflow-run`, `specflow-prepare-change`) SHALL
instantiate a `RunArtifactStore` implementation at startup and inject it
into the core runtime. The default implementation SHALL be
`LocalFsRunArtifactStore`. `specflow-run` SHALL additionally instantiate a
`ChangeArtifactStore` (`LocalFsChangeArtifactStore`), a `WorkspaceContext`
(`createLocalWorkspaceContext`), and load the `WorkflowDefinition` from
`state-machine.json`, and SHALL pass all four into the core runtime. No
runtime store-switching mechanism is provided by this change.

All core runtime functions SHALL be `async` and CLI entry points SHALL `await` them. The CLI entry point SHALL handle rejected promises by mapping `ArtifactStoreError` kinds to appropriate stderr messages and exit codes.

#### Scenario: specflow-run instantiates all collaborators at startup

- **WHEN** `specflow-run` is invoked with any subcommand that needs them
- **THEN** it SHALL create a `LocalFsRunArtifactStore`, a
  `LocalFsChangeArtifactStore` (for commands that read change artifacts),
  and a `WorkspaceContext` using the repository root
- **AND** it SHALL load a `WorkflowDefinition` from
  `state-machine.json` (for commands that need it)
- **AND** it SHALL pass all required collaborators into the core-runtime
  command function as arguments

#### Scenario: specflow-prepare-change uses injected store for run lookup

- **WHEN** `specflow-prepare-change` searches for existing non-terminal runs
- **THEN** it SHALL use `await RunArtifactStore.list()` with a `changeId` query
- **AND** it SHALL NOT construct `.specflow/runs/` paths directly

#### Scenario: CLI maps ArtifactStoreError to stderr and exit codes

- **WHEN** a core runtime function rejects with an `ArtifactStoreError`
- **THEN** the CLI SHALL map the error `kind` to the appropriate stderr message
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

### Requirement: Workflow commands are exposed as a CLI-independent core runtime

The system SHALL implement the workflow-run commands as a core runtime
module under `src/core/` that is callable without `process.argv`, without
filesystem discovery, and without git calls. The commands covered SHALL
be `start`, `advance`, `suspend`, `resume`, `status`, `update-field`, and
`get-field`. Every collaborator the core runtime needs SHALL be passed in
as an argument rather than resolved internally: `RunArtifactStore`,
`ChangeArtifactStore`, `WorkspaceContext`, and a pre-parsed
`WorkflowDefinition`. All core runtime command functions SHALL be `async` (returning `Promise<Result<Ok, CoreRuntimeError>>`).

#### Scenario: Core runtime is reachable from library code

- **WHEN** test code or a non-CLI caller imports the core runtime module
- **THEN** it SHALL be able to invoke `start`, `advance`, `suspend`,
  `resume`, `status`, `update-field`, and `get-field` as plain `async` functions
- **AND** it SHALL NOT be required to read `process.argv`, construct an
  `LocalFs*ArtifactStore`, discover `state-machine.json`, or invoke git

#### Scenario: Core runtime accepts a pre-parsed WorkflowDefinition

- **WHEN** a core-runtime command that depends on the state machine (e.g.
  `start`, `advance`) is invoked
- **THEN** it SHALL receive the parsed `WorkflowDefinition` object as an
  argument
- **AND** it SHALL NOT call `readFileSync` or otherwise touch the
  filesystem to load `state-machine.json`

#### Scenario: Core runtime uses injected stores and workspace context

- **WHEN** a core-runtime command needs to read or write run state, read a
  change artifact, or resolve repository metadata
- **THEN** it SHALL use the injected `RunArtifactStore`,
  `ChangeArtifactStore`, or `WorkspaceContext` — never a freshly
  constructed local filesystem implementation and never a direct git
  invocation

## ADDED Requirements

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
