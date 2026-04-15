## Context

`RunState` in `src/types/contracts.ts` is the single source of truth for
the persisted run payload. It currently mixes runtime-agnostic fields
(phase, status, history, agents, events, source, identity, timestamps,
lineage, run_kind) with local-filesystem-adapter fields (`project_id`,
`repo_name`, `repo_path`, `branch_name`, `worktree_path`,
`last_summary_path`). `docs/architecture.md` records the mixed shape
as "field-level split deferred" and notes that external runtimes
cannot determine which fields they must persist.

Epic #127 wants DB-backed persistence and a Server orchestrator to be
able to persist only the runtime-agnostic subset. This change lands the
type-level boundary that makes that future work possible, without
changing any on-disk JSON, any CLI behavior, or any test.

The codebase context audited for this design:

- 18 `src/` modules import `RunState` today; 8 of them live under
  `src/core/**`.
- Only two call sites under `src/core/**` read or write a
  local-adapter field: `start.ts` populates
  `project_id`/`repo_name`/`repo_path`/`branch_name`/`worktree_path`/
  `last_summary_path` via `WorkspaceContext`, and `update-field.ts`
  writes `last_summary_path`.
- Serialization/persistence helpers — `runStateValidator`
  (`src/lib/schemas.ts`), `readRunState`/`findLatestRun`/
  `findRunsForChange`/`generateRunId` (`src/lib/run-store-ops.ts`),
  `LocalFsRunArtifactStore` (`src/lib/local-fs-run-artifact-store.ts`)
  — all operate on the full payload and must continue to do so, because
  the local-adapter JSON still carries every field.
- `_helpers.ts` (`src/core/_helpers.ts`) has a `REQUIRED_RUN_STATE_FIELDS`
  allowlist that includes local-adapter keys. This predates the split
  and is flagged as a follow-up concern (see Open Questions).

## Goals / Non-Goals

**Goals:**

- Define `CoreRunState` and `LocalRunState` in `src/types/contracts.ts`
  such that their keys are disjoint and their union equals
  `keyof RunState`.
- Preserve the `RunState` name as `CoreRunState & LocalRunState` so no
  existing consumer needs code changes.
- Narrow every `src/core/**` function signature that only touches
  `CoreRunState` fields, using a generic bound that preserves the
  caller's concrete type across spread-and-return flows.
- Add a compile-time drift guard that fails the build if the two
  partitions stop being disjoint or stop exhaustively covering
  `RunState`.
- Update `docs/architecture.md` to remove every "field-level split
  deferred" caveat and point to the new split.

**Non-Goals:**

- No change to the `run-state` JSON schema, validator, or on-disk
  layout.
- No change to `src/adapters/**` or `src/bin/**` — the local adapter
  still produces the full `RunState`.
- No new capability added to `openspec/specs/`.
- No schema-level core/local split for external runtimes (deferred to
  a follow-up change under Epic #127).
- No narrowing of serialization/persistence helpers — they continue to
  type on `RunState`.
- No reorganization of `REQUIRED_RUN_STATE_FIELDS` in `_helpers.ts`
  (flagged as follow-up).

## Decisions

### D1. Intersection alias instead of rename

`RunState = CoreRunState & LocalRunState` is exported alongside the two
new types. Consumers continue importing `RunState` and see the same
shape. The split is additive at the type level.

Alternatives considered:

- **Rename `RunState` to `LocalRunState` and introduce a new
  `CoreRunState`.** Breaks every import site (>30 files). Rejected.
- **Export only `CoreRunState` and let the local adapter extend it
  with its own interface.** Works but forces every current `RunState`
  consumer to choose between the narrow core type and a new wider name,
  which is a semantic breaking change. Rejected to keep scope
  type-level-only.

### D2. Generic bound `<T extends CoreRunState>` for spread-and-return core flows

`advanceRun`, `suspendRun`, and `resumeRun` all load a run state,
spread it, and write a new state that overrides only core fields
(`current_phase`, `status`, `updated_at`, `allowed_events`, `history`).
They currently take `RunState` and return `RunState`.

They will be re-typed as:

```ts
function suspendRun<T extends CoreRunState>(
  input: SuspendInput,
  deps: SuspendDeps,
): Result<T, CoreRuntimeError>
```

with the internal `loadRunState` helper generic as well. This way a
local caller passing (and recovering) `RunState` still gets
`Result<RunState, …>`, while a hypothetical external caller holding
just `CoreRunState` gets `Result<CoreRunState, …>`.

Alternatives considered:

- **Plain `CoreRunState` parameter and return type.** Correct for a
  DB-backed future caller, but lossy for existing callers — the
  returned value loses type-level access to local fields, even though
  the runtime value still carries them. Rejected because it would force
  CLI wiring to re-read the full `RunState` after every core call just
  to satisfy TypeScript.
- **Keep on `RunState`.** Rejected because C2's answer requires
  exhaustive narrowing under `src/core/**`.

### D3. Functions that produce or write local-adapter fields keep `RunState`

- `startChangeRun`/`startSyntheticRun` populate
  `project_id`/`repo_name`/`repo_path`/`branch_name`/`worktree_path`
  from `WorkspaceContext`. Their output is `RunState`.
- `updateRunField` writes `last_summary_path`. Its signature stays
  `Result<RunState, …>`.

Rationale: these functions' *purpose* is to mint or mutate a local
payload. Narrowing them to `CoreRunState` would be incorrect.

### D4. Read-only surface functions keep `RunState`

- `readRunStatus` (core/status.ts) returns the full on-disk payload.
- `getRunField` (core/get-field.ts) reads an arbitrary field.

Both stay on `RunState`. Their contract is "surface what is persisted,"
which is the full intersection today.

### D5. Compile-time drift guard lives under `src/tests/`

A new file `src/tests/run-state-partition.test.ts` (or adjacent under
`src/tests/type-guards/`) defines:

```ts
type AssertEqual<A, B> =
  [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _coreLocalDisjoint: AssertEqual<
  keyof CoreRunState & keyof LocalRunState,
  never
> = true;

const _exhaustive: AssertEqual<
  keyof CoreRunState | keyof LocalRunState,
  keyof RunState
> = true;
```

If either condition breaks, the TypeScript build fails at
`bun run typecheck`, catching drift before tests run. The file
needs a single runtime export (e.g., a no-op `it.skip` under the
existing test runner, or a `describe.skip`) to avoid classification as
an unused module in the test harness.

Alternatives considered:

- **JSDoc + reviewer checklist.** No mechanical guard; rejected because
  C3 picked the type-level guard.
- **Runtime schema assertion.** Duplicates the validator; rejected as
  heavier than needed for a pure type contract.

### D6. Documentation pass in `docs/architecture.md`

Update three call sites documented today:

- Inventory row "Run-state JSON structure" — replace the "Not yet
  supported" caveat with a description of the type-level split and a
  reference to the follow-up schema-split change.
- Core-adjacent modules subsection — remove "the field-level split is
  deferred to a separate follow-up proposal" and replace with a
  reference to `CoreRunState`/`LocalRunState`.
- Persistence concerns subsection — update the paragraph that
  enumerates mixed fields to describe the split instead.

## Risks / Trade-offs

- **[Risk] Generic propagation surprises.** Making `loadRunState` and
  friends generic may cause inference regressions in callers that rely
  on contextual typing. → **Mitigation:** keep the generic default to
  `RunState` via `<T extends CoreRunState = RunState>` so existing
  call sites infer the same type as today. Run the full
  `bun run typecheck` after each module narrowed.

- **[Risk] Drift-guard test is easy to silence.** A developer could
  delete the assertions to "fix" a failing build. → **Mitigation:**
  include the drift-guard file in the `repo-scan` inventory and
  reference it in `docs/architecture.md` so its purpose is visible
  outside the test file.

- **[Trade-off] Core helpers still require local fields via
  `REQUIRED_RUN_STATE_FIELDS`.** The core runtime rejects run-state
  JSON missing `project_id`/`repo_path`/etc. That is inconsistent with
  the new type-level claim that core depends only on `CoreRunState`.
  We accept this trade-off for now because no external runtime reads
  via `loadRunState` yet. → **Follow-up:** a separate change under
  Epic #127 should relocate local-adapter field enforcement to the
  adapter layer.

- **[Risk] Intersection widening.** If someone adds a new field to
  `RunState` directly (outside `CoreRunState`/`LocalRunState`), the
  drift guard fails. That is intended — but the error site (a TypeScript
  error in a test file) may not be obvious. → **Mitigation:** include
  a `// Adding a new field? Put it in CoreRunState or LocalRunState, not RunState.`
  comment at the top of `contracts.ts` near the declarations.

## Migration Plan

- **Deploy**: this is a pure type-level refactor with no schema
  change, so rollout is a standard PR merge. No feature flag, no
  data migration.
- **Rollback**: revert the single commit. No data migration means no
  reverse migration is needed.
- **Verification gate**: `bun run typecheck && bun run test` must
  pass before merge. Because the drift-guard test is compile-time,
  `typecheck` is the primary gate.

## Open Questions

- **Should the core runtime stop requiring local-adapter fields in
  `REQUIRED_RUN_STATE_FIELDS`?** (Documented as a follow-up trade-off.)
  Answer deferred to a separate change under Epic #127.
- **Should we expose `LocalRunState` from a barrel (e.g.
  `src/adapters/local/index.ts`) to signal ownership?** Current
  proposal keeps both types in `src/types/contracts.ts` for discoverability.

## Concerns

User-facing concerns in this change (vertical slices):

- **C-1 (types)**: Introduce `CoreRunState`, `LocalRunState`, and the
  intersection alias in `src/types/contracts.ts`. Resolves the
  "external runtime cannot tell which fields are core" problem at the
  type level.
- **C-2 (core narrowing)**: Narrow `advanceRun`/`suspendRun`/
  `resumeRun` (and the internal `loadRunState`/`writeRunState`
  helpers) with `<T extends CoreRunState = RunState>` so local
  callers see `RunState` and hypothetical core-only callers see
  `CoreRunState`. Resolves the "core signatures leak local-adapter
  shape" problem.
- **C-3 (drift guard)**: Add `src/tests/run-state-partition.test.ts`
  with compile-time assertions. Resolves the "nothing prevents future
  drift" risk flagged in challenge C3.
- **C-4 (docs)**: Remove the "field-level split deferred" caveats
  from `docs/architecture.md` and reference the new split.

## State / Lifecycle

- **Canonical state**: the on-disk JSON payload at
  `.specflow/runs/<run_id>/run.json` is unchanged. It still carries the
  full field set described by `RunState`.
- **Derived state**: none. The split is purely a type-level view over
  the same payload.
- **Lifecycle boundaries**: `start` writes the payload; `advance` /
  `suspend` / `resume` / `update-field` mutate and rewrite it; the
  adapter layer reads and writes via `RunArtifactStore`. None of these
  lifecycle steps change.
- **Persistence-sensitive state**: none new. The drift guard is
  compile-time only and does not persist anything.

## Contracts / Interfaces

- **Types layer (`src/types/contracts.ts`)**:
  - ADDED: `CoreRunState` interface — 12 fields.
  - ADDED: `LocalRunState` interface — 6 fields.
  - CHANGED: `RunState` becomes `CoreRunState & LocalRunState`
    (was a flat interface). Identical in shape to today.
- **Core runtime (`src/core/**`)**:
  - `advanceRun`, `suspendRun`, `resumeRun`: signature changes from
    `Result<RunState, …>` to `Result<T, …>` with
    `<T extends CoreRunState = RunState>`. Defaults preserve today's
    inference for current callers.
  - `loadRunState`, `writeRunState` (internal helpers in
    `_helpers.ts`): same generic treatment so the generics thread
    through.
  - `startChangeRun`, `startSyntheticRun`, `readRunStatus`,
    `getRunField`, `updateRunField`: unchanged on `RunState`.
- **CLI wiring (`src/bin/**`)**: no signature changes. Callers keep
  passing and receiving `RunState` by inference.
- **Adapters (`src/adapters/**`)**: no changes. They continue to read
  and write the full payload.
- **Drift guard test (`src/tests/run-state-partition.test.ts`)**: new
  file; exports no runtime types; asserts partition disjointness and
  exhaustiveness at compile time.

## Persistence / Ownership

- **Data ownership**:
  - `CoreRunState` fields → owned by the core runtime. Any runtime
    (local, DB, server) must persist these.
  - `LocalRunState` fields → owned by the local filesystem adapter
    only. External runtimes provide their own equivalents.
- **Storage mechanism**: unchanged (JSON at
  `.specflow/runs/<run_id>/run.json` via `LocalFsRunArtifactStore`).
- **Artifact ownership**: the new drift-guard test lives under
  `src/tests/` and is owned by the contracts module. The
  `docs/architecture.md` updates are owned by the documentation surface.
- **Schema ownership**: `run-state` JSON schema validator
  (`runStateValidator` in `src/lib/schemas.ts`) continues to validate
  the full intersection. Schema-level split is out of scope.

## Integration Points

- **TypeScript compiler** (`bun run typecheck`): primary enforcement
  point for the drift guard.
- **Test runner** (`bun run test`): runs existing tests unchanged.
  The drift-guard file exists as a test file but carries only
  compile-time assertions.
- **`docs/architecture.md`**: three text sites updated in a single
  documentation pass.
- **External runtimes (Epic #127 follow-ups)**: this change provides
  the type-level contract `CoreRunState`; the JSON-schema-level
  contract lands in a separate follow-up change.

## Ordering / Dependency Notes

Implementation order:

1. **C-1 (types)** is foundational — all other concerns depend on
   `CoreRunState`/`LocalRunState` being declared.
2. **C-3 (drift guard)** can land in the same commit as C-1, because
   the assertions are meaningless until the partition is declared.
3. **C-2 (core narrowing)** depends on C-1. Narrow one file at a time
   (`advance.ts`, `suspend.ts`, `resume.ts`, and the
   `_helpers.ts` internals) and run `bun run typecheck` between each
   to isolate inference regressions.
4. **C-4 (docs)** has no code dependencies and can be done in parallel
   with C-2.

No concern depends on an external artifact or on a prior bundle.

## Completion Conditions

- **C-1 complete** when `src/types/contracts.ts` exports
  `CoreRunState`, `LocalRunState`, and `RunState` with the agreed
  membership, and `bun run typecheck` passes.
- **C-2 complete** when every targeted core signature uses the
  generic bound, the full test suite (`bun run test`) passes, and
  `bun run typecheck` continues to pass.
- **C-3 complete** when the drift-guard test file compiles and the
  two assertions (`disjoint`, `exhaustive`) are in place; a deliberate
  perturbation (e.g., adding a duplicate key to both partitions) makes
  `bun run typecheck` fail.
- **C-4 complete** when `docs/architecture.md` no longer contains the
  phrase "field-level split deferred" and references `CoreRunState` /
  `LocalRunState` instead.
- **Overall complete** when `bun run typecheck && bun run test` pass
  and the spec delta under `openspec/changes/…/specs/workflow-run-state/`
  is archivable without further spec edits.
