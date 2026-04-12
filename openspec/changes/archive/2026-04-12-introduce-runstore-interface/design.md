## Context

`RunArtifactStore` interface (`src/lib/artifact-store.ts`) and `LocalFsRunArtifactStore` (`src/lib/local-fs-run-artifact-store.ts`) already provide the low-level CRUD contract for run state persistence. However, the primary consumers — `specflow-run.ts` (7 subcommands) and `specflow-prepare-change.ts` — bypass the store entirely:

- `specflow-run.ts` constructs paths via `runsDir()` / `runDir()` / `runFile()`, reads with `readFileSync()`, and writes with a local `atomicWrite()`.
- `run-identity.ts` helpers (`findRunIdsForChange`, `findRunsForChange`, `findLatestRun`, `generateRunId`) accept a `runsDir: string` parameter and scan the filesystem directly.
- `artifact-phase-gates.ts` accepts `_runStore: RunArtifactStore | null` but never reads from it.

This design describes how to wire the existing store into the CLI layer and replace the filesystem helpers with store-backed equivalents.

## Goals / Non-Goals

**Goals:**
- All run state I/O in `specflow-run.ts` and `specflow-prepare-change.ts` goes through `RunArtifactStore`
- `run-identity.ts` filesystem helpers are replaced by `run-store-ops.ts` store-backed functions and deleted
- `artifact-phase-gates.ts` `_runStore` parameter becomes active (plumbing only)
- Existing CLI behavior, run ID format, and test results are preserved

**Non-Goals:**
- Adding a DB-backed `RunArtifactStore` implementation
- Store selection/injection configuration (always LocalFs in this change)
- Changing `ChangeArtifactStore` integration (already wired)
- Modifying gate logic behavior (only plumbing the parameter)

## Decisions

### D1: Store instantiation at CLI entry points

Each CLI binary creates a `LocalFsRunArtifactStore` once at the top of `main()` and passes it as a parameter to all subcommand functions.

```
// specflow-run.ts main()
const runStore = createLocalFsRunArtifactStore(root);
// pass runStore to cmdStart, cmdAdvance, cmdStatus, etc.
```

**Rationale:** Simple constructor injection avoids global state, is easy to test, and sets the stage for future config-driven store selection without any additional abstraction. Each subcommand function gains a `store: RunArtifactStore` parameter alongside the existing `root` / `workflow` parameters.

**Alternative considered:** Factory function with config lookup. Rejected because this change is always LocalFs — adding config resolution now would be speculative.

### D2: New `run-store-ops.ts` module replaces `run-identity.ts`

Create `src/lib/run-store-ops.ts` with functions that accept `RunArtifactStore` instead of filesystem paths:

| Old (`run-identity.ts`) | New (`run-store-ops.ts`) | Change |
|---|---|---|
| `extractSequence(runId, changeId)` | `extractSequence(runId, changeId)` | Unchanged — pure string logic, no I/O |
| `findRunIdsForChange(runsDir, changeId)` | Removed — use `store.list({ changeId })` directly |  |
| `readRunStateWithFallback(path, dirName)` | `readRunState(store, runId)` | Reads via store, applies fallback internally |
| `findRunsForChange(runsDir, changeId)` | `findRunsForChange(store, changeId)` | Uses `store.list()` + `readRunState()`, then sorts by `extractSequence()` ascending |
| `findLatestRun(runsDir, changeId)` | `findLatestRun(store, changeId)` | Selects the run with the highest parsed sequence number, not the last lexicographic entry |
| `generateRunId(runsDir, changeId)` | `generateRunId(store, changeId)` | Uses `store.list()` + `extractSequence()` and returns `max(sequence) + 1` |

**Rationale:** The store already provides `list({ changeId })` which handles the directory scanning that `findRunIdsForChange` did manually. Higher-level operations compose `list()` with `read()`. `extractSequence` stays pure since it's string parsing with no I/O.

`RunArtifactStore.list()` remains a lexicographic enumeration primitive per the store contract. `run-store-ops.ts` owns the sequence-aware behavior on top of that contract and must not infer latest/next ordering from array position:

- `findRunsForChange()` reads the listed run IDs, parses each ID with `extractSequence()`, and returns runs sorted by numeric sequence ascending; this sorted result is the canonical per-change run order exposed to callers
- `findLatestRun()` computes the maximum parsed sequence number across the listed run IDs instead of selecting the final element from `findRunsForChange()` or `store.list()`, so `change-10` wins over `change-2` even though the store lists lexicographically
- `generateRunId()` also computes the maximum parsed sequence number directly from the listed run IDs and returns `<changeId>-<max + 1>` rather than deriving the next ID from list length or the final list entry

Call sites that need ordered or latest runs for a change use these helpers rather than consuming `store.list({ changeId })` ordering directly. This keeps `specflow-run.ts` and `specflow-prepare-change.ts` insulated from the store's lexicographic enumeration contract.

Tests for `run-store-ops.ts` explicitly cover double-digit run IDs with lexicographic input such as `change-1`, `change-10`, and `change-2`, proving that `findRunsForChange()` returns numeric order, `findLatestRun()` selects `change-10`, and `generateRunId()` returns `change-11`.

**Alternative considered:** Adding these as methods to `RunArtifactStore`. Rejected because these are domain operations that compose store primitives — adding them to the store interface would violate single responsibility and force every store implementation to duplicate the logic.

### D3: Eliminate direct filesystem access from `specflow-run.ts`

Replace the internal helper functions in `specflow-run.ts`:

| Remove | Replace with |
|---|---|
| `runsDir(root)` | Store injected at `main()` |
| `runDir(root, runId)` | Not needed — store handles paths |
| `runFile(root, runId)` | Not needed — store handles paths |
| `ensureRunExists(root, runId)` | `store.exists(runRef(runId))` + fail on false |
| `readRunState(path)` | `readRunState(store, runId)` from `run-store-ops.ts` |
| `atomicWrite(path, content)` | `store.write(runRef(runId), content)` |

Each `cmd*` function signature changes from `(args, root, ...)` to `(args, root, store, ...)` where `store: RunArtifactStore`.

### D4: `artifact-phase-gates.ts` plumbing activation

Rename `_runStore` → `runStore` and use it for `domain: "run"` requirements in the gate check loop. Currently the `resolveRequirement` function can return a `RunArtifactRef` but `checkGateRequirements` never checks run-domain refs. The change adds:

```
if ("runId" in ref) {
    if (runStore && !runStore.exists(ref)) {
        return requirement;
    }
}
```

No gate matrix entries currently produce run-domain requirements, so this is plumbing only — no behavioral change.

### D5: `validateChangeRunId` uses `ChangeArtifactStore`

The `validateChangeRunId` function currently reads `proposal.md` directly. Refactor it to accept `ChangeArtifactStore` and use `changeStore.exists(changeRef(changeId, "proposal"))`. This aligns with the pattern of eliminating all direct filesystem access for run-related operations.

**Alternative considered:** Leave `validateChangeRunId` as-is since it's about change artifacts, not run artifacts. Rejected because the function is called from `cmdStart` and mixing store-based and direct-access patterns in the same command would be inconsistent.

### D6: Validate `LocalFsRunArtifactStore` against the required store contract

Before the CLI refactor depends on `RunArtifactStore` semantics, confirm or adjust `LocalFsRunArtifactStore` so it satisfies the required contract. This validation happens before the CLI call sites are migrated so the new wiring is built on verified adapter behavior rather than assumptions:

- `write()` remains atomic through the existing temp-file + rename helper
- An immediate `read()` after `write()` returns the newly written content
- `list({ changeId })` filters to valid `<changeId>-<N>` run IDs for that change rather than returning arbitrary prefix matches
- `list()` and `list({ changeId })` return refs in deterministic lexicographic `runId` order

Tests in `artifact-store.test.ts` are expanded at the same time to pin these semantics explicitly, especially:

- `list({ changeId })` prefix filtering for the requested change ID
- deterministic lexicographic ordering from the LocalFs adapter, including `change-1`, `change-10`, `change-2`
- write/read assertions that prove the adapter remains atomic and read-after-write consistent

These adapter tests intentionally differ from the `run-store-ops.ts` tests: the store tests pin lexicographic enumeration, while the caller tests pin numeric sequence selection built on top of that enumeration.

**Rationale:** The CLI migration is intentionally built on the store contract rather than filesystem behavior. Verifying the LocalFs adapter now prevents the new CLI wiring from silently depending on untested assumptions.

**Alternative considered:** Trust the existing adapter and only test the new CLI paths. Rejected because the refactor makes adapter semantics part of the behavioral contract for all current and future `RunArtifactStore` consumers.

## Risks / Trade-offs

**[Risk] readRunStateWithFallback backward-compatibility logic is fragile** → The fallback logic (inferring `run_id` from directory name, defaulting `status` based on `current_phase`) is currently in `run-identity.ts` and depends on filesystem structure knowledge. Moving to `run-store-ops.ts` preserves this logic but it now operates on `store.read()` output only. Since `store.read()` returns raw content and the caller parses it, the fallback logic works unchanged.

**[Risk] Performance — multiple store calls per operation** → Operations like `findLatestRun` call `store.list()` then `store.read()` for each result. For the LocalFs adapter this is equivalent to the current `readdirSync` + `readFileSync` pattern. No degradation expected. A future DB adapter could optimize `list` + `read` into a single query.

**[Risk] `specflow-prepare-change.ts` has a second direct-access path for runs** → This binary constructs `runsPath` at line 185 to find non-terminal runs. It also needs `ChangeArtifactStore` for proposal writing. Both stores must be injected at its entry point, and the non-terminal lookup should use `run-store-ops.ts` helpers so it does not accidentally depend on lexicographic store ordering.

**[Trade-off] Deleting `run-identity.ts` entirely vs. keeping as thin wrapper** → Full deletion is cleaner but requires updating all import sites in a single change. Since the only consumers are `specflow-run.ts` and `specflow-prepare-change.ts` (plus tests), the blast radius is manageable.
