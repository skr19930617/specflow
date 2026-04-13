## ADDED Requirements

### Requirement: Workflow commands are exposed as a CLI-independent core runtime

The system SHALL implement the workflow-run commands as a core runtime
module under `src/core/` that is callable without `process.argv`, without
filesystem discovery, and without git calls. The commands covered SHALL
be `start`, `advance`, `suspend`, `resume`, `status`, `update-field`, and
`get-field`. Every collaborator the core runtime needs SHALL be passed in
as an argument rather than resolved internally: `RunArtifactStore`,
`ChangeArtifactStore`, `WorkspaceContext`, and a pre-parsed
`WorkflowDefinition`.

#### Scenario: Core runtime is reachable from library code

- **WHEN** test code or a non-CLI caller imports the core runtime module
- **THEN** it SHALL be able to invoke `start`, `advance`, `suspend`,
  `resume`, `status`, `update-field`, and `get-field` as plain functions
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

The `src/tests/` suite SHALL include tests that drive the core runtime
directly with an in-memory `RunArtifactStore`, an in-memory
`ChangeArtifactStore`, and a fake `WorkspaceContext` — without spawning
`specflow-run` and without relying on a real filesystem or git repository.
The behavioral assertions previously carried by the CLI test layer SHALL
be migrated into these core-runtime tests; the CLI test layer SHALL keep
only smoke tests for argv parsing and stderr/exit mapping.

#### Scenario: Core tests cover every command branch

- **WHEN** the core-runtime test suite runs
- **THEN** it SHALL cover each command (`start`, `advance`, `suspend`,
  `resume`, `status`, `update-field`, `get-field`) including every
  currently-tested failure branch (e.g. `not_in_git_repo`, `run_not_found`,
  invalid events, suspended-run guard, missing proposal)

#### Scenario: CLI smoke tests remain for wiring

- **WHEN** the CLI test suite runs
- **THEN** it SHALL assert that argv parsing routes to the expected core
  command and that a representative success payload and a representative
  typed error are mapped to the correct stdout/stderr/exit outputs
- **AND** it SHALL NOT re-assert the full behavioral surface already
  covered by the core-runtime tests

## MODIFIED Requirements

### Requirement: CLI entry points resolve and inject the RunArtifactStore

CLI entry points (`specflow-run`, `specflow-prepare-change`) SHALL
instantiate a `RunArtifactStore` implementation at startup and inject it
into the core runtime. The default implementation SHALL be
`LocalFsRunArtifactStore`. `specflow-run` SHALL additionally instantiate a
`ChangeArtifactStore` (`LocalFsChangeArtifactStore`), a `WorkspaceContext`
(`createLocalWorkspaceContext`), and load the `WorkflowDefinition` from
`state-machine.json`, and SHALL pass all four into the core runtime. No
runtime store-switching mechanism is provided by this change.

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
- **THEN** it SHALL use `RunArtifactStore.list()` with a `changeId` query
- **AND** it SHALL NOT construct `.specflow/runs/` paths directly
