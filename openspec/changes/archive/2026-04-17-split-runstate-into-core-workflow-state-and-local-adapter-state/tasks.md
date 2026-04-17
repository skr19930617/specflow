## 1. Add AdapterFields and delete RunStateCoreFields ✓

> Establish the generic adapter type constraint and remove the deprecated RunStateCoreFields alias from the type surface.

- [x] 1.1 Add AdapterFields<TAdapter> conditional type to src/types/contracts.ts with doc comment explaining collision errors
- [x] 1.2 Add RecordMutation type and TransitionOk<TAdapter> type to src/core/types.ts
- [x] 1.3 Rewrite RunState<TAdapter> to use CoreRunState & AdapterFields<TAdapter>
- [x] 1.4 Delete RunStateCoreFields from src/types/contracts.ts and remove from re-exports
- [x] 1.5 Migrate all internal references from RunStateCoreFields to CoreRunState or RunState
- [x] 1.6 Run bun run typecheck to confirm type changes compile

## 2. Refactor advanceRun to pure transition with record mutations ✓

> Convert advanceRun from an I/O-performing command to a pure function that returns state and RecordMutation[] without touching any store.

> Depends on: type-contracts-update

- [x] 2.1 Rewrite advanceRun signature to accept state, preconditions (priorRecords, nowIso, event) and return Result<TransitionOk<TAdapter>>
- [x] 2.2 Replace InteractionRecordStore.write/list/delete calls with computed RecordMutation[] in return value
- [x] 2.3 Remove deps.runs, deps.records, deps.changes from advanceRun's Deps type
- [x] 2.4 Remove all WorkspaceContext and store imports from advance.ts
- [x] 2.5 Run bun run typecheck to confirm advance.ts compiles

## 3. Refactor startChangeRun and startSyntheticRun to pure functions ✓

> Convert start commands to accept precondition inputs and adapter seed, returning state without performing any I/O.

> Depends on: type-contracts-update

- [x] 3.1 Rewrite startChangeRun signature to accept preconditions (nextRunId, proposalExists, existingRunExists, adapterSeed, nowIso) and return Result<TransitionOk<TAdapter>>
- [x] 3.2 Rewrite startSyntheticRun signature with same pattern
- [x] 3.3 Remove WorkspaceContext imports and calls (projectRoot, worktreePath, branchName, projectDisplayName, projectIdentity)
- [x] 3.4 Remove deps.runs, deps.changes, deps.workspace from start Deps type
- [x] 3.5 Run bun run typecheck to confirm start.ts compiles

## 4. Refactor suspend, resume, updateField and delete status/getField/helpers ✓

> Convert remaining core commands to pure functions and remove read-only wrapper modules that belong in wiring.

> Depends on: type-contracts-update

- [x] 4.1 Rewrite suspendRun to accept state and return Result<TransitionOk<TAdapter>> without store access
- [x] 4.2 Rewrite resumeRun to accept state and return Result<TransitionOk<TAdapter>> without store access
- [x] 4.3 Rewrite updateField to accept state and return Result<TransitionOk<TAdapter>> without store access
- [x] 4.4 Delete src/core/status.ts
- [x] 4.5 Delete src/core/get-field.ts
- [x] 4.6 Delete src/core/_helpers.ts and migrate any needed logic inline
- [x] 4.7 Remove all store and workspace imports from remaining core Deps types
- [x] 4.8 Run bun run typecheck to confirm all core modules compile

## 5. Rewrite CLI wiring to gather-invoke-apply pattern ✓

> Move all I/O into the CLI wiring layer following the three-phase gather/invoke/apply pattern for every subcommand.

> Depends on: core-advance-refactor, core-start-refactor, core-remaining-commands-refactor

- [x] 5.1 Rewrite start subcommand: gather LocalRunState seed from WorkspaceContext + preconditions, invoke pure startChangeRun/startSyntheticRun, persist state
- [x] 5.2 Rewrite advance subcommand: read state + records, invoke pure advanceRun, persist state then apply RecordMutation[] in order
- [x] 5.3 Rewrite suspend subcommand: read state, invoke pure suspendRun, persist state
- [x] 5.4 Rewrite resume subcommand: read state, invoke pure resumeRun, persist state
- [x] 5.5 Rewrite update-field subcommand: read state, invoke pure updateField, persist state
- [x] 5.6 Inline status subcommand: read run.json via store, write to stdout, exit
- [x] 5.7 Inline get-field subcommand: read run.json, extract field, write to stdout or stderr on missing
- [x] 5.8 Update specflow-prepare-change.ts if it calls any refactored core functions
- [x] 5.9 Verify record-mutation ordering preserves existing compensation semantic (state write first, then record writes)
- [x] 5.10 Run bun run typecheck to confirm wiring compiles

## 6. Migrate core and CLI tests to match pure function signatures ✓

> Rewrite core tests to call pure functions with explicit state/preconditions and reduce CLI tests to smoke-level assertions.

> Depends on: wiring-rewrite

- [x] 6.1 Rewrite core advance tests to pass state + priorRecords and assert returned TransitionOk including recordMutations
- [x] 6.2 Rewrite core start tests to pass preconditions and adapter seed, assert returned state
- [x] 6.3 Rewrite core suspend/resume/updateField tests to pass state and assert returned TransitionOk
- [x] 6.4 Add record-mutation compensation test: verify wiring-layer ordering matches prior best-effort cleanup behavior
- [x] 6.5 Reduce CLI tests to smoke-level: argv → stdout/stderr/exit code assertions only
- [x] 6.6 Remove any test mocks for stores or WorkspaceContext that are no longer needed in core tests
- [x] 6.7 Run bun test to confirm all tests pass

## 7. Extend drift-guard test with static-grep and type-level assertions ✓

> Add compile-time and grep-based assertions that prevent future re-introduction of I/O or adapter knowledge into src/core/.

> Depends on: wiring-rewrite

- [x] 7.1 Add static-grep assertions on src/core/**/*.ts for banned import strings (workspace-context, deps.runs.*, deps.changes.*, deps.records.*)
- [x] 7.2 Add static-grep assertions for banned object-property-key tokens (repo_path, worktree_path, project_id, branch_name, last_summary_path, repo_name)
- [x] 7.3 Add type-level assertion: every *Deps type in src/core/types.ts excludes workspace | runs | changes | records members
- [x] 7.4 Add type-level assertion: AdapterFields<{ run_id: string }> resolves to never
- [x] 7.5 Add type-level assertion: AdapterFields<LocalRunState> resolves to LocalRunState
- [x] 7.6 Run bun test to confirm drift-guard test passes

## 8. Run full verification suite and confirm completion conditions ✓

> Confirm all completion conditions from the design are met: typecheck, tests, openspec validate, grep checks, and CLI regression parity.

> Depends on: test-migration, drift-guard-extension

- [x] 8.1 Run bun run format and fix any formatting issues
- [x] 8.2 Run bun run typecheck and confirm green
- [x] 8.3 Run bun test and confirm all tests pass
- [x] 8.4 Run openspec validate split-runstate-into-core-workflow-state-and-local-adapter-state --type change and confirm green
- [x] 8.5 Run grep -R 'RunStateCoreFields' src/ and confirm no results
- [x] 8.6 Run grep -R 'workspace-context\|deps.runs\.\|deps.changes\.\|deps.records\.' src/core/ and confirm no results
- [x] 8.7 Verify CLI regression parity: status, start, advance, suspend, resume, update-field, get-field produce identical output to pre-refactor baseline
