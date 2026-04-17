## Context

A prior change partitioned `RunState` into `CoreRunState` and
`LocalRunState` at the type level and added a compile-time drift guard,
but `src/core/` still performs three kinds of I/O and still knows
about the local adapter:

1. `src/core/start.ts` imports `WorkspaceContext` and calls
   `projectRoot()` / `worktreePath()` / `branchName()` /
   `projectDisplayName()` / `projectIdentity()`.
2. Every command (`startChangeRun`, `startSyntheticRun`, `advanceRun`,
   `suspendRun`, `resumeRun`, `updateField`) calls the store helpers
   `loadRunState` / `writeRunState` through injected deps, and
   `advanceRun` additionally calls `InteractionRecordStore.write` /
   `list` / `delete` for approval and clarify records.
3. `src/core/status.ts` and `src/core/get-field.ts` are thin
   store-read wrappers with no transition logic.

The `RunStateCoreFields` type alias (= `RunState`) contradicts its
prior definition in the `runstate-adapter-extension` spec (which
said it contained *all* fields including local-adapter fields) and
is a maintenance hazard.

This design converts `src/core/` into a set of pure, adapter-
parameterized transition functions with all read/write I/O lifted
into the CLI wiring layer under `src/bin/**`. The existing
`LocalRunState` partition is preserved; `RunState` remains the
combined shape used on disk.

## Goals / Non-Goals

**Goals:**

- Remove every import of `WorkspaceContext`, every `RunArtifactStore`
  / `ChangeArtifactStore` / `InteractionRecordStore` usage, and
  every `LocalRunState` field reference from `src/core/**`.
- Make every core command generic over
  `<TAdapter extends AdapterFields<TAdapter>>` with
  `AdapterFields<TAdapter>` enforcing
  `keyof TAdapter & keyof CoreRunState = never` at compile time.
- Delete `RunStateCoreFields` entirely and migrate the small number
  of internal call sites to `CoreRunState` or `RunState`.
- Delete `src/core/status.ts`, `src/core/get-field.ts`, and
  `src/core/_helpers.ts`; move their logic inline into CLI wiring.
- Preserve the observable CLI surface (`run.json` layout, exit
  codes, stdout JSON shape, stderr text) bit-for-bit.
- Keep the existing drift-guard test green and extend it with the
  new static-grep and type-level assertions from the spec.

**Non-Goals:**

- No DB-backed or server-side runtime adapter is shipped.
- No change to the workflow state-machine graph, approved gate set,
  or workflow-machine.ts transitions.
- No change to `InteractionRecord` shapes or the
  `ApprovalRecord` / `ClarifyRecord` field contracts.
- No change to `RunArtifactStore` / `ChangeArtifactStore` /
  `InteractionRecordStore` interface surfaces.
- No incremental per-command rollout; this change is applied in a
  single, atomic PR because the type surface is highly coupled and
  staged migration would create a period where `RunStateCoreFields`,
  `CoreRunState`, and the old `RunState` signatures coexist in
  confusing forms.

## Decisions

### D1: All stores and workspace context leave `src/core/`

**Decision.** Every `*Deps` type in `src/core/types.ts` is
rewritten to drop `runs`, `changes`, `workspace`, and `records`
members. Core commands take only:

- the current state (for transitions) or precondition inputs (for
  start);
- the pure `WorkflowDefinition` value or derived helpers from
  `workflow-machine.ts`;
- the requested event / field / value / adapter seed;
- `nowIso: string` for deterministic history-entry timestamps.

**Rationale.** The issue's explicit requirement is that
`src/core/` must not know about local adapter state or local
filesystem I/O. Leaving `records` or `changes` injected into core
would re-introduce the same coupling the change is meant to
eliminate. `InteractionRecordStore` is not a local-FS concern in
itself (it has `LocalFs` and `InMemory` implementations), but the
store *interface* is still an I/O seam; keeping it in core
perpetuates the asymmetry the user flagged.

**Alternative considered.** Keep `InteractionRecordStore` in core
and only move `RunArtifactStore` / `ChangeArtifactStore` /
`WorkspaceContext` out. Rejected: it leaves `advanceRun` as the
one command with embedded I/O, which breaks the "every core
command is pure" contract and creates a subtle exception the
drift-guard grep would need to encode.

### D2: Core transitions return a `RecordMutation[]` alongside the new state

**Decision.** `advanceRun<TAdapter>` (and any future transition
that might touch records) returns a richer `Ok` payload:

```ts
type TransitionOk<TAdapter> = {
  readonly state: CoreRunState & TAdapter;
  readonly recordMutations: readonly RecordMutation[];
};

type RecordMutation =
  | { kind: "create"; record: InteractionRecord }
  | { kind: "update"; record: InteractionRecord }
  | { kind: "delete"; recordId: string };
```

Core computes the mutations purely from the current state,
prior-records list (passed in as a precondition), and the event.
The wiring layer applies each mutation via
`InteractionRecordStore`. For the five other commands (which do
not produce record mutations today), `recordMutations` is an
empty readonly array, preserving a uniform return envelope.

**Rationale.** Transitional record writes and the run-state write
must stay atomic with respect to each other (the current
`advance.ts` has compensation logic that deletes the orphaned
record on state-write failure). By returning mutations as data,
the wiring layer owns the ordering, commit, and rollback. That
matches the "wiring does I/O" principle and also makes unit
testing trivial — the test asserts the mutation list rather than
mocking a record store.

**Alternative considered.** Keep `InteractionRecordStore`
injected into core and continue doing writes + compensation
inside `advanceRun`. Rejected for the same reasons as D1.

### D3: Wiring performs reads → core transforms → wiring writes

**Decision.** Each CLI subcommand follows an explicit three-phase
pattern in `src/bin/specflow-run.ts`:

1. **Phase A — Gather.** Read current state via
   `await runs.read(runRef(runId))`, enumerate prior runs /
   records / artifacts as needed, compute preconditions (next run
   id, `nowIso`, proposal existence, existing-run collision),
   build the `LocalRunState` adapter seed from `WorkspaceContext`.
2. **Phase B — Invoke.** Call the pure core function with the
   gathered inputs. On `Result.err`, skip Phase C and map the
   error.
3. **Phase C — Apply.** Persist the returned state via
   `await runs.write(runRef(runId), JSON.stringify(state, null, 2))`.
   Apply record mutations via
   `records.write` / `records.delete` in deterministic order
   (state write first; if state write succeeds, record writes
   follow; if a record write fails after a state write succeeded,
   log a warning — the state has already advanced, and retry
   logic is out of scope for this change).

**Rationale.** A uniform wiring pattern is easier to audit than
command-specific flows. Atomic-replace semantics come from
`RunArtifactStore.write` (already guaranteed by the existing
`LocalFs` adapter and carried in the spec), so no new persistence
helper is needed. Record-write failure after state commit is
intentionally not auto-rolled-back because the underlying
in-memory / filesystem stores do not support a transactional
boundary; the current behavior (best-effort cleanup) is
preserved.

**Alternative considered.** Introduce a `run-persister.ts` helper
module that wraps `runs` + `records` behind a single
`commitTransition(state, mutations)` method. Rejected: the
proposal explicitly forbids adding a new persistence module, and
two direct `store.*` calls at each CLI site is no less
legible than a one-line helper call.

### D4: `AdapterFields<TAdapter>` lives in `src/types/contracts.ts`

**Decision.** Add to `src/types/contracts.ts`:

```ts
export type AdapterFields<TAdapter> = TAdapter extends Record<
  string,
  unknown
>
  ? keyof TAdapter & keyof CoreRunState extends never
    ? TAdapter
    : never
  : never;
```

Every core command generic is declared as
`<TAdapter extends AdapterFields<TAdapter>>`. `RunState<TAdapter>`
(previously a simple intersection) becomes
`CoreRunState & AdapterFields<TAdapter>`. The existing
`RunState = CoreRunState & LocalRunState` alias is kept because
`LocalRunState` satisfies `AdapterFields<LocalRunState>` by
construction (their keys are already disjoint).

**Rationale.** Hosting the constraint next to `CoreRunState` keeps
the coupling visible and eliminates any circular-import risk. The
`F-bound` generic pattern
(`<T extends AdapterFields<T>>`) is the standard TypeScript way to
express a self-referential constraint.

**Alternative considered.** Use the simpler
`TAdapter extends Record<string, unknown>` without disjointness
enforcement. Rejected: the challenge-review surfaced the
collision hazard as C4, and the cost of adding the conditional
type is one file, <10 lines, and a single new drift-guard
assertion.

### D5: `RunStateCoreFields` is deleted in this change

**Decision.** `RunStateCoreFields` is removed from
`src/types/contracts.ts` and from `src/core/types.ts`'s re-export
list. Every remaining reference is migrated:

- Pure core consumers that only care about workflow fields →
  `CoreRunState`.
- Local FS consumers that persist the full shape →
  `RunState` (the concrete alias, not the generic).
- The one `run-state` schema reference will be updated
  alongside.

`RunStateCoreFields` is not exposed through any published package
boundary — the `package.json` `exports` field publishes CLI
binaries, not the types. Therefore no deprecation window is
needed.

**Rationale.** Keeping the alias carries two contradictory
meanings (see Context). Deleting it is cheap and removes a
documented foot-gun.

**Alternative considered.** Mark as `@deprecated` for one release
cycle. Rejected by user direction — the repo is the only
consumer.

### D6: `status` and `get-field` are deleted, not retained as pure functions

**Decision.** `src/core/status.ts` and `src/core/get-field.ts`
are removed. Their behavior is inlined into
`src/bin/specflow-run.ts`:

```ts
// status
case "status": {
  const state = await runs.read(runRef(runId));
  writeStdout(state);  // already JSON
  process.exit(0);
}

// get-field
case "get-field": {
  const state = JSON.parse(await runs.read(runRef(runId))) as JsonMap;
  const value = state[field];
  if (value === undefined) {
    writeStderr(`Error: field '${field}' not found`);
    process.exit(1);
  }
  writeStdout(JSON.stringify(value, null, 2));
  process.exit(0);
}
```

**Rationale.** These commands have no workflow decision to make
— they are pure read-projections. A pure "core" function that
takes an already-loaded state and returns it unchanged adds no
value over inline wiring. Removing the module also shrinks the
core surface area and the number of sites the drift-guard test
has to scan.

**Alternative considered.** Retain them as
`(state) => Result<state>` functions for symmetry. Rejected: the
symmetry is cosmetic, and retention would require each call site
to do `await runs.read()` then invoke a function that does
nothing.

### D7: Drift guard extends the existing test, does not replace it

**Decision.** `src/tests/run-state-partition.test.ts` is extended
with:

- Static-grep assertions on `src/core/**/*.ts` (glob scoped to
  production files — the repo's test convention places everything
  under `src/tests/`) that fail the build if any banned string
  appears.
- Banned strings: `from "../lib/workspace-context`,
  `deps.runs.read`, `deps.runs.write`, `deps.runs.exists`,
  `deps.runs.list`, `deps.changes.read`, `deps.changes.exists`,
  `deps.changes.list`, `deps.records.write`,
  `deps.records.list`, `deps.records.read`,
  `deps.records.delete`.
- Banned object-property-key tokens: `repo_path:`,
  `worktree_path:`, `project_id:`, `branch_name:`,
  `last_summary_path:`, `repo_name:`.
- Type-level assertions: every `*Deps` type in
  `src/core/types.ts` excludes `workspace | runs | changes |
  records` members; `AdapterFields<{ run_id: string }>` resolves
  to `never`; `AdapterFields<LocalRunState>` resolves to
  `LocalRunState`.

**Rationale.** One central test file is easier to maintain than
multiple scattered checks. Grep is a cheap, precise way to prove
a negative ("this symbol does not appear"), and type-level
asserts prove the contract at the type layer.

**Alternative considered.** Enforce via an ESLint rule. Rejected:
the rule would have to be custom (no off-the-shelf rule matches),
and the project's existing enforcement pattern (drift-guard
tests) is already in place and familiar.

## Risks / Trade-offs

- **Risk:** `advanceRun` refactor fans out to many call sites
  because the signature changes from
  `(input, deps) => Promise<Result<T>>` to
  `(state, input, prior, nowIso) => Result<TransitionOk<T>>`.
  → *Mitigation:* Do the refactor in a single atomic commit per
  command; keep the stable public contract at the CLI layer
  unchanged so external tests assert identical behavior; rely on
  the type system to surface every call site at compile time.

- **Risk:** Record-mutation ordering differences between the old
  (in-core compensation) and new (wiring-layer best-effort)
  paths could drift observable behavior.
  → *Mitigation:* Preserve the existing sequence (state write
  first, then record writes) and the existing best-effort
  cleanup semantic. Add a wiring-layer unit test that mimics the
  prior compensation test.

- **Risk:** The `AdapterFields<TAdapter>` conditional type is
  subtle; a beginner touching the core code may find the error
  message cryptic (`type '…' is not assignable to type 'never'`).
  → *Mitigation:* Add a doc comment next to the definition with
  a "what to do if you see this error" note, and add a dedicated
  test case that exercises the collision to lock in the error
  messaging.

- **Trade-off:** Core now returns a slightly richer envelope
  (`{ state, recordMutations }`) than before for transitions,
  instead of just `state`. The CLI layer has to handle the empty
  `recordMutations` case for most commands.
  → *Accepted*: the uniformity simplifies wiring and tests; the
  empty-array case is a one-liner.

- **Trade-off:** `RunStateCoreFields` deletion is a hard cut.
  If any downstream project has silently imported it (despite
  being undocumented), that project will fail to build.
  → *Accepted* per user direction; this is an internal type in
  an un-exported contracts module.

- **Trade-off:** `status` and `get-field` become untestable via
  the core-runtime test harness because they no longer have a
  core module. They are instead covered by CLI smoke tests.
  → *Accepted*: there is no workflow logic to unit-test; the
  CLI test already asserts the correct stdout.

## Migration Plan

1. **Types first.** Add `AdapterFields<TAdapter>` to
   `src/types/contracts.ts`. Update `RunState<TAdapter>` to
   reference it. Delete `RunStateCoreFields`. Update
   `src/core/types.ts` re-exports.
2. **Core refactor.** Rewrite each core command
   (`start.ts`, `advance.ts`, `suspend.ts`, `resume.ts`,
   `update-field.ts`) to accept state + preconditions and return
   `Result<TransitionOk<T>>`. Delete `status.ts`, `get-field.ts`,
   `_helpers.ts`.
3. **Wiring rewrite.** Update `src/bin/specflow-run.ts` and
   `src/bin/specflow-prepare-change.ts` to gather preconditions,
   invoke pure core, persist results, apply record mutations,
   and map errors.
4. **Tests migrate.** Rewrite
   `src/tests/core/*.test.ts` to call the pure functions with
   explicit state and preconditions. Reduce CLI tests in
   `src/tests/cli/*.test.ts` to smoke-level (argv → core call →
   stdout/stderr/exit). Extend
   `src/tests/run-state-partition.test.ts` with the new assertions
   (D7).
5. **Verify.** Run `bun run format`, `bun run typecheck`,
   `bun test`, and `openspec validate` to confirm build, types,
   tests, and spec all pass.
6. **Hand off.** Enter `/specflow.review_design` → on approval,
   proceed to `/specflow.apply`.

Rollback is a single git revert of the PR; no data migrations,
schema changes, or external deployments are involved.

## Open Questions

- None. All six challenge-review items (C1–C6) were resolved
  during reclarify and are captured in the spec deltas and this
  design.

## Concerns

User-facing concerns and the problem each resolves:

- **C-core-purity.** Core runtime does not know about local
  filesystems, workspaces, stores, or record persistence.
  *Resolves:* the "core が local mode の事情を知りすぎる"
  coupling called out in the issue.
- **C-type-contract.** The type system expresses which fields
  belong to workflow core vs. local adapter, and rejects
  adapter shapes that collide with core keys.
  *Resolves:* the "どこまでが workflow state か" type-level
  visibility gap.
- **C-wiring-ownership.** The CLI wiring layer is the sole
  owner of I/O (reads, writes, artifact existence, record
  persistence, atomic-replace).
  *Resolves:* the persistence-contract leakage into core.
- **C-observable-parity.** External contract (run.json layout,
  exit codes, stdout JSON, stderr text) is unchanged.
  *Resolves:* preserves downstream consumers and CI.
- **C-drift-protection.** The compile-time drift guard catches
  regressions — if a future contributor re-imports
  `WorkspaceContext` into core, the build fails.
  *Resolves:* long-term invariant enforcement.

## State / Lifecycle

- **Canonical state.** `RunState = CoreRunState & LocalRunState`
  persisted on disk at
  `.specflow/runs/<run_id>/run.json` via `RunArtifactStore`.
- **Derived state.** `allowed_events` is derived from
  `(status, current_phase)` via
  `workflow-machine.deriveAllowedEvents`; recomputed every
  transition, never persisted as a source of truth.
- **Lifecycle boundaries.**
  - *Create*: wiring builds `LocalRunState` seed +
    preconditions → calls `startChangeRun` / `startSyntheticRun`
    → wiring writes `run.json`.
  - *Transition*: wiring reads `run.json` + records → calls
    `advanceRun` / `suspendRun` / `resumeRun` / `updateField` →
    wiring writes new state + applies record mutations.
  - *Read*: wiring reads `run.json` directly (no core
    participation) for `status` and `get-field`.
  - *Terminal*: run reaches `approved` / `decomposed` /
    `rejected`; `status` becomes `terminal`; subsequent events
    are rejected by core (`invalid_event`).
- **Persistence-sensitive state.** `run.json` content must match
  the current on-disk shape byte-for-byte (modulo field order);
  interaction records under
  `.specflow/runs/<run_id>/records/*.json` must continue to be
  written with the same filenames and shapes.

## Contracts / Interfaces

- **Core → Wiring.** Every core command returns
  `Result<TransitionOk<CoreRunState & TAdapter>, CoreRuntimeError>`.
  `TransitionOk` has `{ state, recordMutations }`. Pure, no I/O.
- **Wiring → Core.** Wiring supplies: current state (for
  transitions); preconditions (`proposalExists`, `priorRuns`,
  `nextRunId`, `nowIso`, `existingRunExists?`, `priorRecords`);
  event / field / value / adapter seed.
- **Wiring → Stores.** Wiring calls `RunArtifactStore.read /
  write / list / exists`, `ChangeArtifactStore.read / exists`,
  `InteractionRecordStore.write / list / delete`.
- **Types.** `src/types/contracts.ts` exports `CoreRunState`,
  `LocalRunState`, `RunState`, `RunState<TAdapter>`,
  `AdapterFields<TAdapter>`. It no longer exports
  `RunStateCoreFields`.
- **Record mutation envelope.** `RecordMutation` is exported
  from `src/core/types.ts` so the wiring layer and tests can
  type it.

## Persistence / Ownership

- **Run state** → owned by `RunArtifactStore` implementation;
  wiring invokes write. Atomic-replace is the adapter's
  contract.
- **Change artifacts** (proposal.md, design.md, tasks.md,
  spec deltas) → owned by `ChangeArtifactStore`; read-only for
  core via the wiring precondition inputs.
- **Interaction records** → owned by `InteractionRecordStore`;
  wiring applies mutations returned from core.
- **Artifact ownership under this change:** proposal.md,
  design.md, tasks.md, specs/**/*.md for this change id are
  authored by the author (Claude in this session) and reviewed
  via the design-review gate.
- **`run.json` shape ownership** stays with the local
  reference implementation; no schema migration.

## Integration Points

- **WorkspaceContext** (`src/lib/workspace-context.ts`) — used
  by wiring to build `LocalRunState`. Interface unchanged.
- **RunArtifactStore / ChangeArtifactStore** — used by wiring;
  interface unchanged.
- **InteractionRecordStore** — used by wiring; interface
  unchanged. Previously also used by core (`advance.ts`); no
  longer.
- **workflow-machine.ts** — pure helpers (`deriveAllowedEvents`,
  `isTerminalPhase`) remain the sole allowed import from core,
  since they are pure functions over `(status, phase)`.
- **OpenSpec CLI** — spec / change artifacts flow unchanged.
- **No external services, no network calls, no database, no
  retry boundary** — this change is self-contained within the
  local CLI process.

## Ordering / Dependency Notes

Foundational (must land first):

1. Add `AdapterFields<TAdapter>` to `src/types/contracts.ts`
   and rewrite `RunState<TAdapter>` to use it.
2. Delete `RunStateCoreFields` and update all internal references
   (handful of files in `src/core/`, `src/lib/run-store-ops.ts`).

Can proceed in parallel once types land:

3. Refactor `advance.ts` (largest — record mutations).
4. Refactor `start.ts` (largest — precondition inputs).
5. Refactor `suspend.ts`, `resume.ts`, `update-field.ts`.
6. Delete `status.ts`, `get-field.ts`, `_helpers.ts`.

Must land after all core refactors:

7. Rewrite wiring in `src/bin/specflow-run.ts` and
   `src/bin/specflow-prepare-change.ts`.
8. Migrate tests in `src/tests/`.
9. Extend drift-guard test with new assertions.

Ordering constraint: core modules must not compile during an
intermediate state that imports `RunStateCoreFields`, so
step 2 must be co-committed with the first use of
`CoreRunState` / `RunState` replacements. A single squashed PR
is the simplest guarantee.

## Completion Conditions

- `bun run typecheck` — green, including the expanded drift-guard
  type assertions.
- `bun test` — green; every previously-passing behavioral test
  still passes; new record-mutation test covers the compensation
  semantic.
- `openspec validate split-runstate-into-core-workflow-state-and-local-adapter-state --type change`
  — green.
- `grep -R "RunStateCoreFields" src/` — returns no results.
- `grep -R "workspace-context\|deps.runs\.\|deps.changes\.\|deps.records\." src/core/` — returns no
  results.
- CLI regression suite — `specflow-run status <id>`,
  `specflow-run start`, `specflow-run advance`,
  `specflow-run suspend`, `specflow-run resume`,
  `specflow-run update-field`, `specflow-run get-field` all
  produce identical stdout JSON / exit codes / stderr text to
  the pre-refactor baseline.
- Reviewable units:
  - Types commit (D4, D5) — reviewable independently.
  - Per-command core refactor — each command's new pure signature
    and its updated core-runtime test can be reviewed together.
  - Wiring commit — reviewed against the pre-refactor `run.json`
    parity baseline.
  - Drift-guard test commit — reviewed against D7.
