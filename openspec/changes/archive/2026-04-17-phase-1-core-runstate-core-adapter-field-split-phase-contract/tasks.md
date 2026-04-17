## 1. RunState Core/Adapter Field Split ✓

> Extract RunStateCoreFields and redefine RunState as a generic intersection type with backward-compatible default.

- [x] 1.1 Define RunStateCoreFields interface in src/types/contracts.ts extracting all fields from current RunState
- [x] 1.2 Redefine RunState as generic type alias: RunState<TAdapter extends Record<string, unknown> = Record<string, never>> = RunStateCoreFields & TAdapter
- [x] 1.3 Export RunStateCoreFields from src/types/contracts.ts and verify existing re-exports still work
- [x] 1.4 Run npm run typecheck to confirm all existing consumers compile without changes

## 2. PhaseContract Structured Extension ✓

> Add declarative input, output, and gate_conditions optional fields to PhaseContract.

- [x] 2.1 Define PhaseIODescriptor interface with readonly artifacts field in src/lib/phase-router/types.ts
- [x] 2.2 Define GateCondition interface with kind union type and optional target field in src/lib/phase-router/types.ts
- [x] 2.3 Add optional input, output, and gate_conditions fields to existing PhaseContract interface
- [x] 2.4 Export PhaseIODescriptor and GateCondition from src/lib/phase-router/types.ts
- [x] 2.5 Run npm run typecheck and existing phase-router tests to confirm backward compatibility

## 3. resolveRunId Auto-Resolution ✓

> Implement resolveRunId function returning Result type for Change ID to Run ID resolution.

> Depends on: runstate-core-adapter-split

- [x] 3.1 Define ResolveRunIdErrorKind type and ResolveRunIdError interface in src/lib/run-store-ops.ts
- [x] 3.2 Implement resolveRunId(store, changeId) using findLatestRun and status filtering, returning Result<string, ResolveRunIdError>
- [x] 3.3 Handle all error cases: no_active_run, change_not_found, multiple_active_runs
- [x] 3.4 Export resolveRunId, ResolveRunIdError, and ResolveRunIdErrorKind

## 4. RunState Generic Type Tests ✓

> Add compile-time assignability tests verifying RunState generic behavior and backward compatibility.

> Depends on: runstate-core-adapter-split

- [x] 4.1 Write compile-time test: unparameterized RunState is assignable from existing RunState shape
- [x] 4.2 Write compile-time test: RunState<CustomAdapter> includes both core and adapter fields
- [x] 4.3 Write compile-time test: adapter fields that shadow core fields produce type errors
- [x] 4.4 Write compile-time test: RunStateCoreFields is independently importable and usable

## 5. resolveRunId Unit Tests ✓

> Test all five resolveRunId scenarios using in-memory RunArtifactStore.

> Depends on: resolve-run-id

- [x] 5.1 Write test: returns run_id for single active run
- [x] 5.2 Write test: returns run_id for suspended run when no active exists
- [x] 5.3 Write test: returns no_active_run error when all runs are terminal
- [x] 5.4 Write test: returns change_not_found error when changeId has no runs
- [x] 5.5 Write test: returns multiple_active_runs error when ambiguous

## 6. Existing Conformance Test Verification ✓

> Verify all existing tests pass and no workflow-machine.ts modifications occurred.

> Depends on: runstate-core-adapter-split, phase-contract-structured-extension, resolve-run-id

- [x] 6.1 Run full test suite (npm test) and confirm all existing tests pass
- [x] 6.2 Run npm run typecheck and confirm zero type errors
- [x] 6.3 Verify workflow-machine.ts has zero modifications via git diff
- [x] 6.4 Run biome format/lint checks if configured
