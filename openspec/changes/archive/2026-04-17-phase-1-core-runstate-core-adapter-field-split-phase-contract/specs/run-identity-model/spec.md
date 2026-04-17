## ADDED Requirements

### Requirement: resolveRunId auto-resolves Change ID to the latest non-terminal Run ID

The `run-store-ops` module SHALL export a `resolveRunId(store: RunArtifactStore, changeId: string)` function that returns the run_id of the single non-terminal (active or suspended) run for the given change_id. The function SHALL rely on the existing "one non-terminal run per change" invariant.

#### Scenario: resolveRunId returns the active run_id

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** exactly one non-terminal run `my-feature-2` exists with status `active`
- **THEN** the function SHALL return `{ ok: true, value: "my-feature-2" }`

#### Scenario: resolveRunId returns the suspended run_id

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** exactly one non-terminal run `my-feature-3` exists with status `suspended`
- **THEN** the function SHALL return `{ ok: true, value: "my-feature-3" }`

#### Scenario: resolveRunId returns no_active_run when all runs are terminal

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** all runs for `my-feature` have status `terminal`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "no_active_run", message: "No active or suspended run for change 'my-feature'" } }`

#### Scenario: resolveRunId returns change_not_found when no runs exist

- **WHEN** `resolveRunId(store, "nonexistent")` is invoked
- **AND** no runs exist for `nonexistent`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "change_not_found", message: "No runs found for change 'nonexistent'" } }`

#### Scenario: resolveRunId returns multiple_active_runs on invariant violation

- **WHEN** `resolveRunId(store, "my-feature")` is invoked
- **AND** two or more non-terminal runs exist for `my-feature`
- **THEN** the function SHALL return `{ ok: false, error: { kind: "multiple_active_runs", message: "Invariant violation: multiple non-terminal runs for change 'my-feature'" } }`

### Requirement: resolveRunId follows the Result pattern

The `resolveRunId` function SHALL return a `Result<string, ResolveRunIdError>` where `ResolveRunIdError` follows the `CoreRuntimeError` pattern with `{ kind, message }` shape. The error `kind` field SHALL be drawn from the closed set: `no_active_run`, `change_not_found`, `multiple_active_runs`.

#### Scenario: Result type is compatible with CoreRuntimeError pattern

- **WHEN** the return type of `resolveRunId` is inspected
- **THEN** the success case SHALL be `{ ok: true, value: string }` where value is the run_id
- **AND** the error case SHALL be `{ ok: false, error: { kind: ResolveRunIdErrorKind, message: string } }`
- **AND** `ResolveRunIdErrorKind` SHALL be a string literal union type

#### Scenario: resolveRunId does not throw

- **WHEN** `resolveRunId` encounters any of its defined error conditions
- **THEN** it SHALL return an error Result
- **AND** it SHALL NOT throw an exception
