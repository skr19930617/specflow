## 1. Extend Bundle Status Model ✓

> Add the new terminal bundle statuses and transition rules so apply, recovery, and rendering can distinguish subagent execution failure from integration rejection.

- [x] 1.1 Extend the task-planner bundle status enum to include subagent_failed and integration_rejected
- [x] 1.2 Update bundle transition validation to allow the new terminal states and pending resets only from fix-apply/operator reset flows
- [x] 1.3 Render the new statuses distinctly in tasks.md output
- [x] 1.4 Add schema, reducer, and rendering tests covering valid and invalid transitions

## 2. Build Worktree Helper Primitives ✓

> Provide the git-backed worktree lifecycle and diff/import helpers needed to isolate subagent execution per bundle.

- [x] 2.1 Implement createWorktree to create .specflow/worktrees/<run-id>/<bundle-id>/ from current HEAD and capture the base SHA
- [x] 2.2 Implement computeDiff, importPatch, and removeWorktree using binary-safe git commands
- [x] 2.3 Implement listTouchedPaths to extract all touched repo-relative paths from patch content
- [x] 2.4 Add unit tests for success and failure behavior of the helper primitives

## 3. Enforce Integration Authority ✓

> Validate subagent worktree output before import so only declared, non-protected, non-empty changes can advance a bundle to done.

> Depends on: build-worktree-helper-primitives, extend-bundle-status-model

- [x] 3.1 Add an integration validation step that computes the worktree diff and rejects undeclared or protected-path changes
- [x] 3.2 Reject successful subagent results that produce an empty diff and surface the empty_diff_on_success cause
- [x] 3.3 Import accepted patches with git apply --binary and transition bundles to done only after successful import
- [x] 3.4 Add tests covering undeclared_path, protected_path, empty_diff_on_success, patch_apply_failure, and the success path

## 4. Route Bundles By Execution Mode ✓

> Assign each bundle to inline-main or subagent-worktree deterministically from the existing subagent-eligibility rule.

> Depends on: enforce-integration-authority

- [x] 4.1 Implement assignExecutionMode to return subagent-worktree only for bundles that are subagent-eligible under the existing rule
- [x] 4.2 Wire dispatcher routing so eligible bundles go through the worktree integration path and others stay inline-main
- [x] 4.3 Add dispatch tests for all required configuration and size-score combinations

## 5. Wire Fail-Fast And Retention ✓

> Integrate worktree mode into apply orchestration with fail-fast semantics on worktree creation errors and retention of failed worktrees for diagnosis.

> Depends on: build-worktree-helper-primitives, enforce-integration-authority, route-bundles-by-execution-mode, extend-bundle-status-model

- [x] 5.1 Create and prepare per-bundle worktrees during apply orchestration and run subagents inside them
- [x] 5.2 Stop the apply immediately when createWorktree fails and leave the run in apply_draft with no further subagents spawned
- [x] 5.3 Retain worktrees for subagent_failed and integration_rejected bundles and remove them after successful integration
- [x] 5.4 Add end-to-end tests covering successful cleanup, retained failure worktrees, and fail-fast behavior on worktree add errors

## 6. Document Fix Apply Recovery ✓

> Document how operators and /specflow.fix_apply recover from subagent_failed and integration_rejected bundles using retained worktrees.

> Depends on: wire-fail-fast-and-retention, extend-bundle-status-model

- [x] 6.1 Document the new terminal bundle statuses and the allowed reset-to-pending recovery path
- [x] 6.2 Document how retained worktrees are located and used during fix-apply recovery
- [x] 6.3 Add operator-facing notes distinguishing subagent execution failure from integration rejection
