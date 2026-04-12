## Context

`ChangeArtifactStore` and `RunArtifactStore` interfaces are defined in `src/lib/artifact-store.ts`, with `LocalFsChangeArtifactStore` and `LocalFsRunArtifactStore` adapters. `specflow-run` already uses both stores. However, five bin files still construct artifact paths directly via `resolve(projectRoot, "openspec/changes", changeId)` and use raw `readFileSync`/`writeFileSync`:

- `specflow-review-proposal.ts` (1 path construction + direct read/write)
- `specflow-review-design.ts` (3 path constructions + direct read/write)
- `specflow-review-apply.ts` (3 path constructions + direct read/write)
- `specflow-prepare-change.ts` (2 path helpers: `changeDir()`, `proposalPath()`)
- `specflow-analyze.ts` (2 `readdirSync` calls for `openspec/specs` and `openspec/changes`)

The three review bins also still depend on shared helper APIs that take `changeDir` and perform change-artifact path resolution or I/O internally. The current migration cannot stop at `main()`-level store injection because `readLedger`, `backupAndWriteLedger`, `renderCurrentPhase`, `readDesignArtifacts`, `validateChangeDir`, local `resetLedger`, local `readProposal`, and the design autofix `fileHash(resolve(changeDir, ...))` paths would otherwise keep indirect `openspec/changes` coupling in place. That helper surface spans every affected review command path: proposal `review` / `fix-review` / `--reset-ledger`, design `review` / `fix-review` / `autofix-loop` / `--reset-ledger`, and apply `review` / `fix-review` / `autofix-loop`.

## Goals / Non-Goals

**Goals:**
- Remove all direct path construction (`resolve(…, "openspec/changes", …)`) from the five listed bin files
- Add `listChanges()` and `changeExists()` to `ChangeArtifactStore` interface and `LocalFsChangeArtifactStore`
- Refactor the review helper layer so review/fix-review/autofix/reset flows consume `ChangeArtifactStore` and artifact refs instead of `changeDir`
- Maintain identical external behavior — no observable changes to CLI output, exit codes, or file layout

**Non-Goals:**
- Migrating `openspec/specs` directory traversal in `specflow-analyze.ts` (future `SpecStore`)
- Changing the `ChangeArtifactStore` read/write/exists/list signatures
- Adding async I/O or caching

## Decisions

### D1: Extend ChangeArtifactStore with two new methods

Add `listChanges(): readonly string[]` and `changeExists(changeId: string): boolean` to the `ChangeArtifactStore` interface.

**Rationale:** `specflow-analyze` needs cross-change enumeration (`listChanges`), and `specflow-prepare-change` needs container-level existence checking (`changeExists`) that is distinct from artifact-level `exists()`. These are the minimal additions to cover all five bin files.

**Alternative considered:** A separate `ChangeDiscoveryStore` interface. Rejected because it would split a single domain across two interfaces with no clear benefit.

### D2: Each bin file receives the store via constructor injection at its entry point

Each bin's `main()` function will call `createLocalFsChangeArtifactStore(root)` and pass the store down to helper functions. This matches the existing pattern in `specflow-run.ts`. For the review bins, store injection continues through the shared helper layer rather than stopping at the command entry point.

Implementation order is fixed: extend the store interface first, then migrate the shared review helpers, and only then swap the review bin call sites. A review bin is not considered migrated while any of its targeted helper paths still require `changeDir`.

**Rationale:** Consistent with the established factory pattern. No DI framework needed.

### D3: specflow-prepare-change scaffold detection uses two-step store check

Replace `ensureChangeExists` to use `changeStore.changeExists(changeId)` instead of `existsSync(changeDir(root, changeId))`. Replace `ensureProposalDraft` to use `changeStore.exists(proposalRef)` and `changeStore.read(proposalRef)` instead of `existsSync(path)` / `readFileSync(path)`. Change directory creation remains delegated to `openspec new change` CLI — the store is not responsible for scaffold creation.

**Rationale:** The store abstracts container-level queries (`changeExists`) separately from artifact-level queries (`exists`, `read`) to support the "directory exists but proposal absent" case safely.

### D4: Review helper APIs become store-aware before review bin migration is considered complete

The review migration includes the shared helper layer and command-local helper wrappers, not just the bin entry points. `src/lib/review-ledger.ts`, `src/lib/review-runtime.ts`, and bin-local helpers that currently accept `changeDir` will be refactored or wrapped so callers pass `ChangeArtifactStore` plus `changeId` / `ChangeArtifactRef` data instead. If wrappers are introduced to limit churn, the migrated review commands must call only the store-backed wrappers and must no longer route through the old `changeDir`-accepting entry points.

The covered paths are:
- ledger read/write and recovery helpers (`readLedger`, `backupAndWriteLedger`)
- current-phase rendering (`renderCurrentPhase`)
- design artifact aggregation and change validation (`readDesignArtifacts`, `validateChangeDir`)
- per-bin helpers that currently hide direct artifact access (`readProposal`, `resetLedger`)
- design autofix content hashing, which must hash store-read artifact contents instead of `fileHash(resolve(changeDir, ...))`
- every review command mode that reaches those helpers: proposal `review` / `fix-review` / `--reset-ledger`, design `review` / `fix-review` / `autofix-loop` / `--reset-ledger`, and apply `review` / `fix-review` / `autofix-loop`

This keeps `review`, `fix-review`, `autofix-loop`, and `--reset-ledger` on the same store-backed path and removes both direct and indirect `resolve(..., "openspec/changes", ...)` usage from the targeted bins. Migration is incomplete until every one of those command paths reaches change artifacts exclusively through store-backed helpers. No migrated review command path may retain a fallback helper that still accepts `changeDir` for change-artifact reads, writes, hashing, or validation.

**Rationale:** Injecting the store only into `main()` would leave the real artifact I/O hidden behind helper APIs and would not satisfy the ownership-boundary goal.

### D5: Behavior-sensitive flows get targeted regression coverage

The migration will extend existing CLI/integration tests for the two flows most likely to regress:
- `specflow-prepare-change` must preserve the current two-step scaffold detection: reuse an existing change directory, seed `proposal.md` when it is missing, and also reseed when it exists but is empty
- review-ledger lifecycle must preserve the current split between overwrite behavior during review/fix-review/autofix and reset behavior when `--reset-ledger` is used, with command-level coverage for proposal, design, and apply ledger variants on the overwrite path and proposal/design coverage on the reset path

These targeted checks are part of verification, not an implied side effect of the aggregate `bun test` / typecheck / lint runs.

**Rationale:** Generic `bun test` / typecheck / lint coverage and store unit tests do not prove that these observable behaviors stayed unchanged after the helper-layer refactor.

### D6: specflow-analyze retains direct I/O for openspec/specs

`specflow-analyze.ts` lists both `openspec/specs` (baseline specs) and `openspec/changes` (active changes). Only the changes traversal migrates to `store.listChanges()`. The specs traversal remains as direct `readdirSync` — this is explicitly scoped out for a future `SpecStore` interface.

**Rationale:** Keeps the change focused. Introducing a `SpecStore` for a single read-only listing call in one file is premature.

## Risks / Trade-offs

- **[Risk] `changeExists` and `listChanges` expand the store interface** — These are narrow additions (each ~3 lines of implementation). The interface surface grows from 4 to 6 methods, but both methods are inherently part of the change-domain contract. Mitigation: both methods are read-only and have no side effects.
- **[Risk] Review helper refactoring can leave indirect `changeDir` coupling behind** — The review bins currently reach change artifacts through shared helpers, so partial migration at the bin entry points would not actually remove `openspec/changes` path usage. Mitigation: migrate or wrap the helper layer first, and treat review/fix-review/autofix/reset call paths as part of the same refactor scope.
- **[Risk] Review-ledger reset and overwrite paths have different behavior today** — `backupAndWriteLedger` and store-backed review-ledger writes create `.bak` files on overwrite, while the current `resetLedger` helpers overwrite the ledger directly. Mitigation: preserve that distinction explicitly in the helper migration and add targeted CLI regression tests for overwrite and reset flows.
- **[Trade-off] `openspec new change` remains outside the store** — The store is a read/write abstraction, not a scaffold creator. This means `specflow-prepare-change` still directly invokes the `openspec` CLI for directory creation. This is acceptable because scaffold creation is a one-time operation with side effects beyond the store's scope (e.g., git-related setup).
