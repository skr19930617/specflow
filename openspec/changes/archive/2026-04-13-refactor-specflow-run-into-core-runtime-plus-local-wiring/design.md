## Context

### Current state

`src/bin/specflow-run.ts` (560 LOC) is today's entrypoint for the seven
workflow commands (`start`, `advance`, `suspend`, `resume`, `status`,
`update-field`, `get-field`). It mixes four concerns:

1. **CLI parsing** — `process.argv.slice(2)`, flag/value iteration, subcommand
   `switch`, "Usage:" strings.
2. **Filesystem discovery** — `stateMachinePath(root)` walks project-local →
   `dist/package` → `~/.config/specflow/` to locate `state-machine.json`,
   then `loadWorkflow` parses it via `readFileSync` + `JSON.parse`.
3. **Git / workspace wiring** — `createLocalWorkspaceContext()` constructs a
   `WorkspaceContext` from git; stores are constructed via
   `createLocalFsRunArtifactStore(root)` /
   `createLocalFsChangeArtifactStore(root)`.
4. **Core workflow logic** — the seven `cmdX(...)` functions that enforce
   run-state invariants, apply transitions, and manipulate the `RunState`
   object.

All error paths use `fail(message)` (`src/lib/process.ts:66`) which writes
to `stderr` and calls `process.exit(1)`. All success paths use
`printSchemaJson("run-state", state)` which writes to `stdout` directly.
Both side effects are today baked into the same functions that perform the
workflow logic.

Every filesystem interaction inside the core cmd functions is already
mediated by `RunArtifactStore` / `ChangeArtifactStore`; every git
interaction by `WorkspaceContext`. The only direct I/O that sits outside
those interfaces is (a) `state-machine.json` loading and
(b) `process.env.HOME` access during discovery. Both are wiring concerns.

The current test layer (`src/tests/specflow-run.test.ts`, 807 LOC)
exclusively drives the CLI subprocess via `runNodeCli(...)`, parses
stdout/stderr, and asserts against the shell-style contract. There is no
direct test access to the underlying logic today.

### Constraints

- `workflow-run-state` spec is already strict about using the injected
  `RunArtifactStore` / `ChangeArtifactStore` / `WorkspaceContext`
  interfaces. The refactor strengthens that contract — it does not relax it.
- Observable CLI surface (argv, stdout JSON, stderr wording, exit codes)
  is frozen. Any deviation breaks `openspec/specs/utility-cli-suite` and
  downstream automation.
- `openspec/specs/repo-responsibility/spec.md` already declares workflow
  core and the local reference implementation as separable — this
  refactor makes the code shape match the already-specified boundary.

## Goals / Non-Goals

**Goals:**
- Extract a `src/core/` module that implements the seven workflow commands
  as pure functions of `(RunArtifactStore, ChangeArtifactStore | null,
  WorkspaceContext | null, WorkflowDefinition | null, input)`.
- Replace every `fail(...)` / `printSchemaJson(...)` in core code with a
  `Result<Ok, CoreRuntimeError>` return.
- Shrink `src/bin/specflow-run.ts` to CLI parsing + state-machine.json
  discovery + store construction + Result-to-I/O mapping.
- Migrate the 807-LOC CLI test suite behavioral assertions to core-level
  tests using in-memory stores + a fake `WorkspaceContext`; leave a small
  CLI smoke test suite for argv parsing and exit mapping.
- Preserve byte-identical observable CLI behavior.

**Non-Goals:**
- No new user-visible capability.
- No introduction of a logger / event sink interface. (Not needed: the
  current CLI emits output only terminally per command.)
- No refactor of `specflow-prepare-change` or other utility CLIs. They
  already depend on `RunArtifactStore` via `run-store-ops.ts`; this change
  does not touch them.
- No new package boundary, workspace, or separate build artifact for
  `src/core/`. It stays a subdirectory of the same TypeScript project.
- No change to `state-machine.json`, run-state schema, or the
  `workflow-machine.ts` module.
- No introduction of an alternative runtime implementation. This change
  only makes the core runtime reachable; building an alternative runtime
  is future work.

## Decisions

### Decision 1: Module layout — `src/core/` with per-command files

**Choice:** New directory `src/core/` with the following files:

```
src/core/
  run-core.ts           # barrel re-exporting the 7 command functions + types
  types.ts              # Result<T, E>, CoreRuntimeError, input/output types
  start.ts              # startChangeRun / startSyntheticRun
  advance.ts            # advanceRun
  suspend.ts            # suspendRun
  resume.ts             # resumeRun
  status.ts             # readRunStatus
  update-field.ts       # updateRunField
  get-field.ts          # getRunField
```

**Alternatives considered:**
- *Single `src/lib/run-core.ts`*: rejected — given the 560 LOC starting
  point and seven distinct commands, a single file would grow past the
  400-LOC soft cap and make each command harder to review in isolation.
- *`src/lib/run/` subdirectory*: rejected — a dedicated `src/core/`
  directory makes the repo-responsibility boundary visible at the
  filesystem level, which is the exact outcome the proposal aims for.

**Rationale:** Per-command files stay well under 200 LOC each and make it
trivial to pair a single `<command>.ts` with its `<command>.test.ts`.
Barrel `run-core.ts` keeps the CLI wiring layer's import footprint flat.

### Decision 2: Collaborators are injected per command, not per session

**Choice:** Each core function takes only the collaborators it actually
needs, not a "context" bag.

Signatures (pseudocode):

```ts
startChangeRun(
  input: StartChangeInput,
  deps: {
    runs: RunArtifactStore;
    changes: ChangeArtifactStore;
    workspace: WorkspaceContext;
  },
): Result<RunState, CoreRuntimeError>;

startSyntheticRun(
  input: StartSyntheticInput,
  deps: { runs: RunArtifactStore; workspace: WorkspaceContext },
): Result<RunState, CoreRuntimeError>;

advanceRun(
  input: AdvanceInput,           // { runId, event }
  deps: { runs: RunArtifactStore; workflow: WorkflowDefinition },
): Result<RunState, CoreRuntimeError>;

suspendRun(input, { runs }): Result<RunState, CoreRuntimeError>;
resumeRun(input, { runs, workflow }): Result<RunState, CoreRuntimeError>;
readRunStatus(input, { runs }): Result<RunState, CoreRuntimeError>;
updateRunField(input, { runs }): Result<RunState, CoreRuntimeError>;
getRunField(input, { runs }): Result<JsonValue, CoreRuntimeError>;
```

**Alternatives considered:**
- *Single `CoreRuntimeContext` bag with all four collaborators*: rejected —
  it obscures which command needs what, and it forces the wiring layer to
  construct `ChangeArtifactStore` and load `WorkflowDefinition` even for
  commands that never touch them (e.g. `status`, `get-field`). That would
  regress startup cost and make test setup heavier than needed.
- *Class with constructor-injected deps*: rejected — adds state that does
  not exist today (each command is a one-shot), and complicates tree-shake
  of unused commands in future consumers.

**Rationale:** Keep signatures honest. A reader of `resumeRun` should see
at a glance that it depends on the workflow definition and the run store,
and nothing else.

### Decision 3: `Result<T, E>` type shape

**Choice:**

```ts
export type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface CoreRuntimeError {
  readonly kind: CoreRuntimeErrorKind;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type CoreRuntimeErrorKind =
  | "invalid_arguments"          // bad flags / missing positional / bad enum value
  | "run_not_found"              // referenced run_id has no persisted state
  | "run_schema_mismatch"        // persisted state is missing required fields
  | "invalid_event"              // event not valid for current phase
  | "run_suspended"              // transition attempted while suspended (non-resume)
  | "run_not_suspended"          // resume attempted while not suspended
  | "run_already_exists"         // synthetic run_id collision
  | "run_active_exists"          // non-terminal run exists for change (no --retry)
  | "run_suspended_exists"       // suspended run exists for change (no --retry)
  | "prior_runs_require_retry"   // prior terminal run exists, --retry not set
  | "retry_without_prior"        // --retry with no prior runs
  | "retry_on_rejected"          // --retry on rejected change
  | "change_proposal_missing"    // expected openspec/changes/<id>/proposal.md
  | "invalid_run_id"             // run_id contains '/' or '..'
  | "terminal_suspend"           // suspend on terminal run
  | "already_suspended"          // suspend on suspended run
  | "field_not_found"            // get-field with unknown field
  | "retry_synthetic";           // --retry with --run-kind synthetic
```

`message` holds the exact human-readable string the current CLI emits
(e.g. `"Error: Run is suspended — resume first. Only 'resume' is allowed."`).
The wiring layer prints `message` to stderr unchanged, so byte-level CLI
output is preserved. `kind` is the programmatic handle for alternative
runtimes and for tests.

**Alternatives considered:**
- *Throw typed error classes*: rejected — the user explicitly chose
  `Result` during clarify. Throwing also couples the core to Node's
  stack-trace machinery, hurts tree-shaking, and makes it harder for
  alternative runtimes to serialize errors.
- *`{ ok: false, message: string }` only (no `kind`)*: rejected — leaves
  no programmatic hook for callers (e.g. server adapter) to localize or
  re-render error messages.

**Rationale:** Discriminated unions let the CLI map `kind → stderr format`
with an exhaustive `switch`. Since today's mapping is trivial (`"Error: "
+ message` for most, exit code always 1), the CLI-side switch is nearly a
one-liner, but the `kind` surface pays off for future consumers.

### Decision 4: Discovery-only concerns stay in wiring

**Choice:** The wiring layer (`src/bin/specflow-run.ts`) retains:

- `stateMachinePath(root)` — three-tier lookup.
- `loadWorkflow(path)` — `readFileSync` + `JSON.parse`.
- `createLocalWorkspaceContext()` — git probe + `not_in_git_repo` mapping.
- `createLocalFsRunArtifactStore(root)` / `createLocalFsChangeArtifactStore(root)`.
- Argv parsing including all `"Usage: ..."` strings.
- The `Result → (stdout | stderr + exit)` mapper.

Core never touches `process.*`, `readFileSync`, `readdirSync`, git, or
environment variables.

**Rationale:** Discovery is specifically what the local reference
implementation owns per `repo-responsibility`. A hypothetical server
adapter would provide its own `WorkflowDefinition` loader (DB? bundled
asset?) and its own error mapping (HTTP status codes), but would reuse
the core runtime unchanged.

### Decision 5: In-memory store + fake `WorkspaceContext` test doubles

**Choice:** Add two test helpers under `src/tests/`:

```
src/tests/helpers/
  in-memory-run-store.ts       # implements RunArtifactStore in a Map
  in-memory-change-store.ts    # implements ChangeArtifactStore in a Map
  fake-workspace-context.ts    # returns canned projectRoot/branch/etc.
```

Behavioral assertions that today exist in `specflow-run.test.ts` migrate
to new per-command test files under `src/tests/core/`:

```
src/tests/core/
  start.test.ts
  advance.test.ts
  suspend.test.ts
  resume.test.ts
  status.test.ts
  update-field.test.ts
  get-field.test.ts
```

`specflow-run.test.ts` shrinks to a smoke suite (est. <200 LOC) that:
- runs `specflow-run start <change_id>` end-to-end once per command to
  prove argv routing works,
- asserts one representative success (exit 0, stdout JSON) and one
  representative failure (exit 1, stderr text) per command.

**Alternatives considered:**
- *Keep using `runNodeCli` + tmpdir for core tests*: rejected — forces
  every core test to round-trip through the binary, defeating the point
  of the refactor (the runtime should be callable without the CLI).
- *No smoke test, just unit-test the argv parser directly*: rejected —
  the end-to-end smoke suite is cheap insurance against regressions in
  the wiring glue (stdout/stderr mapping, exit codes, state-machine.json
  discovery).

**Rationale:** In-memory stores + fake workspace context let tests run at
unit-test speed (no tmpdir, no git init, no subprocess) while still
exercising the full injection contract. The smoke suite covers the
integration seam the unit tests deliberately skip.

### Decision 6: Migration order — add, wire, delete

**Choice:** Land the change in a single PR with this internal ordering so
`main` is never broken:

1. Add `src/core/types.ts` (Result + error kinds).
2. Add the seven command modules in `src/core/` and their
   `src/tests/core/*.test.ts` with in-memory stores. At this point the
   core is callable but the CLI still uses the old code paths — both
   coexist.
3. Add in-memory store / fake `WorkspaceContext` test helpers.
4. Switch `src/bin/specflow-run.ts` to call the new core functions,
   implementing the `Result → stdio/exit` mapper. Delete the now-dead
   `cmdStart/cmdAdvance/...` bodies but keep the main switch.
5. Trim `src/tests/specflow-run.test.ts` to the smoke suite.
6. Run the full test suite, lint, typecheck, build.

Because the CLI output contract is preserved byte-for-byte, existing tests
that still run end-to-end remain valid during step 4. Steps 2 and 4 can
each be a distinct commit on the branch for review granularity.

## Risks / Trade-offs

- **Risk:** Subtle stderr message drift (e.g. trailing space, em-dash vs.
  hyphen) during migration → the smoke suite relies on string equality.
  **Mitigation:** Snapshot every current `Error: ...` string before
  editing; the core's `message` field holds that exact string.
  A dedicated "stderr wording parity" test in the smoke suite diffs the
  old strings against a frozen fixture.

- **Risk:** Commands that today load `state-machine.json` indirectly via
  `loadWorkflow(stateMachinePath(root))` (e.g. `advance`, `resume`) now
  force the CLI to always load it — but the CLI already does this.
  **Mitigation:** No behavioral change; the load just moves from
  inside `cmdAdvance` to the `main()` switch arm for `advance` and
  `resume`. `status`, `update-field`, `get-field`, `suspend` do **not**
  need the workflow definition and will not load it.

- **Trade-off:** Accepting seven separate command files (vs. one `run-core.ts`)
  is a structural bet that pays off for maintainability but adds a small
  number of tiny files. **Mitigation:** Barrel-export from
  `src/core/run-core.ts` keeps the public surface flat for callers.

- **Risk:** `Result` discipline leaks back out — a helper called from
  several commands could accidentally `throw` or call `process.exit`.
  **Mitigation:** All helpers called from core live inside `src/core/` or
  under `src/lib/` modules that already conform to the injection
  contract (`run-store-ops.ts`, `workflow-machine.ts`, `artifact-store.ts`,
  `workspace-context.ts`). Any helper that still throws gets wrapped at
  the core boundary into an appropriate `CoreRuntimeError`. The
  `src/core/` directory bans `process.*` imports via ESLint pattern
  (added in tasks).

- **Risk:** Test migration misses a previously-tested branch.
  **Mitigation:** Diff coverage of `src/bin/specflow-run.ts` before vs.
  after — every line covered before must still be covered, either via
  the core test or via the smoke test. Tracked as an explicit checklist
  item in `tasks.md`.

- **Trade-off:** Choosing `{ ok, value | error }` over throwing trades
  one-line happy paths (`const r = cmdX(...)`) for two-line pattern
  matches (`if (!r.ok) return ...; use r.value`). Accepted because the
  stated proposal benefit (core callable without CLI / without exit
  side-effects) requires it.

## Migration Plan

This is an internal refactor with no deploy component and no schema
change. The full change ships in one PR along the ordering in Decision 6.

**Rollback:** `git revert` of the merge commit. Because no external
contract changes (CLI output, run-state schema, state-machine.json), there
is nothing to clean up after a revert.

## Open Questions

None at design time. All ambiguities from proposal challenge (C1–C6) were
resolved during reclarify; any remaining surface-level choices (exact
identifier casing, barrel vs. deep imports) are judgment calls for the
implementer and do not affect the specs.
