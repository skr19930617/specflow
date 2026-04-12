## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and SHALL populate the current workflow metadata for the new run. The run_id SHALL be auto-generated in `<change_id>-<sequence>` format. The run_id generation SHALL use `run-store-ops.generateRunId(store, changeId)` instead of direct filesystem enumeration.

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
- **AND** the sequence number SHALL be determined via `run-store-ops.generateRunId()` using the injected `RunArtifactStore`

#### Scenario: Start writes run state through the store

- **WHEN** `specflow-run start` completes successfully
- **THEN** it SHALL persist the initial run state via `RunArtifactStore.write(ref, content)`
- **AND** it SHALL NOT use `atomicWrite()` or any direct filesystem function

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
