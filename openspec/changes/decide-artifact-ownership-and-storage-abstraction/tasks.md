## 1. Artifact Model, Identity Types, and Documentation

- [x] 1.1 Define `ChangeArtifactType` union type: `"proposal" | "design" | "tasks" | "spec-delta" | "review-ledger" | "current-phase" | "approval-summary"`
- [x] 1.2 Define `RunArtifactType` union type: `"run-state"`
- [x] 1.3 Define `ReviewLedgerKind` union: `"proposal" | "design" | "apply"`
- [x] 1.4 Define `ChangeArtifactRef` discriminated union for concrete identified change artifacts
- [x] 1.5 Define `RunArtifactRef` type for concrete identified run artifacts: `{ runId: string, type: "run-state" }`
- [x] 1.6 Define `ChangeArtifactQuery` and `RunArtifactQuery` descriptor types for `list` operations that do not yet have a concrete qualifier or run id, with `ChangeArtifactQuery` omitting qualifier to enumerate all qualified artifacts of a type within a change and `RunArtifactQuery` acting as a metadata filter rather than a concrete `(runId, type)` identity
- [x] 1.7 Define `ArtifactRequirement` template types for the static phase gate matrix and runtime resolution to concrete refs without embedding runtime `changeId` / `runId` values
- [ ] 1.8 Document the canonical artifact table in the artifact-ownership-model spec with storage domain, creator/reader/updater ownership notes, lifecycle, and qualifier semantics for every artifact type
- [ ] 1.9 Document `openspec/changes/<id>/` and `.specflow/runs/` in an adapter-specific `LocalFs*` section, not as part of the core contract
- [x] 1.10 Add exhaustive type tests for artifact refs, queries, and gate requirements (valid and invalid states)

## 2. Store Interfaces

- [x] 2.1 Define `ChangeArtifactStore` interface: `read`, `write`, `exists` with `ChangeArtifactRef`, plus `list(query: ChangeArtifactQuery)`
- [x] 2.2 Define `RunArtifactStore` interface: `read`, `write`, `exists` with `RunArtifactRef`, plus `list(query?: RunArtifactQuery)`
- [x] 2.3 Define typed error types: `ArtifactNotFoundError`, `UnknownArtifactTypeError`, `ArtifactSchemaValidationError`, `MissingRequiredArtifactError`
- [x] 2.4 Define shared runtime artifact validation helpers for closed artifact-type checks and `review-ledger` / `run-state` schema validation, consumed by adapters on every read/write boundary
- [x] 2.5 Define `ChangeArtifactStore.write` ledger-overwrite behavior to always create a backup before replacing existing `review-ledger` content, with no caller-controlled opt-out flag
- [x] 2.6 Add interface-level unit tests using in-memory stub implementations, including validation and typed error expectations

## 3. LocalFs Adapters

- [x] 3.1 Implement `LocalFsChangeArtifactStore` with path resolution mapping each artifact type to its filesystem location under `openspec/changes/<changeId>/`
- [x] 3.2 Implement spec-delta path resolution: `specs/<qualifier>/spec.md`
- [x] 3.3 Implement review-ledger path resolution: `review-ledger-<kind>.json` with unconditional backup-before-overwrite via `atomicWriteText` and `copyFileSync` or equivalent
- [x] 3.4 Implement `LocalFsRunArtifactStore` with path resolution: `.specflow/runs/<runId>/run.json`
- [x] 3.5 Wire runtime validation into `LocalFs*` adapters: reject unknown artifact types before path resolution, validate `review-ledger` JSON on change-store read/write, validate `run-state` JSON on run-store read/write, and surface `UnknownArtifactTypeError` / `ArtifactSchemaValidationError` from that boundary
- [x] 3.6 Implement `list` for both stores using `ChangeArtifactQuery` / `RunArtifactQuery`, returning concrete `*ArtifactRef` values
- [x] 3.7 Implement factory functions: `createLocalFsChangeArtifactStore(projectRoot)` and `createLocalFsRunArtifactStore(projectRoot)`
- [x] 3.8 Add integration tests for both adapters: read/write/exists/list operations against a temp directory
- [x] 3.9 Add adapter tests that reject unknown artifact types with `UnknownArtifactTypeError`
- [ ] 3.10 Add adapter tests that validate `review-ledger` and `run-state` JSON on read and write against their schemas

## 4. Artifact-Phase Gate Matrix

- [x] 4.1 Define gate matrix data structure: `Map<string, { required: ArtifactRequirement[], produced: ArtifactRequirement[] }>` keyed by `fromPhase:event`
- [x] 4.2 Populate gate matrix from current implicit artifact checks in bins (proposal required for start, design+tasks for design review, etc.)
- [ ] 4.3 Add build-time completeness check: verify gate matrix keys cover all state machine transitions
- [x] 4.4 Add unit tests: gate matrix returns correct requirement descriptors and resolves them to concrete refs for each transition context

## 5. Migrate specflow-run.ts to RunArtifactStore

- [ ] 5.1 Replace local `atomicWrite`, `runsDir`, `runDir`, `runFile` helpers with `RunArtifactStore` calls
- [ ] 5.2 Update `start` command to use `RunArtifactStore.write` and `ChangeArtifactStore.exists` for proposal check
- [ ] 5.3 Update `advance` command to resolve gate requirements against runtime `changeId` / `runId` context, check required artifacts via store, and throw `MissingRequiredArtifactError` on absence
- [ ] 5.4 Update `status`, `get-field`, `update-field` to use `RunArtifactStore.read`/`write`
- [ ] 5.5 Update `suspend`, `resume` to use `RunArtifactStore`
- [ ] 5.6 Update parity tests to pass store instances and cover typed missing-artifact failures

## 6. Migrate review-ledger.ts to ChangeArtifactStore

- [ ] 6.1 Replace `readLedger(changeDir, config)` with `ChangeArtifactStore.read(reviewLedgerRef)`
- [ ] 6.2 Replace `backupAndWriteLedger(changeDir, ledger, config, cleanRead)` with `ChangeArtifactStore.write(reviewLedgerRef, content)` while keeping any higher-level cleanliness logic outside the backup guarantee and removing any caller-controlled backup toggle
- [ ] 6.3 Remove `LedgerConfig.filename` parameter — the store resolves paths from the ref's qualifier
- [ ] 6.4 Update all callers of `readLedger`/`backupAndWriteLedger` to pass store instance
- [ ] 6.5 Update ledger tests to assert unconditional backup on overwrite and schema validation for persisted ledger JSON

## 7. Migrate review-runtime.ts to ChangeArtifactStore

- [ ] 7.1 Replace `validateChangeDir(projectRoot, changeId)` with `ChangeArtifactStore.exists(proposalRef)`
- [ ] 7.2 Replace `readDesignArtifacts(changeDir)` with store-based reads for proposal, design, tasks, and spec-deltas discovered via `ChangeArtifactQuery`
- [ ] 7.3 Replace `renderCurrentPhase` to write via `ChangeArtifactStore.write(currentPhaseRef, ...)`
- [ ] 7.4 Update all callers of `validateChangeDir`/`readDesignArtifacts` to pass store instance
- [ ] 7.5 Update review-runtime tests

## 8. Migrate remaining bins to store interfaces

- [ ] 8.1 Update `specflow-prepare-change.ts` to use `ChangeArtifactStore` for proposal creation
- [ ] 8.2 Update `specflow-review-design.ts` to receive `ChangeArtifactStore` instance
- [ ] 8.3 Update `specflow-review-proposal.ts` to receive `ChangeArtifactStore` instance
- [ ] 8.4 Update any remaining bins that construct `openspec/changes/` paths directly
- [ ] 8.5 Verify no direct `resolve(root, "openspec/changes", ...)` calls remain outside adapters (grep check)

## 9. Cleanup and Verification

- [ ] 9.1 Remove duplicated `atomicWrite` from `specflow-run.ts` (now handled by adapter)
- [ ] 9.2 Verify `src/lib/fs.ts` primitives are only imported by `LocalFs*` adapters
- [ ] 9.3 Run full test suite and verify all existing tests pass
- [ ] 9.4 Verify existing changes and runs load correctly without migration (backward compatibility)
- [ ] 9.5 Verify test coverage meets 80% threshold for new modules
