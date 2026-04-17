## ADDED Requirements

### Requirement: RunState type separates core fields from adapter-extensible fields

The system SHALL define a `RunStateCoreFields` interface containing all existing RunState fields (run_id, change_name, current_phase, status, allowed_events, source, project_id, repo_name, repo_path, branch_name, worktree_path, agents, last_summary_path, created_at, updated_at, history, run_kind, previous_run_id). The system SHALL define `RunState<TAdapter>` as the intersection of `RunStateCoreFields` and `TAdapter`, where `TAdapter extends Record<string, unknown>`.

#### Scenario: RunState with default adapter is structurally identical to current RunState

- **WHEN** `RunState<Record<string, never>>` is instantiated
- **THEN** it SHALL be assignable to the current `RunState` interface without type errors
- **AND** all existing core fields SHALL be present and unchanged

#### Scenario: RunState with a custom adapter exposes adapter fields type-safely

- **WHEN** a server adapter defines `type ServerAdapter = { sessionId: string; dbConnectionId: string }`
- **AND** `RunState<ServerAdapter>` is instantiated
- **THEN** the resulting type SHALL include all `RunStateCoreFields` properties
- **AND** it SHALL include `sessionId: string` and `dbConnectionId: string` as top-level properties
- **AND** accessing `state.sessionId` SHALL be type-safe without casts

#### Scenario: Adapter fields cannot shadow core fields

- **WHEN** an adapter type defines a field with the same name as a core field (e.g., `{ run_id: number }`)
- **THEN** the TypeScript compiler SHALL report a type conflict at the intersection site
- **AND** the adapter type SHALL NOT silently override the core field's type

### Requirement: AdapterFields constraint is Record<string, unknown>

The `AdapterFields` type bound for the `TAdapter` parameter SHALL be `Record<string, unknown>`. This allows adapters to declare arbitrary key-value extensions while preserving type safety through the generic parameter.

#### Scenario: Any object type satisfying Record<string, unknown> is a valid adapter

- **WHEN** a type `{ customField: boolean; metadata: { nested: string } }` is used as `TAdapter`
- **THEN** it SHALL satisfy the `Record<string, unknown>` constraint
- **AND** `RunState<typeof adapter>` SHALL compile without errors

#### Scenario: Non-object types are rejected as adapter parameters

- **WHEN** a primitive type (e.g., `string`, `number`) is used as `TAdapter`
- **THEN** the TypeScript compiler SHALL reject it as not satisfying `Record<string, unknown>`

### Requirement: RunStateCoreFields is independently importable

The `RunStateCoreFields` interface SHALL be exported from the contracts module independently of `RunState<TAdapter>`. Code that does not need adapter awareness SHALL be able to import and use `RunStateCoreFields` directly.

#### Scenario: Core-only consumers import RunStateCoreFields

- **WHEN** a module imports `RunStateCoreFields` from the contracts module
- **THEN** it SHALL have access to all core run-state fields
- **AND** it SHALL NOT need to specify a type parameter

#### Scenario: RunStateCoreFields is readonly

- **WHEN** `RunStateCoreFields` is inspected
- **THEN** all mutable-looking fields (arrays, objects) SHALL use `readonly` modifiers
- **AND** the interface SHALL match the immutability conventions of the existing RunState interface
