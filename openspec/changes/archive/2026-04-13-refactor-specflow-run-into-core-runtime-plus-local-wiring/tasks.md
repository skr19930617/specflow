## 1. Scaffold core runtime types and module layout

- [x] 1.1 Create `src/core/` directory.
- [x] 1.2 Add `src/core/types.ts` with `Result<T, E>`, `CoreRuntimeError`, and
  the `CoreRuntimeErrorKind` union from design Decision 3.
- [x] 1.3 Add `src/core/types.ts` input types: `StartChangeInput`,
  `StartSyntheticInput`, `AdvanceInput`, `SuspendInput`, `ResumeInput`,
  `StatusInput`, `UpdateFieldInput`, `GetFieldInput`.
- [x] 1.4 Add a small internal helper `src/core/_helpers.ts` (or inline) for
  `nowIso`, `validateRunId`, `validateRunSchema` — migrated from
  `src/bin/specflow-run.ts` and returning `CoreRuntimeError` instead of
  calling `fail()`.
- [x] 1.5 Create `src/core/run-core.ts` barrel that re-exports the seven
  command functions and all public types.

## 2. Extract each core command (in-place, without wiring changes)

- [x] 2.1 Implement `src/core/start.ts` exporting `startChangeRun` and
  `startSyntheticRun`. Migrate logic from `cmdStart` in
  `src/bin/specflow-run.ts`. Replace every `fail(...)` with a returned
  `{ ok: false, error: {...} }` using the exact message text currently used.
- [x] 2.2 Implement `src/core/advance.ts` exporting `advanceRun`. Migrate
  `cmdAdvance`. Accept `WorkflowDefinition` via `deps.workflow`.
- [x] 2.3 Implement `src/core/suspend.ts` exporting `suspendRun`. Migrate
  `cmdSuspend`.
- [x] 2.4 Implement `src/core/resume.ts` exporting `resumeRun`. Migrate
  `cmdResume`. Accept `WorkflowDefinition` via `deps.workflow`.
- [x] 2.5 Implement `src/core/status.ts` exporting `readRunStatus`. Migrate
  `cmdStatus`.
- [x] 2.6 Implement `src/core/update-field.ts` exporting `updateRunField`.
  Migrate `cmdUpdateField`.
- [x] 2.7 Implement `src/core/get-field.ts` exporting `getRunField`. Migrate
  `cmdGetField`. Return `{ ok: true, value: <JsonValue> }` — the CLI will
  serialize to stdout JSON.
- [x] 2.8 Verify no file under `src/core/` imports from `node:fs`, `node:child_process`, or touches
  `process.argv`, `process.stdout`, `process.stderr`, `process.exit`, or
  `process.env` (spot check with `grep`; track as a checklist item until
  step 6.3 adds a programmatic guard).

## 3. Add test doubles and core-runtime tests

- [x] 3.1 Add `src/tests/helpers/in-memory-run-store.ts` — implements
  `RunArtifactStore` with a `Map<string, string>` keyed by `runRef` path.
- [x] 3.2 Add `src/tests/helpers/in-memory-change-store.ts` — implements
  `ChangeArtifactStore` with an in-memory map.
- [x] 3.3 Add `src/tests/helpers/fake-workspace-context.ts` — returns
  canned `projectRoot`, `projectIdentity`, `projectDisplayName`,
  `branchName`, `worktreePath`. Methods for `filteredDiff` throw (not
  used by core).
- [x] 3.4 Create `src/tests/core/` directory and add `start.test.ts`
  migrating the behavioral assertions for `start` from
  `src/tests/specflow-run.test.ts` (change runs, synthetic runs, retry
  guards, source metadata, generated run_id).
- [x] 3.5 Add `src/tests/core/advance.test.ts` migrating `advance` tests
  (mainline, revision branches, suspended guard, invalid event lists
  allowed events, gate-matrix artifact check).
- [x] 3.6 Add `src/tests/core/suspend.test.ts` migrating `suspend` tests
  (preserves phase, rejects terminal, rejects already-suspended).
- [x] 3.7 Add `src/tests/core/resume.test.ts` migrating `resume` tests
  (restores allowed events, rejects non-suspended).
- [x] 3.8 Add `src/tests/core/status.test.ts` and
  `src/tests/core/update-field.test.ts` and
  `src/tests/core/get-field.test.ts` with their migrated assertions.
- [x] 3.9 Run `npm test` (or the repo-defined equivalent). Both the new core
  tests and the existing CLI tests SHALL pass at this point — the CLI is
  still on the old code path.

## 4. Switch the CLI wiring over to the core runtime

- [x] 4.1 In `src/bin/specflow-run.ts`, add a single helper
  `renderResult(schemaId, result)` that:
  - on `ok` calls `printSchemaJson(schemaId, result.value)` and returns
    exit code 0,
  - on `!ok` writes the error message (already prefixed with `"Error: "`
    or `"Usage: "`) to `process.stderr` and returns exit code 1.
- [x] 4.2 Rewrite each `case` arm in `main()` (`start`, `advance`,
  `suspend`, `resume`, `status`, `update-field`, `get-field`) to:
  1. parse flags/positional args (argv parsing stays in the CLI),
  2. construct only the collaborators the command needs,
  3. call the corresponding `src/core/` function,
  4. pass the returned `Result` to `renderResult` and `process.exit` with
     the returned code.
- [x] 4.3 Keep `fail()` only for CLI-layer argv usage errors (`"Usage:
  ..."`) and `not_in_git_repo` detection when constructing the
  `WorkspaceContext` — equivalent in behavior to today's code.
- [x] 4.4 Delete the now-unused `cmdStart/cmdAdvance/cmdSuspend/cmdResume/
  cmdStatus/cmdUpdateField/cmdGetField` bodies in
  `src/bin/specflow-run.ts`. Remove any helpers only they referenced
  (e.g. `writeRunState` / `ensureRunExists`) that have moved into
  `src/core/_helpers.ts`.
- [x] 4.5 Confirm `src/bin/specflow-run.ts` retains: `stateMachinePath`,
  `loadWorkflow`, `createLocalWorkspaceContext`,
  `createLocalFsRunArtifactStore`, `createLocalFsChangeArtifactStore`,
  argv parsing, and the new `renderResult` helper — and nothing else.

## 5. Trim the CLI test suite to smoke-only coverage

- [x] 5.1 Delete from `src/tests/specflow-run.test.ts` every behavioral
  assertion now covered by `src/tests/core/*.test.ts`.
- [x] 5.2 Keep (or add) one smoke test per command that runs the real
  binary via `runNodeCli` and asserts:
  - stdout JSON shape on the happy path,
  - stderr text + exit code 1 on one representative failure,
  - argv parsing routes to the expected core command.
- [x] 5.3 Add a "stderr wording parity" fixture test that asserts each
  `CoreRuntimeError.kind` maps to the exact pre-refactor stderr text
  (snapshot taken before step 2 begins, stored under
  `src/tests/fixtures/error-wording.json`).

## 6. Verification and guardrails

- [x] 6.1 Run the repo-defined verification commands end-to-end: format,
  lint, typecheck, `npm test`, build. All SHALL pass.
- [x] 6.2 Run `openspec validate refactor-specflow-run-into-core-runtime-plus-local-wiring --type change --json`
  and confirm `valid: true`.
- [x] 6.3 Add an ESLint rule (or equivalent project lint config) that
  forbids `process.exit`, `process.stdout`, `process.stderr`,
  `process.argv`, `process.env`, `node:fs`, `node:child_process`, and
  imports from `../bin/**` inside `src/core/**`. Fix any flagged imports.
- [x] 6.4 Diff `src/bin/specflow-run.ts` coverage before vs. after (via
  `--coverage` output or manual review). Confirm no previously-covered
  branch is now uncovered by core or smoke tests.
- [x] 6.5 Manually exercise each `specflow-run` subcommand from a scratch
  checkout end-to-end to confirm stdout JSON and stderr text are
  byte-identical to the pre-refactor output.

## 7. Wrap-up

- [x] 7.1 Update the affected spec deltas only if validation flagged drift
  during step 6.2 (no drift expected, since the specs were drafted
  against this design).
- [x] 7.2 Prepare the commit series along the ordering in Decision 6:
  one commit per step group (1, 2, 3, 4, 5, 6) for reviewer granularity.
