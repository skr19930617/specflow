## Why

A prior change (`phase-1-core-runstate-core-adapter-field-split-phase-contract`)
partitioned `RunState` into `CoreRunState` and `LocalRunState`, added a
compile-time drift guard, and rewrote `advance` / `suspend` / `resume` to
be generic over `<T extends CoreRunState>`. However `src/core/` is still
coupled to the local adapter in two remaining ways:

1. **Start path embeds local knowledge.** `startChangeRun` and
   `startSyntheticRun` in `src/core/start.ts` import `WorkspaceContext`,
   call `projectRoot()` / `worktreePath()` / `branchName()` /
   `projectDisplayName()` / `projectIdentity()`, and inline the full
   `RunState = CoreRunState & LocalRunState` literal. An external runtime
   cannot launch a run via the same core function without supplying a
   fake `WorkspaceContext`.
2. **Every core command performs I/O.** `startRun`, `advanceRun`,
   `suspendRun`, `resumeRun`, and `updateField` all call
   `loadRunState` / `writeRunState` internally. The local FS is
   structurally part of the core contract — exactly what the issue
   flagged as "core runtime が local mode の事情を知りすぎる".

Additionally, `RunStateCoreFields` is currently a backward-compat alias
(`= RunState`) that contradicts its prior definition in the
`runstate-adapter-extension` spec (all fields including `repo_path`).
This dual meaning is a maintenance hazard.

This change delivers the contract implied by the issue: **`src/core/`
becomes a set of pure transition functions parameterized by an adapter
slice, with all read/write I/O lifted into the wiring layer.**

## What Changes

### Core becomes a pure transition layer

- **Remove all store and workspace I/O from `src/core/`.** `startChangeRun`,
  `startSyntheticRun`, `advanceRun`, `suspendRun`, `resumeRun`, and
  `updateField` SHALL stop calling `loadRunState`, `writeRunState`,
  `deps.runs.read/write`, `deps.changes.*`, and
  `deps.workspace.*`. They SHALL accept current state (or the inputs
  needed to decide the transition) as arguments and return
  `Result<newState, CoreRuntimeError>` without side effects.
- **Every command is adapter-parameterized the same way.** `startChangeRun`,
  `startSyntheticRun`, `advanceRun`, `suspendRun`, `resumeRun`, and
  `updateField` SHALL be `<TAdapter extends AdapterFields>` generics,
  where `AdapterFields` is a new type constraint defined as
  `Record<string, unknown>` **plus** the conditional-type assertion
  `keyof TAdapter & keyof CoreRunState extends never ? TAdapter : never`,
  so a caller who passes an adapter shape that collides with a
  `CoreRunState` key fails to compile. The returned state is typed
  `CoreRunState & TAdapter` in every case.
- **Start precondition inputs** (after an audit of the current
  `src/core/start.ts`) SHALL be: `proposalExists: boolean`,
  `priorRuns: readonly CoreRunState[]`, `nextRunId: string`,
  `nowIso: string`, and `existingRunExists?: boolean` (synthetic-run
  collision check). No other store/workspace lookups exist in the
  current start path.
- **Transition commands** (`advanceRun`, `suspendRun`, `resumeRun`,
  `updateField`) SHALL accept `state: CoreRunState & TAdapter` plus
  their command-specific inputs (e.g. `event`, `field`, `value`) and
  `nowIso: string`, and SHALL return
  `Result<CoreRunState & TAdapter, CoreRuntimeError>`.
- **Core never imports `WorkspaceContext`.** All references under
  `src/core/**` to `WorkspaceContext`, `projectRoot`, `worktreePath`,
  `branchName`, `projectDisplayName`, or `projectIdentity` SHALL be
  removed.

### Wiring layer owns all I/O

- **`src/bin/specflow-run.ts`** gathers store/workspace inputs and
  invokes the core function:
  1. Reads current run state via `await RunArtifactStore.read()` when
     the command needs it.
  2. Builds the `LocalRunState` slice from `WorkspaceContext` at
     start time.
  3. Computes `nextRunId` via `generateRunId(store, changeId)`.
  4. Verifies proposal existence via `ChangeArtifactStore.exists()`.
  5. For `startSyntheticRun`, checks `existingRunExists` via
     `await RunArtifactStore.exists(runRef(runId))`.
  6. Passes results into the pure core function.
  7. On `Result.ok`, persists the returned state via
     `await RunArtifactStore.write()` — the existing atomic-replace
     contract is preserved without any new helper layer.
  8. Maps `Result.ok`/`Result.err` to stdout / stderr / exit code as
     today.
- **`src/bin/specflow-prepare-change.ts`** performs the same wiring
  pattern for run enumeration and start.
- **`status` and `get-field` move entirely into the wiring layer.**
  Because they contain no state-transition logic — only reads — they
  are implemented directly in `src/bin/specflow-run.ts` as
  `{ runId } → await store.read(runRef(runId))` plus JSON projection.
  No core module remains for them; the old `src/core/status.ts` and
  `src/core/get-field.ts` are deleted.
- **No new persistence module and no new helper file.** Each CLI
  call site invokes `RunArtifactStore` directly. The previous
  `src/core/_helpers.ts` `loadRunState` / `writeRunState` wrappers
  are deleted; their callers now call
  `await store.read(runRef(runId))` and
  `await store.write(runRef(runId), JSON.stringify(state, null, 2))`
  inline.

### Type contract clean-up

- **Delete `RunStateCoreFields`.** The alias is referenced only inside
  this repository; internal consumers SHALL be migrated to
  `CoreRunState` (when they semantically handle only core fields) or
  `RunState` (when they handle the combined local-FS shape).
- **Keep `CoreRunState`, `LocalRunState`, and `RunState` exports
  unchanged** otherwise. The existing drift guard keeps them disjoint
  and exhaustive.

### Drift-guard extensions

- **Static-grep assertion** targeting `src/core/**/*.ts` (the existing
  repo convention — recorded in the spec update — places every test
  file under `src/tests/`, so the grep glob is safe without an
  explicit `*.test.ts` exclude). The test in
  `src/tests/run-state-partition.test.ts` SHALL fail the build if any
  production file under `src/core/**/*.ts` contains:
  - an import of `../lib/workspace-context`
  - an identifier from the `LocalRunState` key set used as an object
    property key (e.g. `repo_path:`, `worktree_path:`,
    `project_id:`, `branch_name:`, `worktree_path:`,
    `last_summary_path:`, `repo_name:`)
  - a call to `deps.runs.read`, `deps.runs.write`, `deps.runs.exists`,
    `deps.runs.list`, `deps.changes.exists`, or `deps.changes.read`
- **Type-level assertion.** The same test SHALL include TypeScript
  `Equal`/`Extends` assertions confirming:
  - Every `*Deps` type in `src/core/types.ts` does not contain
    `workspace`, `runs`, or `changes` members.
  - `AdapterFields<TAdapter>` enforces
    `keyof TAdapter & keyof CoreRunState extends never`.
  - `CoreRunState` and `LocalRunState` remain disjoint and
    exhaustive — the pre-existing assertion carried forward
    unchanged.

### Spec updates

- **`workflow-run-state`**: promote start into the "signatures
  depend only on `CoreRunState`" bucket; add scenarios covering the
  adapter-seed parameter; add scenarios stating core commands do not
  call `RunArtifactStore` or `ChangeArtifactStore`; restate that
  atomic write is the adapter's contract and the wiring invokes it.
- **`runstate-adapter-extension`**: remove the
  `RunStateCoreFields contains all run-state fields` requirement and
  replace with language that distinguishes `CoreRunState` from
  `LocalRunState` and documents that the old `RunStateCoreFields`
  alias has been removed.

### Observable surface

- **`run.json` layout unchanged.** Every field present before this
  change is present after.
- **CLI exit codes, stdout JSON, stderr text unchanged.**
- **Only the internal seams between CLI and core move.**

## Capabilities

### New Capabilities
- None. This change strengthens existing capabilities rather than
  introducing a new one.

### Modified Capabilities
- `workflow-run-state`: tightens the core-runtime contract so that
  every core command (start, advance, suspend, resume, update-field)
  is pure; adds scenarios asserting that core performs no run-artifact
  or change-artifact I/O; adds adapter-seed scenarios for start;
  rewrites the existing "Core runtime uses injected stores and
  workspace context" requirement to apply to wiring, not core.
- `runstate-adapter-extension`: removes the
  `RunStateCoreFields is independently importable` /
  `RunStateCoreFields contains all RunState fields` requirements and
  replaces them with language aligned to `CoreRunState` /
  `LocalRunState`, recording that `RunStateCoreFields` has been
  deleted from `src/types/contracts.ts`.

## Impact

- Affected source:
  - `src/core/start.ts` — removes `WorkspaceContext` / store imports;
    becomes a pure pair of `<TAdapter>` generics over precondition
    inputs.
  - `src/core/advance.ts`, `src/core/suspend.ts`, `src/core/resume.ts`,
    `src/core/update-field.ts` — stop reading/writing via the store;
    accept `state: CoreRunState & TAdapter` and return
    `Result<CoreRunState & TAdapter, CoreRuntimeError>`.
  - `src/core/status.ts`, `src/core/get-field.ts` — **deleted.**
    Their logic moves inline into `src/bin/specflow-run.ts`.
  - `src/core/_helpers.ts` — **deleted.** `loadRunState` /
    `writeRunState` wrappers are replaced by direct
    `RunArtifactStore` calls at each CLI site.
  - `src/core/types.ts` — updates every `*Deps` type to remove
    `runs`, `changes`, and `workspace` members; introduces
    `AdapterFields<TAdapter>` and applies it to all command
    generics; refreshes `StartChangeInput` / `StartSyntheticInput`
    to carry precondition inputs.
  - `src/bin/specflow-run.ts`, `src/bin/specflow-prepare-change.ts` —
    perform reads, compute preconditions, build adapter seed, invoke
    the pure core function, and persist the returned state via
    `await RunArtifactStore.write()`.
  - `src/types/contracts.ts` — **deletes** `RunStateCoreFields`;
    migrates internal references to `CoreRunState` or `RunState`.
  - `src/tests/run-state-partition.test.ts` — extended with the
    static-grep glob on `src/core/**/*.ts`, the expanded
    `LocalRunState` key list, the store-call-blocker, the `*Deps`
    type-level assertion, and the `AdapterFields` collision
    assertion.
  - `src/tests/` core-runtime suites — updated to drive pure core
    functions with explicit current state and adapter seed; CLI
    smoke tests updated to verify the new wiring reads/writes.
- Affected specs:
  - `openspec/specs/workflow-run-state/spec.md`
  - `openspec/specs/runstate-adapter-extension/spec.md`
- Dependencies: none. No new packages; no state-machine graph
  changes; no artifact schema changes.
- Observable CLI surface: unchanged.
