## ADDED Requirements

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

Core runtime function signatures SHALL depend only on `CoreRunState` when they do not read a local-adapter field; signatures that read or write a local-adapter field SHALL continue to accept `RunState` or `LocalRunState` explicitly. CLI wiring under `src/bin/**` and local filesystem adapters under `src/adapters/**` SHALL continue to produce and pass the combined `RunState` value.

#### Scenario: Core functions that ignore local-adapter fields accept CoreRunState

- **WHEN** a function under `src/core/**` is inspected
- **AND** its body does not reference `project_id`, `repo_name`,
  `repo_path`, `branch_name`, `worktree_path`, or
  `last_summary_path`
- **THEN** its parameter type SHALL be `CoreRunState` (or a narrower
  subtype)
- **AND** it SHALL NOT accept `RunState` directly

#### Scenario: Local-aware functions keep access to local-adapter fields

- **WHEN** a function reads or writes any `LocalRunState` field
- **THEN** its parameter type SHALL be `RunState` or `LocalRunState`
- **AND** the mixed typing SHALL be called out in the change's
  `tasks.md` survey
