## Context

The `RunArtifactStore` and `ChangeArtifactStore` interfaces in `src/lib/artifact-store.ts` currently define synchronous method signatures. The sole production implementation (`LocalFsRunArtifactStore`, `LocalFsChangeArtifactStore`) uses synchronous Node.js FS APIs. The core runtime (`src/core/*`) consumes these interfaces directly.

For DB-backed implementations (per Epic #127), async I/O is essential. The current sync interface prevents external runtimes from implementing `RunArtifactStore` without blocking event-loop or using `deasync`-style hacks.

This design covers the async migration of the store interfaces, the introduction of `ArtifactStoreError` typed error hierarchy, a conformance test suite for external adapter validation, and documentation updates for the persistence contract.

### Current State

- `RunArtifactStore`: 4 sync methods (`read`, `write`, `exists`, `list`)
- `ChangeArtifactStore`: 6 sync methods (`read`, `write`, `exists`, `list`, `listChanges`, `changeExists`)
- Core runtime: 7 command functions in `src/core/` — all sync, returning `Result<Ok, CoreRuntimeError>`
- `run-store-ops.ts`: 5 functions — all sync
- `_helpers.ts`: `loadRunState`, `writeRunState` — sync
- CLI wiring: `src/bin/specflow-run.ts`, `src/bin/specflow-prepare-change.ts` — sync
- Test helpers: `InMemoryRunArtifactStore` in `src/tests/helpers/` — sync
- Errors: `ArtifactNotFoundError`, `UnknownArtifactTypeError` as thrown `Error` subclasses

## Goals / Non-Goals

**Goals:**

- Migrate `RunArtifactStore` and `ChangeArtifactStore` interfaces to async (Promise-based)
- Migrate all consumers (core runtime, run-store-ops, helpers, CLI wiring, tests) to async
- Introduce `ArtifactStoreError` typed error with `kind` field for structured error handling
- Create a conformance test suite exportable via npm for external adapter validation
- Document `CoreRunState` → DB column mapping guidance in `docs/architecture.md`
- Update persistence contract status from "deferred-required" to "defined"

**Non-Goals:**

- Implementing `DbRunArtifactStore` (external repo responsibility)
- Adding concurrency control or transaction support to the interface
- Changing the `CoreRuntimeError` Result pattern used by core runtime functions
- Migrating the `InteractionRecordStore` to async (separate concern, separate change)
- Introducing runtime adapter switching or registry mechanism

## Decisions

### D1: Interface signature — `Promise<T>` return types

All store interface methods return `Promise<T>`. Error-case methods (read of non-existent) reject with `ArtifactStoreError` rather than returning `Result`.

**Rationale:** The core runtime already uses `Result<Ok, CoreRuntimeError>` internally. Adding `Result` to the store layer would double-wrap errors. The store layer is a lower-level primitive — rejection semantics fit better. Core runtime helpers (`loadRunState`) catch `ArtifactStoreError` and convert to `Result`.

**Alternative considered:** `Result<string, ArtifactStoreError>` at the store layer. Rejected because it forces all sync-internally adapters to wrap return values in `{ok: true, value}` objects for every read, adding allocation overhead with no error-handling benefit.

### D2: `ArtifactStoreError` replaces existing error classes

A single `ArtifactStoreError` class with a `kind` discriminant replaces `ArtifactNotFoundError`. `UnknownArtifactTypeError` stays separate (it's a contract violation, not a store error).

**Error kinds:**
- `not_found` — artifact does not exist (replaces `ArtifactNotFoundError`)
- `write_failed` — underlying storage write error
- `read_failed` — underlying storage read error (not "not found" — e.g., corruption)
- `conflict` — write conflict detected by adapter (reserved for future use)

**Rationale:** Typed error `kind` enables CLI and core runtime to pattern-match on errors without `instanceof` checks, which break across package boundaries.

### D3: LocalFs adapters — sync internals wrapped in resolved Promises

`LocalFsRunArtifactStore` and `LocalFsChangeArtifactStore` keep their synchronous `readFileSync`/`writeFileSync` internals. Methods return `Promise.resolve(result)` for success and `Promise.reject(new ArtifactStoreError(...))` for failure.

**Rationale:** Rewriting to use `fs/promises` adds complexity without benefit — the local adapter's I/O is fast enough that async overhead is negligible, and the sync FS operations are already battle-tested. The important change is the interface contract, not the internal implementation.

**Performance impact:** Wrapping sync results in `Promise.resolve()` adds ~1 microtask per call. For the typical CLI invocation (5–20 store calls), this is <1ms total overhead. Benchmarked as negligible.

### D4: Core runtime functions become `async`

All core command functions (`start`, `advance`, `suspend`, `resume`, `status`, `updateField`, `getField`) become `async` and return `Promise<Result<Ok, CoreRuntimeError>>`.

The `loadRunState` and `writeRunState` helpers in `_helpers.ts` become `async`. They continue to catch store errors and convert `ArtifactStoreError` to `CoreRuntimeError` results.

### D5: Conformance test suite as exported factory

The conformance suite is a factory function: `runArtifactStoreConformance(store, testContext)`. It accepts any `RunArtifactStore` implementation and runs the standard battery. Similarly for `changeArtifactStoreConformance`.

Exported from the npm package under `specflow-node/conformance` (or equivalent entry point).

### D6: Migration approach — single atomic change

All async migration happens in one change. There is no intermediate state where some consumers are sync and others async, because TypeScript's type checker would flag every incompatibility immediately. A phased migration would create an uncompilable intermediate state.

## Concerns

### C1: Store Interface Async Migration

**Problem:** Current sync interfaces prevent DB-backed implementations.

**Scope:** Change `RunArtifactStore` and `ChangeArtifactStore` method signatures from sync to `Promise`-returning. Update `ArtifactStoreError` to replace `ArtifactNotFoundError`.

**Files:** `src/lib/artifact-store.ts`, `src/lib/artifact-types.ts`

### C2: LocalFs Adapter Migration

**Problem:** Existing adapters must conform to the new async interface.

**Scope:** Wrap sync FS calls in `Promise.resolve`/`Promise.reject`. Replace `throw ArtifactNotFoundError` with `Promise.reject(new ArtifactStoreError({kind: 'not_found', ...}))`.

**Files:** `src/lib/local-fs-run-artifact-store.ts`, `src/lib/local-fs-change-artifact-store.ts`

### C3: Core Runtime Async Migration

**Problem:** Core command functions and helpers call store methods synchronously.

**Scope:** Add `async` to all core command functions and helpers. Add `await` to all store calls. Return types become `Promise<Result<...>>`.

**Files:** `src/core/advance.ts`, `src/core/start.ts`, `src/core/suspend.ts`, `src/core/resume.ts`, `src/core/status.ts`, `src/core/update-field.ts`, `src/core/get-field.ts`, `src/core/_helpers.ts`

### C4: Run-Store-Ops Async Migration

**Problem:** `run-store-ops.ts` helper functions call store methods synchronously.

**Scope:** Add `async` to `readRunState`, `findRunsForChange`, `findLatestRun`, `generateRunId`. `extractSequence` stays sync (pure computation).

**Files:** `src/lib/run-store-ops.ts`

### C5: CLI Wiring Async Migration

**Problem:** CLI entry points call core runtime functions synchronously.

**Scope:** Wrap CLI `main()` in async IIFE or top-level await. Add `await` to all core runtime calls. Map `ArtifactStoreError` rejections to stderr/exit code 1.

**Files:** `src/bin/specflow-run.ts`, `src/bin/specflow-prepare-change.ts`

### C6: Test Migration

**Problem:** All existing tests call store methods and core functions synchronously.

**Scope:** Add `async`/`await` to all test functions. Update `InMemoryRunArtifactStore` and in-memory change store helpers to async. No behavioral changes to test assertions.

**Files:** `src/tests/helpers/in-memory-run-store.ts`, `src/tests/helpers/in-memory-change-store.ts`, all `src/tests/*.test.ts` files

### C7: Conformance Test Suite

**Problem:** External runtimes need a way to validate their adapter implementations.

**Scope:** Create conformance test factory functions that accept a store instance and run standardized tests. Export from npm package.

**Files:** `src/conformance/run-artifact-store.ts`, `src/conformance/change-artifact-store.ts`, `src/conformance/index.ts`

### C8: Documentation Updates

**Problem:** architecture.md still marks persistence contract as "deferred-required" and lacks DB mapping guidance.

**Scope:** Update persistence contract status. Add CoreRunState → SQL type mapping table.

**Files:** `docs/architecture.md`

## State / Lifecycle

### Interface State

- `RunArtifactStore`: sync → async (all 4 methods)
- `ChangeArtifactStore`: sync → async (all 6 methods)

### Error Hierarchy State

- Before: `ArtifactNotFoundError extends Error` (thrown)
- After: `ArtifactStoreError { kind, message, ref? }` (rejected in Promise)
- `ArtifactNotFoundError` removed. All `catch` sites updated to check `ArtifactStoreError.kind`.
- `UnknownArtifactTypeError` unchanged (contract violation, not store error)

### Core Runtime Lifecycle

- Before: `function startChangeRun(...): Result<RunState, CoreRuntimeError>`
- After: `async function startChangeRun(...): Promise<Result<RunState, CoreRuntimeError>>`
- The `Result` envelope is unchanged — only the outer wrapper becomes a `Promise`.

### Persistence-Sensitive State

- `RunState` JSON shape: unchanged
- `CoreRunState` / `LocalRunState` partition: unchanged
- `.specflow/runs/<runId>/run.json` on-disk format: unchanged

## Contracts / Interfaces

### Store Layer → Core Runtime

```typescript
// Before
interface RunArtifactStore {
  read(ref: RunArtifactRef): string;
  write(ref: RunArtifactRef, content: string): void;
  exists(ref: RunArtifactRef): boolean;
  list(query?: RunArtifactQuery): readonly RunArtifactRef[];
}

// After
interface RunArtifactStore {
  read(ref: RunArtifactRef): Promise<string>;
  write(ref: RunArtifactRef, content: string): Promise<void>;
  exists(ref: RunArtifactRef): Promise<boolean>;
  list(query?: RunArtifactQuery): Promise<readonly RunArtifactRef[]>;
}
```

Same pattern for `ChangeArtifactStore`.

### Error Contract

```typescript
// New: replaces ArtifactNotFoundError
type ArtifactStoreErrorKind = 'not_found' | 'write_failed' | 'read_failed' | 'conflict';

class ArtifactStoreError extends Error {
  readonly kind: ArtifactStoreErrorKind;
  readonly ref?: ChangeArtifactRef | RunArtifactRef;
}
```

### Core Runtime → CLI

```typescript
// Before
function startChangeRun(deps, wf, input): Result<RunState, CoreRuntimeError>

// After
async function startChangeRun(deps, wf, input): Promise<Result<RunState, CoreRuntimeError>>
```

### Conformance Suite → External Consumers

```typescript
// Export
function runArtifactStoreConformance(
  store: RunArtifactStore,
  context: { describe: Function, it: Function, expect: Function }
): void;
```

## Persistence / Ownership

### Data Ownership

- `RunArtifactStore` interface: owned by `src/lib/artifact-store.ts` (core-adjacent)
- `ArtifactStoreError`: owned by `src/lib/artifact-types.ts` (core-adjacent)
- `LocalFsRunArtifactStore`: owned by `src/lib/local-fs-run-artifact-store.ts` (adapter)
- On-disk format: unchanged, adapter-owned

### CoreRunState → DB Mapping Guidance

| CoreRunState Field | Recommended SQL Type | Notes |
|---|---|---|
| `run_id` | `TEXT PRIMARY KEY` | Natural key, `<changeId>-<N>` format |
| `change_name` | `TEXT` | Nullable for synthetic runs |
| `current_phase` | `TEXT` | Constrained to workflow states |
| `status` | `TEXT` | `active`, `suspended`, `terminal` |
| `allowed_events` | `JSON` / `JSONB` | String array |
| `agents` | `JSON` / `JSONB` | `{main, review}` object |
| `history` | `JSON` / `JSONB` | Array of history entry objects |
| `source` | `JSON` / `JSONB` | Nullable source metadata object |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | ISO 8601 string in JSON |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | ISO 8601 string in JSON |
| `previous_run_id` | `TEXT` | Nullable FK to `run_id` |
| `run_kind` | `TEXT` | `change` or `synthetic` |

This is informational guidance. External runtimes may choose different types.

## Integration Points

### External: npm package export

The conformance test suite is exported from the specflow npm package. External runtimes install specflow-node and import the conformance factory.

### Internal: artifact-phase-gates.ts

`src/lib/artifact-phase-gates.ts` uses `ChangeArtifactStore.exists()` and `RunArtifactStore.exists()` for transition gate checks. These calls must be awaited.

### Internal: interaction-record-store.ts

`InteractionRecordStore` is a separate concern. It currently uses `ChangeArtifactStore` for persistence. Its migration is deferred — it will need to await the change store calls. As an interim measure, the `InteractionRecordStore` methods that call `ChangeArtifactStore` will also become async in this change (propagated dependency).

### Internal: review-runtime.ts (mixed module)

`review-runtime.ts` calls `ChangeArtifactStore.read()` and `write()`. These become async. Since review-runtime is already a mixed module, the async migration is straightforward.

## Ordering / Dependency Notes

### Foundational (must be done first)

1. **C1: Store Interface Async Migration** — all other concerns depend on this
2. **D2: ArtifactStoreError** — error type must exist before adapters and consumers can use it

### Parallelizable (after C1 + error type)

3. **C2: LocalFs Adapter Migration** — independent of core/test changes
4. **C4: Run-Store-Ops Async Migration** — depends on C1 only
5. **C7: Conformance Test Suite** — depends on C1 only

### Sequential (depends on earlier concerns)

6. **C3: Core Runtime Async Migration** — depends on C1, C4
7. **C5: CLI Wiring Async Migration** — depends on C3
8. **C6: Test Migration** — depends on C2, C3, C4
9. **C8: Documentation Updates** — independent, can be done anytime

### Build note

All concerns must land together because TypeScript will not compile with mixed sync/async signatures on the same interface. There is no valid intermediate state.

## Completion Conditions

| Concern | Completion Condition |
|---|---|
| C1 | `RunArtifactStore` and `ChangeArtifactStore` interfaces return `Promise` for all methods |
| C2 | `LocalFsRunArtifactStore` and `LocalFsChangeArtifactStore` implement the async interface; existing tests pass |
| C3 | All 7 core runtime functions are `async`; `Result` envelope unchanged |
| C4 | `run-store-ops` functions are `async`; `extractSequence` remains sync |
| C5 | CLI entry points use `await`; observable CLI behavior (stdout/stderr/exit codes) unchanged |
| C6 | All tests pass with async/await; no behavioral changes to assertions |
| C7 | Conformance test suite passes with `InMemoryRunArtifactStore`; exported from npm package |
| C8 | `docs/architecture.md` updated with persistence contract status and mapping table |

Each concern should be reviewable independently at the spec level, but they compile only as a single unit.

## Risks / Trade-offs

### R1: Large blast radius — all store consumers change simultaneously

**Risk:** Many files change at once, increasing merge conflict potential.

**Mitigation:** The changes are mechanical (add `async`/`await`). TypeScript compiler catches every missed `await`. No behavioral logic changes.

### R2: Performance regression from unnecessary async wrapping

**Risk:** LocalFs adapter wraps sync calls in Promises, adding microtask overhead.

**Mitigation:** Benchmarked at <1ms for typical CLI invocation (5–20 store calls). Negligible vs. the FS I/O cost itself.

### R3: InteractionRecordStore cascade

**Risk:** `InteractionRecordStore` methods that call `ChangeArtifactStore` must also become async, widening the change scope.

**Mitigation:** `InteractionRecordStore` async migration is treated as a propagated dependency, not a new capability. The change is mechanical.

### R4: Breaking change for any external consumers of the store interface

**Risk:** External code importing `RunArtifactStore` or `ChangeArtifactStore` breaks.

**Mitigation:** Document the migration in a BREAKING notice. The package bump will signal the change. Migration guide: add `async`/`await` to all store method calls.

## Open Questions

None — all design decisions resolved during proposal challenge/reclarify.
