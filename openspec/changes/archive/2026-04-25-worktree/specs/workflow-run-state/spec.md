## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state

`specflow-run start` SHALL orchestrate run creation by
(1) verifying preconditions via `RunArtifactStore`,
`ChangeArtifactStore`, and `WorkspaceContext` in the wiring
layer, (2) invoking the pure core start function with explicit
precondition inputs and a `LocalRunState` adapter seed, and
(3) persisting the returned `CoreRunState & LocalRunState` value
via `await RunArtifactStore.write()`. The persisted run state
SHALL be identical in shape and content to the pre-existing
`run.json` layout, **extended with three new local-adapter fields
`base_commit`, `base_branch`, and `cleanup_pending`** (see the
field-partition requirements below). The run_id generation SHALL
continue to use `run-store-ops.generateRunId(store, changeId)`,
invoked from the wiring layer.

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
  `worktreePath()`, **`baseCommit()`**, **`baseBranch()`**, the
  literal `null` for `last_summary_path`, and the literal `false`
  for `cleanup_pending`
- **AND** it SHALL pass the slice as the adapter seed to
  `startChangeRun<LocalRunState>`
- **AND** the persisted `run.json` SHALL include `run_id`,
  `change_name`, `project_id`, `repo_name`, `repo_path`,
  `branch_name`, `worktree_path`, `base_commit`, `base_branch`,
  `cleanup_pending`, `agents`, `allowed_events`,
  `created_at`, and `updated_at`
- **AND** when the change uses a main-session worktree,
  `worktree_path` SHALL equal `.specflow/worktrees/<CHANGE_ID>/main/`
  and SHALL NOT equal `repo_path`

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

### Requirement: Run-state types are partitioned into core and local-adapter partitions

The run-state type system SHALL expose three named types in `src/types/contracts.ts`:

- `CoreRunState` — the run-state fields every runtime persists
  regardless of adapter: `run_id`, `change_name`, `current_phase`,
  `status`, `allowed_events`, `agents`, `history`, `source`,
  `created_at`, `updated_at`, `previous_run_id`, and `run_kind`.
- `LocalRunState` — the run-state fields owned by the local
  filesystem adapter only: `project_id`, `repo_name`, `repo_path`,
  `branch_name`, `worktree_path`, `base_commit`, `base_branch`,
  `cleanup_pending`, and `last_summary_path`.
- `RunState` — the pre-existing compatibility alias, defined as
  `CoreRunState & LocalRunState`. Every consumer that imports
  `RunState` today SHALL keep compiling without modification.

The field membership of `CoreRunState` and `LocalRunState` SHALL be
disjoint, and their union SHALL equal the field set of `RunState`. No
field SHALL be added to `CoreRunState` or removed from `RunState` by this partition.

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
  `repo_path`, `branch_name`, `worktree_path`, `base_commit`,
  `base_branch`, `cleanup_pending`, and `last_summary_path`
- **AND** the type SHALL NOT expose any core runtime field

#### Scenario: RunState remains the intersection alias

- **WHEN** the `RunState` type is inspected
- **THEN** it SHALL equal `CoreRunState & LocalRunState`
- **AND** every existing consumer importing `RunState` SHALL continue
  to compile without code change

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
  `worktree_path:`, `base_commit:`, `base_branch:`,
  `cleanup_pending:`, `last_summary_path:`) used as an object
  property key

## ADDED Requirements

### Requirement: Legacy run-state with worktree_path == repo_path is rejected

`specflow-prepare-change` SHALL refuse to load any persisted run-state record where `worktree_path` equals `repo_path`. Such records correspond to the pre-`main-session-worktree` branch-checkout layout that this change replaces. The CLI SHALL surface a clear error message instructing the user to drain (approve or reject) the legacy change before proceeding, and SHALL NOT auto-migrate, auto-rewrite, or silently upgrade the record.

This requirement does not apply to synthetic runs (`run_kind = "synthetic"`), which never carry a `repo_path`/`worktree_path` divergence by design.

#### Scenario: Legacy record is rejected

- **WHEN** `specflow-prepare-change` reads a persisted run-state where `worktree_path == repo_path` and `run_kind != "synthetic"`
- **THEN** it SHALL exit non-zero with a message asking the user to drain the legacy run
- **AND** SHALL NOT modify the persisted record
- **AND** SHALL NOT proceed to materialize artifacts for that change

#### Scenario: New-layout record is accepted

- **WHEN** the persisted run-state has `worktree_path = .specflow/worktrees/<CHANGE_ID>/main/` distinct from `repo_path`
- **THEN** `specflow-prepare-change` SHALL proceed normally

### Requirement: cleanup_pending tracks deferred terminal cleanup

The `cleanup_pending` field on `LocalRunState` SHALL be a boolean (default `false`) that records whether terminal-state worktree cleanup has been deferred for the current run. The `main-session-worktree` capability SHALL set `cleanup_pending = true` when a terminal phase is reached but cleanup gating fails (dirty worktree or partial-success state). Every other writer SHALL preserve the field unchanged.

#### Scenario: Default is false

- **WHEN** `specflow-run start` initializes a new run
- **THEN** the persisted `cleanup_pending` SHALL be `false`

#### Scenario: Deferred cleanup sets the flag

- **WHEN** a terminal phase command (approve/archive/reject) succeeds but cleanup gating fails
- **THEN** the wiring layer SHALL persist `cleanup_pending = true`
- **AND** subsequent reads of the run SHALL observe the deferred flag
