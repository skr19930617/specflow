## 1. Declare CoreRunState and LocalRunState partition

> Split RunState into CoreRunState and LocalRunState in src/types/contracts.ts with an intersection alias preserving the RunState name.

- [x] 1.1 Enumerate current RunState fields and classify each as core vs local per design D1
- [x] 1.2 Add CoreRunState interface with 12 runtime-agnostic fields (phase, status, history, agents, events, source, identity, timestamps, lineage, run_kind)
- [x] 1.3 Add LocalRunState interface with 6 local-adapter fields (project_id, repo_name, repo_path, branch_name, worktree_path, last_summary_path)
- [x] 1.4 Redeclare RunState as CoreRunState & LocalRunState intersection alias
- [x] 1.5 Add warning comment near declarations: 'Adding a new field? Put it in CoreRunState or LocalRunState, not RunState.'
- [x] 1.6 Run bun run typecheck to confirm no consumer breaks

## 2. Add compile-time partition drift guard

> Create src/tests/run-state-partition.test.ts with AssertEqual assertions enforcing disjointness and exhaustive coverage of RunState.

> Depends on: types-partition

- [x] 2.1 Create src/tests/run-state-partition.test.ts with AssertEqual helper type
- [x] 2.2 Add disjointness assertion: keyof CoreRunState & keyof LocalRunState === never
- [x] 2.3 Add exhaustiveness assertion: keyof CoreRunState | keyof LocalRunState === keyof RunState
- [x] 2.4 Add a no-op describe.skip/it.skip runtime export so the harness does not flag the file as unused
- [x] 2.5 Verify bun run typecheck passes; verify deliberate perturbation (duplicate key) causes typecheck failure

## 3. Narrow core mutator signatures with generic bound

> Re-type advanceRun, suspendRun, resumeRun, and internal loadRunState/writeRunState helpers with <T extends CoreRunState = RunState>.

> Depends on: types-partition

- [x] 3.1 Narrow loadRunState and writeRunState in src/core/_helpers.ts with <T extends CoreRunState = RunState>
- [x] 3.2 Run bun run typecheck after _helpers.ts change to catch inference regressions
- [x] 3.3 Narrow advanceRun in src/core/advance.ts to return Result<T, CoreRuntimeError> with <T extends CoreRunState = RunState>
- [x] 3.4 Run bun run typecheck after advance.ts change
- [x] 3.5 Narrow suspendRun in src/core/suspend.ts with the same generic bound
- [x] 3.6 Run bun run typecheck after suspend.ts change
- [x] 3.7 Narrow resumeRun in src/core/resume.ts with the same generic bound
- [x] 3.8 Run bun run typecheck after resume.ts change
- [x] 3.9 Confirm startChangeRun, startSyntheticRun, readRunStatus, getRunField, updateRunField remain on RunState per D3/D4
- [x] 3.10 Run full bun run test to confirm no behavioral regressions

## 4. Update architecture docs to reference the new split

> Remove 'field-level split deferred' caveats from docs/architecture.md and reference CoreRunState/LocalRunState.

> Depends on: types-partition

- [x] 4.1 Update 'Run-state JSON structure' inventory row: replace 'Not yet supported' caveat with description of type-level split and reference to follow-up schema-split change
- [x] 4.2 Update core-adjacent modules subsection: remove 'the field-level split is deferred to a separate follow-up proposal' and reference CoreRunState/LocalRunState
- [x] 4.3 Update persistence concerns subsection: replace mixed-fields enumeration with description of the split
- [x] 4.4 Add reference to src/tests/run-state-partition.test.ts drift guard so its purpose is visible outside the test file
- [x] 4.5 Grep docs/architecture.md to confirm no remaining 'field-level split deferred' phrases
