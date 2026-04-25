## 1. Confirm Remaining Worktree Policies ✓

> Lock the open behavioral questions so implementation bundles can ship a single worktree-mode contract without fallback paths.

- [x] 1.1 Confirm the implementation policy for cleanup retries, safety-only git worktree prune, and legacy read-only inspection flows.
- [x] 1.2 Translate the confirmed policies into acceptance notes for prepare-change, terminal cleanup, and read-only CLI behavior.
- [x] 1.3 Record rejected alternatives so downstream bundles implement one behavior with no legacy-mode fallback.

## 2. Establish Main Worktree Foundation ✓

> Replace branch checkout with a persisted main-session worktree contract and the run-state fields needed to drive it.

> Depends on: worktree-policy-clarifications

- [x] 2.1 Extend LocalRunState and persistence wiring with base_commit, base_branch, and cleanup_pending, then update the drift-guard test.
- [x] 2.2 Add worktree override and base-info plumbing to the local WorkspaceContext construction path without leaking adapter concerns into core modules.
- [x] 2.3 Replace ensureBranch with ensureMainSessionWorktree, including create, reuse, and fail-fast handling for .specflow/worktrees/<CHANGE_ID>/main/ and removal of legacy checkout mode.
- [x] 2.4 Re-root prepare-change downstream openspec and specflow-run start calls to the resolved worktree path while preserving user-repo HEAD, branch, and dirty-state invariants.

## 3. Retarget Subagent Worktrees ✓

> Move subagent execution and patch application onto change-scoped worktrees rooted under the main-session worktree parent.

> Depends on: main-worktree-foundation

- [x] 3.1 Thread mainSessionWorktreePath and change-scoped worktree parent data through apply-pipeline entrypoints from persisted run-state.
- [x] 3.2 Re-parent subagent worktree creation to .specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/ using explicit user-repo absolute paths in the shared git worktree registry.
- [x] 3.3 Switch subagent diff capture and patch application to compare within the subagent worktree and apply into the main-session worktree instead of the user repo.
- [x] 3.4 Add targeted integration coverage for subagent worktree layout and patch landing location.

## 4. Route Phase Commands Through Worktree Paths ✓

> Make phase-command wiring resolve and execute against state.worktree_path instead of assuming the user repo root.

> Depends on: main-worktree-foundation

- [x] 4.1 Audit src/bin and shared CLI wiring for write-path uses of process.cwd() or git rev-parse --show-toplevel.
- [x] 4.2 Add a shared run-id to run-state to worktree_path resolver and use it to construct worktree-rooted execution contexts in the wiring layer.
- [x] 4.3 Retarget shared phase command entrypoints and openspec invocations to state.worktree_path while leaving phase-specific approve and cleanup behavior to follow-on bundles.
- [x] 4.4 Add a guard test that fails when new CLI write paths hard-code the user repo root outside the allowed wiring points.

## 5. Push And Create PR From Worktree ✓

> Make approve push the change branch from the worktree and target PR creation at the recorded base branch with a safe fallback.

> Depends on: phase-cwd-routing

- [x] 5.1 Update approve to run git push -u origin <CHANGE_ID> from the recorded worktree path.
- [x] 5.2 Resolve the PR base from base_branch upstream tracking data and fall back to the repository default branch when no upstream exists.
- [x] 5.3 Run gh pr create from inside the worktree and surface clear failures when remote or base resolution fails.
- [x] 5.4 Add approve-path coverage for feature-branch starts and detached-HEAD fallback behavior.

## 6. Gate And Cleanup Terminal Worktrees ✓

> Remove the change-scoped worktree subtree only when terminal actions are complete and every worktree is clean, otherwise persist cleanup deferral state.

> Depends on: worktree-policy-clarifications, phase-cwd-routing

- [x] 6.1 Implement the terminal cleanup gate for approve, archive, and reject by combining terminal success with per-worktree clean-tree checks.
- [x] 6.2 Remove all worktrees under .specflow/worktrees/<CHANGE_ID>/ with non-force git worktree remove and delete the parent directory when the gate says remove.
- [x] 6.3 Persist cleanup_pending = true, surface offending paths or partial-failure causes, and keep the run terminal when cleanup must defer.
- [x] 6.4 Re-evaluate deferred cleanup on subsequent terminal-phase invocations and clear the pending flag when cleanup eventually succeeds.

## 7. Block Legacy Resume Paths ✓

> Reject persisted legacy runs on prepare-change resume when worktree_path still points at the user repo root, without breaking read-only inspection flows.

> Depends on: worktree-policy-clarifications, main-worktree-foundation

- [x] 7.1 Detect resumed runs in prepare-change where worktree_path equals repo_path and fail before any workspace mutation occurs.
- [x] 7.2 Restrict the guard to prepare-change resume paths so read-only inspection commands can still load legacy records.
- [x] 7.3 Emit actionable remediation guidance with the conflicting paths in the error output.
- [x] 7.4 Add blocked-resume coverage proving the legacy guard is non-mutating.

## 8. Retarget Watcher And Dashboard Reads ✓

> Make watcher, dashboard, archive, and related status surfaces follow worktree_path indirection instead of scanning the user repo.

> Depends on: phase-cwd-routing

- [x] 8.1 Update specflow-watch to resolve the active worktree_path from RUN_ID and follow artifacts in the worktree.
- [x] 8.2 Retarget dashboard, archive, and related readers to inspect openspec/changes/<CHANGE_ID>/ inside the worktree until archive propagation completes.
- [x] 8.3 Audit external hook or status surfaces that accept RUN_ID so they use run-state indirection rather than repo-root scanning.
- [x] 8.4 Add coverage for watcher and dashboard behavior against active worktree-mode runs.

## 9. Verify Worktree Invariants End To End ✓

> Prove the new worktree mode preserves user-repo invariants and satisfies completion conditions C-1 through C-7 across the full lifecycle.

> Depends on: subagent-worktree-retargeting, approve-pr-base-routing, terminal-worktree-cleanup, legacy-runstate-guard, watcher-dashboard-retargeting

- [x] 9.1 Build temp-repo end-to-end smoke tests covering fresh prepare-change through apply, approve, and reject with assertions that the user repo HEAD, branch, and dirty state never change.
- [x] 9.2 Add integration tests for subagent patch application, watcher/dashboard worktree resolution, and terminal cleanup defer-versus-remove flows.
- [x] 9.3 Verify approve PR base selection against recorded base_branch, including default-branch fallback when upstream tracking is missing.
- [x] 9.4 Lock in grep and runtime guards for forbidden repo-root write paths and legacy resume rejection across the CLI surface.
