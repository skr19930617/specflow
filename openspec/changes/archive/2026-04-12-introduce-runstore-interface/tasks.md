## 1. Validate LocalFsRunArtifactStore contract

- [x] 1.1 Confirm or update `src/lib/local-fs-run-artifact-store.ts` so `list({ changeId })` filters only valid `<changeId>-<N>` run IDs for the requested change and returns refs in deterministic lexicographic `runId` order
- [x] 1.2 Confirm the LocalFs adapter still satisfies the required write semantics (`write()` atomicity via temp-file + rename, plus immediate read-after-write consistency) and adjust the implementation only if the contract is not already met
- [x] 1.3 Update `artifact-store.test.ts` before the CLI wiring work so the LocalFs contract is explicitly pinned: `list({ changeId })` filtering for only valid run IDs of the requested change, deterministic lexicographic ordering, and read-after-write behavior, including double-digit run IDs such as `change-1`, `change-10`, and `change-2`

## 2. Create run-store-ops module

- [x] 2.1 Create `src/lib/run-store-ops.ts` with `extractSequence(runId, changeId)` (pure string logic, ported from `run-identity.ts`)
- [x] 2.2 Add `readRunState(store, runId)` that reads via `store.read(runRef(runId))` and applies backward-compatibility fallback
- [x] 2.3 Add `findRunsForChange(store, changeId)` using `store.list({ changeId })` + `readRunState()`, and sort by numeric `extractSequence()` ascending so mixed input such as `change-1`, `change-10`, `change-2` is returned as `change-1`, `change-2`, `change-10`
- [x] 2.4 Add `findLatestRun(store, changeId)` by computing the maximum parsed sequence number from the listed run IDs instead of relying on `store.list()` ordering or the final element from `findRunsForChange()`
- [x] 2.5 Add `generateRunId(store, changeId)` using `store.list({ changeId })` + `extractSequence()` and returning `max(sequence) + 1` rather than deriving the next ID from list position, so `change-1`, `change-10`, `change-2` produces `change-11`

## 3. Wire store into specflow-run.ts

- [x] 3.1 Add `RunArtifactStore` parameter to `main()` — instantiate `createLocalFsRunArtifactStore(root)` and pass to all `cmd*` functions
- [x] 3.2 Refactor `cmdStart` to use `store.write()`, `store.exists()`, and `run-store-ops.generateRunId()` / related helpers instead of `atomicWrite()`, `runsDir()`, `runFile()`
- [x] 3.3 Refactor `cmdAdvance` to use `store.read()` / `store.write()` via `run-store-ops.readRunState()` instead of `ensureRunExists()` + `readRunState(path)`
- [x] 3.4 Refactor `cmdSuspend` and `cmdResume` to use store-based read/write
- [x] 3.5 Refactor `cmdStatus` to use `run-store-ops.readRunState(store, runId)`
- [x] 3.6 Refactor `cmdUpdateField` and `cmdGetField` to use store-based read/write
- [x] 3.7 Remove internal helper functions: `runsDir()`, `runDir()`, `runFile()`, `ensureRunExists()`, `readRunState()`, `atomicWrite()`
- [x] 3.8 Refactor `validateChangeRunId` to accept `ChangeArtifactStore` and use `changeStore.exists()`

## 4. Wire store into specflow-prepare-change.ts

- [x] 4.1 Instantiate `createLocalFsRunArtifactStore(root)` at entry point
- [x] 4.2 Replace `runsPath` direct construction with `run-store-ops.findRunsForChange(store, changeId)` for non-terminal run lookup so the call site uses sequence-aware ordering while still delegating enumeration to `store.list({ changeId })`

## 5. Activate artifact-phase-gates plumbing

- [x] 5.1 Rename `_runStore` → `runStore` in `checkGateRequirements` signature
- [x] 5.2 Add run-domain ref check: `if ("runId" in ref) { if (runStore && !runStore.exists(ref)) return requirement; }`

## 6. Delete run-identity.ts

- [x] 6.1 Remove all imports of `run-identity.ts` from `specflow-run.ts` and `specflow-prepare-change.ts`
- [x] 6.2 Delete `src/lib/run-identity.ts`
- [x] 6.3 Update any remaining references in test files to import from `run-store-ops.ts`

## 7. Tests

- [x] 7.1 Add unit tests for `run-store-ops.ts` using a mock `RunArtifactStore` implementation, including double-digit run IDs that prove numeric ordering for `findRunsForChange`, maximum-sequence selection for `findLatestRun`, and next-ID generation for `generateRunId` (for example `change-1`, `change-10`, `change-2` -> latest `change-10`, next `change-11`)
- [x] 7.2 Run full test suite and fix any regressions
- [x] 7.3 Verify acceptance criteria: no `.specflow/runs` string literal in `specflow-run.ts` or `specflow-prepare-change.ts`
