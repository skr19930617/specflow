## 1. Async Store Interfaces & ArtifactStoreError ✓

> Migrate RunArtifactStore and ChangeArtifactStore interfaces to Promise-based signatures and introduce ArtifactStoreError typed error hierarchy.

- [x] 1.1 Define ArtifactStoreErrorKind type and ArtifactStoreError class with kind discriminant in artifact-types.ts
- [x] 1.2 Change RunArtifactStore interface methods (read, write, exists, list) to return Promise<T>
- [x] 1.3 Change ChangeArtifactStore interface methods (read, write, exists, list, listChanges, changeExists) to return Promise<T>
- [x] 1.4 Remove ArtifactNotFoundError class; retain UnknownArtifactTypeError unchanged
- [x] 1.5 Update all import sites that referenced ArtifactNotFoundError to use ArtifactStoreError

## 2. LocalFs Adapter Async Wrapping ✓

> Wrap LocalFsRunArtifactStore and LocalFsChangeArtifactStore sync FS calls in Promise.resolve/reject to conform to the new async interface.

> Depends on: store-interface-and-error-types

- [x] 2.1 Update LocalFsRunArtifactStore methods to return Promise.resolve for success and Promise.reject(ArtifactStoreError) for failure
- [x] 2.2 Update LocalFsChangeArtifactStore methods to return Promise.resolve for success and Promise.reject(ArtifactStoreError) for failure
- [x] 2.3 Replace all throw ArtifactNotFoundError with Promise.reject(new ArtifactStoreError({kind: 'not_found'}))
- [x] 2.4 Map FS errors (ENOENT, EACCES, etc.) to appropriate ArtifactStoreError kinds

## 3. Run-Store-Ops Async Migration ✓

> Migrate run-store-ops.ts helper functions to async, keeping extractSequence as sync pure computation.

> Depends on: store-interface-and-error-types

- [x] 3.1 Add async to readRunState, findRunsForChange, findLatestRun, generateRunId
- [x] 3.2 Add await to all store method calls within run-store-ops functions
- [x] 3.3 Verify extractSequence remains sync (pure computation, no store calls)

## 4. Core Runtime & Helpers Async Migration ✓

> Migrate all 7 core command functions and _helpers.ts to async, preserving the Result<Ok, CoreRuntimeError> envelope.

> Depends on: store-interface-and-error-types, run-store-ops-migration

- [x] 4.1 Migrate loadRunState and writeRunState in _helpers.ts to async; catch ArtifactStoreError and convert to CoreRuntimeError Result
- [x] 4.2 Migrate start.ts to async function returning Promise<Result<RunState, CoreRuntimeError>>
- [x] 4.3 Migrate advance.ts to async
- [x] 4.4 Migrate suspend.ts to async
- [x] 4.5 Migrate resume.ts to async
- [x] 4.6 Migrate status.ts to async
- [x] 4.7 Migrate update-field.ts and get-field.ts to async
- [x] 4.8 Migrate artifact-phase-gates.ts to await exists() calls
- [x] 4.9 Migrate InteractionRecordStore methods that call ChangeArtifactStore to async (propagated dependency)
- [x] 4.10 Migrate review-runtime.ts store read/write calls to async

## 5. CLI Entry Points Async Migration ✓

> Wrap CLI main() functions in async and await all core runtime calls, preserving stdout/stderr/exit code behavior.

> Depends on: core-runtime-async-migration

- [x] 5.1 Convert specflow-run.ts main to async; add await to all core runtime calls
- [x] 5.2 Convert specflow-prepare-change.ts main to async; add await to all core runtime calls
- [x] 5.3 Map unhandled ArtifactStoreError rejections to stderr output and exit code 1
- [x] 5.4 Verify observable CLI behavior (stdout, stderr, exit codes) is unchanged via manual smoke test

## 6. Test Suite Async Migration ✓

> Migrate all test files, InMemoryRunArtifactStore, and in-memory change store helpers to async/await with no behavioral assertion changes.

> Depends on: localfs-adapter-migration, core-runtime-async-migration, run-store-ops-migration

- [x] 6.1 Update InMemoryRunArtifactStore to return Promises and reject with ArtifactStoreError
- [x] 6.2 Update in-memory change store helper to return Promises and reject with ArtifactStoreError
- [x] 6.3 Add async/await to all test functions that call store methods or core runtime functions
- [x] 6.4 Update error assertion tests to check ArtifactStoreError.kind instead of instanceof ArtifactNotFoundError
- [x] 6.5 Run full test suite and verify all tests pass with no behavioral changes

## 7. Conformance Test Suite for External Adapters ✓

> Create exportable conformance test factory functions that validate any RunArtifactStore or ChangeArtifactStore implementation against the contract.

> Depends on: store-interface-and-error-types

- [x] 7.1 Create runArtifactStoreConformance factory function covering read/write/exists/list contract
- [x] 7.2 Create changeArtifactStoreConformance factory function covering all 6 method contracts
- [x] 7.3 Add error-path tests: not_found rejection, write_failed, read_failed kinds
- [x] 7.4 Create conformance/index.ts barrel export
- [x] 7.5 Configure npm package exports for specflow-node/conformance entry point
- [x] 7.6 Validate conformance suite passes with InMemoryRunArtifactStore

## 8. Architecture Documentation & Persistence Contract ✓

> Update docs/architecture.md with persistence contract status change and CoreRunState → DB column mapping guidance.

- [x] 8.1 Update persistence contract status from 'deferred-required' to 'defined' in architecture.md
- [x] 8.2 Add CoreRunState → SQL type mapping table with recommended column types and notes
- [x] 8.3 Add BREAKING notice section documenting the sync-to-async interface migration for external consumers
