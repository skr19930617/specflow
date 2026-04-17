## Why

RunState is currently monolithic — server adapters cannot extend it with adapter-specific fields (DB connection info, session ID, etc.) without modifying core types. Phase contracts exist only as implicit string-based checks in the phase-router, with no structured type for input/output schemas or gate conditions, making programmatic validation impossible. Change ID → Run ID resolution requires callers to manually enumerate runs, with no first-class auto-resolution API.

This is Phase 1 of 3 for the deterministic server orchestrator (#127). It establishes the core type foundations that Phase 2 (server adapter) and Phase 3 (orchestration loop) depend on.

- Source: https://github.com/skr19930617/specflow/issues/152
- Parent Issue: #127

## What Changes

- Introduce a generic `RunState<TAdapter>` type using TypeScript generics (`RunState<TAdapter extends AdapterFields>`) that separates core fields (run_id, current_phase, status, history, etc.) from adapter-extensible fields. `AdapterFields` is constrained as `Record<string, unknown>`. A `RunStateCoreFields` interface defines the core shape; `RunState<TAdapter>` intersects core with the adapter type parameter. Default `TAdapter = Record<string, never>` (empty adapter) preserves backward compatibility.
- Extend the existing `PhaseContract` interface (`src/lib/phase-router/types.ts`) with optional `input`, `output`, and `gate_conditions` fields. Existing fields (phase, next_action, gated, terminal, etc.) remain unchanged. New fields use pure TypeScript interfaces as type descriptors (compile-time only; no runtime validation in Phase 1). `GateCondition` is a declarative descriptor: `{ kind: 'artifact_exists' | 'approval_required' | 'validation_passed'; target?: string }`. Gate condition *evaluation logic* is deferred to Phase 2 (server adapter).
- Add `resolveRunId(store, changeId)` to `run-store-ops` module that auto-resolves a Change ID to the latest non-terminal (active or suspended) Run ID. Relies on the existing "one non-terminal run per change" invariant from `run-identity-model`. Returns `Result<string, ResolveError>` following the existing `CoreRuntimeError` pattern. Error variants: `no_active_run` (all runs terminal or none exist), `change_not_found` (no runs at all), `multiple_active_runs` (invariant violation). (ref #125)

## Capabilities

### New Capabilities
- `runstate-adapter-extension`: Core/adapter field split for the RunState type, enabling server adapters to declare and access type-safe custom fields without modifying core workflow types
- `phase-contract-structure`: Structured PhaseContract type definitions with typed input/output schemas and gate condition descriptors, making phase contracts programmatically verifiable

### Modified Capabilities
- `workflow-run-state`: RunState type gains a generic adapter parameter; existing core fields remain unchanged but are now explicitly scoped as "core"
- `run-identity-model`: Add Change ID → Run ID auto-resolution as a first-class operation via `resolveRunId(changeId)`

## Impact

- `src/contracts/` — new type definitions for `RunStateCoreFields`, `RunState<TAdapter>`, `PhaseContract`, `PhaseContractInput`, `PhaseContractOutput`, `GateCondition`
- `src/core/` — new `resolveRunId` function in `run-store-ops` module
- `phase-router` spec consumers — `PhaseContract` type replaces the current implicit metadata; phase-router will consume structured contracts (no phase-router code changes in this phase)
- Existing conformance tests must continue to pass — all changes are additive, no breaking changes to existing RunState consumers
- Constraint: Core module (`workflow-machine.ts`) existing logic is unchanged; all new code is added in the adapter layer

