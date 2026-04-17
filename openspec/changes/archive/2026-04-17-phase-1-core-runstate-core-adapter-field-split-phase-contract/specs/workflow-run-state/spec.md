## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and SHALL populate the current workflow metadata for the new run. The run_id SHALL be auto-generated in `<change_id>-<sequence>` format. The run_id generation SHALL use `run-store-ops.generateRunId(store, changeId)` instead of direct filesystem enumeration.

Repository metadata SHALL be obtained via the injected `WorkspaceContext` interface rather than being passed as direct parameters or resolved internally.

The created run state SHALL conform to `RunState<Record<string, never>>` (the default empty adapter), with all fields belonging to `RunStateCoreFields`.

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
- **THEN** it SHALL persist the initial run state via `RunArtifactStore.write(ref, content)`
- **AND** it SHALL NOT use `atomicWrite()` or any direct filesystem function

#### Scenario: Run start receives WorkspaceContext via dependency injection

- **WHEN** `specflow-run start` is invoked from a CLI entry point
- **THEN** the CLI entry point SHALL construct a `WorkspaceContext` implementation and pass it to the run start function
- **AND** the run start function SHALL NOT resolve workspace metadata independently

#### Scenario: Created run state conforms to RunStateCoreFields

- **WHEN** a new run is created via `specflow-run start`
- **THEN** the persisted run state SHALL contain only fields defined in `RunStateCoreFields`
- **AND** no adapter-specific fields SHALL be present in the initial state
- **AND** the state SHALL be assignable to `RunState<Record<string, never>>`
