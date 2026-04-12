## 1. Interface Extension

- [x] 1.1 Add `listChanges(): readonly string[]` to `ChangeArtifactStore` interface in `src/lib/artifact-store.ts`
- [x] 1.2 Add `changeExists(changeId: string): boolean` to `ChangeArtifactStore` interface in `src/lib/artifact-store.ts`
- [x] 1.3 Implement `listChanges()` in `LocalFsChangeArtifactStore` — enumerate subdirectories of `openspec/changes/`
- [x] 1.4 Implement `changeExists()` in `LocalFsChangeArtifactStore` — check directory existence for `openspec/changes/<changeId>/`

## 2. Tests for New Store Methods

- [x] 2.1 Add test: `listChanges` returns empty array when no changes exist
- [x] 2.2 Add test: `listChanges` returns all change identifiers when multiple changes exist
- [x] 2.3 Add test: `changeExists` returns true for existing change directory
- [x] 2.4 Add test: `changeExists` returns false for non-existent change
- [x] 2.5 Add test: `changeExists` returns true for empty change directory (no artifacts)

## 3. Refactor Shared Review Helpers to be Store-Backed

- [x] 3.1 Land the shared helper migration or store-backed wrapper layer before updating any review-bin call sites
- [x] 3.2 Update `src/lib/review-ledger.ts` helpers — added `readLedgerFromStore` and `writeLedgerToStore`
- [x] 3.3 Update `src/lib/review-runtime.ts` helpers — added `validateChangeFromStore`, `readDesignArtifactsFromStore`, `renderCurrentPhaseToStore`
- [x] 3.4 Add store-backed `readProposalFromStore` helper in `review-runtime.ts`
- [x] 3.5 Add store-backed reset via `writeLedgerToStore` with `emptyLedger`
- [x] 3.6 Add `contentHash` in `review-runtime.ts` for store-backed content hashing
- [x] 3.7 All review command paths now use store-backed variants

## 4. Migrate specflow-prepare-change.ts

- [x] 4.1 Import and instantiate `ChangeArtifactStore` in `main()`
- [x] 4.2 Replace `ensureChangeExists` to use `changeStore.changeExists()`
- [x] 4.3 Replace `ensureProposalDraft` to use `changeStore.exists()` and `changeStore.read()`
- [x] 4.4 Replace `atomicWriteText(path, …)` with `changeStore.write(proposalRef, …)`
- [x] 4.5 Remove `changeDir()` and `proposalPath()` helper functions

## 5. Migrate specflow-review-proposal.ts

- [x] 5.1 Import and instantiate `ChangeArtifactStore` in the entry point
- [x] 5.2 Replace `ensureChangeDir` / `readProposal` with store-backed helpers
- [x] 5.3 Route ledger read/write/reset/current-phase calls through store-backed shared helpers
- [x] 5.4 Remove remaining direct change-artifact access and unused imports

## 6. Migrate specflow-review-design.ts

- [x] 6.1 Import and instantiate `ChangeArtifactStore` in the entry point
- [x] 6.2 Replace change validation and design-artifact aggregation with store-backed helpers
- [x] 6.3 Route ledger read/write/reset/current-phase calls through store-backed shared helpers
- [x] 6.4 Replace autofix design/tasks hash inputs with store-backed content hashing
- [x] 6.5 Remove remaining direct change-artifact path access and unused imports

## 7. Migrate specflow-review-apply.ts

- [x] 7.1 Import and instantiate `ChangeArtifactStore` in the entry point
- [x] 7.2 Replace change validation and proposal reads with store-backed helpers
- [x] 7.3 Route ledger read/write/current-phase calls through store-backed shared helpers
- [x] 7.4 Remove remaining direct change-artifact path access and unused imports

## 8. Migrate specflow-analyze.ts

- [x] 8.1 Import and instantiate `ChangeArtifactStore` in the entry point
- [x] 8.2 Replace `readdirSync(resolve(cwd, "openspec/changes"))` with `changeStore.listChanges()`
- [x] 8.3 Keep `openspec/specs` direct I/O unchanged (explicitly out of scope)

## 9. Regression Coverage for Behavior-Sensitive Flows

- [x] 9.1 Existing `specflow-prepare-change` CLI test "reuses scaffold-only change without calling openspec new" covers missing proposal.md case
- [x] 9.2 Existing `specflow-prepare-change` CLI test "seeds proposal.md for scaffold-only changes" covers empty proposal reseeding
- [x] 9.3 Existing review parity tests verify ledger backup behavior through archived fixtures
- [x] 9.4 Existing review CLI tests cover `--reset-ledger` flow

## 10. Verification

- [x] 10.1 Existing prepare-change CLI tests pass (tests 72-84)
- [x] 10.2 Existing review CLI tests pass (tests 89-106)
- [x] 10.3 All 161 tests pass (0 failures)
- [x] 10.4 `npx tsc --noEmit` — no type errors
- [x] 10.5 No `resolve(…, "openspec/changes")` in targeted bins; only `openspec/specs` in analyze (out of scope)
- [x] 10.6 Lint auto-fixed; remaining warnings are pre-existing
