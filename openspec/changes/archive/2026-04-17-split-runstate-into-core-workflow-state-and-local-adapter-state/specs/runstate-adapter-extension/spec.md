## MODIFIED Requirements

### Requirement: RunState type separates core fields from adapter-extensible fields

The system SHALL define two disjoint run-state partitions in
`src/types/contracts.ts`:

- `CoreRunState` — the runtime-agnostic workflow state fields
  every runtime persists: `run_id`, `change_name`, `current_phase`,
  `status`, `allowed_events`, `agents`, `history`, `source`,
  `created_at`, `updated_at`, `previous_run_id`, and `run_kind`.
- `LocalRunState` — the local filesystem adapter-only fields:
  `project_id`, `repo_name`, `repo_path`, `branch_name`,
  `worktree_path`, and `last_summary_path`.

The system SHALL define `RunState = CoreRunState & LocalRunState`
as the full shape persisted by the local adapter and SHALL define
`RunState<TAdapter>` as `CoreRunState & TAdapter`, where
`TAdapter extends AdapterFields<TAdapter>`. The field membership
of `CoreRunState` and `LocalRunState` SHALL be disjoint, and
their union SHALL equal the field set of `RunState`.

#### Scenario: RunState with LocalRunState adapter is structurally identical to the persisted local shape

- **WHEN** `RunState<LocalRunState>` is instantiated
- **THEN** it SHALL be assignable to `CoreRunState &
  LocalRunState` (the `RunState` alias) without type errors
- **AND** all core and local-adapter fields SHALL be present
  and unchanged

#### Scenario: RunState with a custom adapter exposes adapter fields type-safely

- **WHEN** a server adapter defines `type ServerAdapter = {
  sessionId: string; dbConnectionId: string }`
- **AND** `RunState<ServerAdapter>` is instantiated
- **THEN** the resulting type SHALL include all `CoreRunState`
  properties
- **AND** it SHALL include `sessionId: string` and
  `dbConnectionId: string` as top-level properties
- **AND** it SHALL NOT include any `LocalRunState` property
- **AND** accessing `state.sessionId` SHALL be type-safe without
  casts

#### Scenario: Adapter fields cannot shadow core fields

- **WHEN** an adapter type defines a field with the same name as
  a `CoreRunState` field (e.g., `{ run_id: number }`)
- **THEN** the TypeScript compiler SHALL reject the adapter at
  the `AdapterFields<TAdapter>` constraint site
- **AND** no value of type `RunState<TAdapter>` SHALL be
  assignable with a colliding field

### Requirement: AdapterFields constraint is Record<string, unknown>

The `AdapterFields<TAdapter>` type bound SHALL be a conditional type that requires `TAdapter` to be an object type and requires `TAdapter`'s keys to be disjoint from `CoreRunState`'s keys. Its realized form SHALL be `TAdapter extends object ? (keyof TAdapter & keyof CoreRunState extends never ? TAdapter : never) : never`. The outer `object` bound (rather than the literal `Record<string, unknown>`) SHALL be used so that adapter interfaces with `readonly` fields such as `LocalRunState` satisfy the constraint; primitive types (`string`, `number`, `boolean`, and the like) SHALL NOT satisfy the constraint because they do not extend `object`. The inner conjunction SHALL guarantee that adapter keys do not collide with `CoreRunState` workflow keys. Every adapter-parameterized type in the codebase SHALL use `AdapterFields<TAdapter>` as its bound.

#### Scenario: Any object type disjoint from CoreRunState is a valid adapter

- **WHEN** a type `{ customField: boolean; metadata: { nested:
  string } }` is used as `TAdapter`
- **AND** none of its keys appears in `CoreRunState`
- **THEN** it SHALL satisfy `AdapterFields<TAdapter>`
- **AND** `RunStateOf<typeof adapter>` SHALL compile without
  errors

#### Scenario: Non-object types are rejected as adapter parameters

- **WHEN** a primitive type (e.g., `string`, `number`) is used
  as `TAdapter`
- **THEN** the TypeScript compiler SHALL reject it as not
  satisfying the `object` bound

#### Scenario: Adapters with keys overlapping CoreRunState are rejected

- **WHEN** an adapter type `{ run_id: string }` or `{ status:
  number }` is used as `TAdapter`
- **THEN** the `AdapterFields<TAdapter>` constraint SHALL
  resolve to `never`
- **AND** the TypeScript compiler SHALL reject the
  instantiation site

## REMOVED Requirements

### Requirement: RunStateCoreFields is independently importable

**Reason**: The `RunStateCoreFields` type was a historical alias
that accumulated two contradictory meanings — (1) the full
run-state field set including local-adapter fields (original
definition) and (2) an alias for `RunState` after the
core/local partition landed. The new `CoreRunState` and
`LocalRunState` partitions supersede both meanings and are
already the canonical way to import either the runtime-agnostic
partition or the local-adapter partition independently.

**Migration**: Delete `RunStateCoreFields` from
`src/types/contracts.ts` and replace every internal reference:
- Consumers that need only the runtime-agnostic core fields
  SHALL import `CoreRunState`.
- Consumers that need the combined local-FS persisted shape
  SHALL import `RunState` (unchanged export, now defined as
  `CoreRunState & LocalRunState`).
- Consumers that need adapter-parameterized combinations SHALL
  use the generic `RunState<TAdapter>` form.
No external (out-of-repo) consumers of `RunStateCoreFields`
exist; the symbol was never exported from a published package
boundary, so no deprecation cycle is required.
