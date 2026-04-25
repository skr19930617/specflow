## Why

Today the main `/specflow` session checks out a new branch in the user's repository root (`git checkout -b <change-id>`), which mutates the user's working tree, contaminates uncommitted state, and serializes work to one change at a time. Subagent bundles already enjoy isolated worktrees under `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/`, but the **main agent itself** does not — so starting a `/specflow` flow forces the user off whatever branch they were on. The user wants `/specflow` to leave the original branch untouched and run main work inside a dedicated worktree, mirroring the isolation already used for subagents.

Source: GitHub issue [skr19930617/specflow#186](https://github.com/skr19930617/specflow/issues/186) — "ブランチを切らずにworktreeで作業する". The issue title's "ブランチを切らずに" means "without disturbing the user-repo's branch"; creating the `<CHANGE_ID>` branch *inside the dedicated worktree* is explicitly allowed because the worktree itself is an independent working tree.

## What Changes

### Main-session worktree creation
- **BREAKING** `specflow-prepare-change` SHALL no longer call `git checkout -b <change-id>` on the user's working tree. Instead it SHALL create (or reuse) a dedicated main-session worktree at `.specflow/worktrees/<CHANGE_ID>/main/` and operate inside it.
- The branch checked out inside the main-session worktree SHALL be named `<CHANGE_ID>` (`change_name == branch_name` is preserved). The branch is created inside the worktree only; the user's repo root is never `checkout`-ed to `<CHANGE_ID>`.
- The main-session worktree SHALL be created from the user repository's current `HEAD` at the moment `/specflow` is first invoked for that change. Whatever branch the user is on becomes the base commit; specflow does not jump to `main`/default.
- Staged, unstaged, and untracked changes in the user's repo root SHALL NOT block worktree creation and SHALL NOT be moved into the worktree. They remain in the user's working tree exactly as they were. (This is the core "no contamination" guarantee.)
- The base commit recorded at worktree creation SHALL be persisted in run-state as `base_commit` so later phases (esp. PR-base resolution) can use it.

### Conflict and reuse policy
- If `.specflow/worktrees/<CHANGE_ID>/main/` already exists and is registered as a worktree for the same change, specflow SHALL reuse the existing worktree and branch as-is (preserving in-progress uncommitted state).
- If a local branch named `<CHANGE_ID>` exists but is *not* tied to `.specflow/worktrees/<CHANGE_ID>/main/`, OR if a worktree registered to that branch is at any other path, `prepare-change` SHALL fail-fast with a clear message and require the user to manually resolve (rename branch, prune the stale worktree, or pick a new change_id). specflow SHALL NOT silently delete user state.

### Run-state semantics
- The run-state's `worktree_path` SHALL point to `.specflow/worktrees/<CHANGE_ID>/main/`; `repo_path` SHALL continue to point at the user-facing repository root, and the two SHALL be allowed to differ.
- All subsequent specflow commands invoked for that change (`/specflow.design`, `/specflow.apply`, `/specflow.review_*`, `/specflow.approve`, `/specflow.reject`, `/specflow.archive`, etc.) SHALL operate against the main-session worktree resolved from run-state, not against the user's repo root.

### Subagent integration target
- Subagent worktrees SHALL continue to be created per `apply-worktree-integration`, but their base HEAD source SHALL shift from "user repo HEAD" to "main-session worktree HEAD". The convention "main workspace" everywhere in `apply-worktree-integration` and `bundle-subagent-execution` SHALL be re-bound to "main-session worktree".
- Subagent worktrees SHALL live under `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/` so all worktrees for a given change share a common parent and can be torn down together.

### Approve / push / PR
- `/specflow.approve` SHALL run `git push -u origin <CHANGE_ID>` from inside the main-session worktree and create the PR from there. The user's repo branch SHALL NOT be touched, cherry-picked, or merged into.
- The PR's **base branch** SHALL be the branch that originally contained the worktree's `base_commit` (recorded at creation). Concretely: specflow resolves the upstream branch of `base_commit` (or, if missing, the local branch the user was on at `prepare-change` time) and uses that as the PR base. This means a `/specflow` started from a feature branch produces a PR targeting that feature branch, not always `main`.

### Cleanup
- `/specflow.approve`, `/specflow.archive`, and `/specflow.reject` SHALL remove the entire `.specflow/worktrees/<CHANGE_ID>/` subtree (`git worktree remove` for each registered worktree, then `rm -rf` the parent) **only when**:
  - the terminal phase succeeded fully (no partial-failure state recorded), AND
  - every worktree under `.specflow/worktrees/<CHANGE_ID>/` is clean (`git -C <wt> status --porcelain` is empty).
- If either condition fails, cleanup SHALL be deferred. specflow SHALL surface the dirty paths / partial-failure cause to the user and exit with the run still in its terminal phase but with a `cleanup_pending` marker. The user resolves manually (commit/discard, rerun the operation, or invoke a future `specflow-cleanup-worktree` helper).

### No legacy mode
- This change replaces the old branch-checkout behavior wholesale. There is **no `legacy_mode` flag** on run-state and no dual-path codebase: in-flight changes whose run-state still records `worktree_path == repo_path` SHALL be drained (approved or rejected) before this change is merged. No automatic migration logic ships.
- `prepare-change` MAY emit a one-time error when it encounters such a legacy run-state, asking the user to finish or reject the legacy change before continuing.

## Capabilities

### New Capabilities
- `main-session-worktree`: defines the contract for creating, reusing, and tearing down a per-change worktree that hosts the main agent session, separate from the user's working repository root. Covers path convention, base HEAD source, dirty-repo behavior, conflict / reuse policy, push/PR semantics, and cleanup gating.

### Modified Capabilities
- `apply-worktree-integration`: subagent worktrees are now created from the main-session worktree HEAD, not from the user-repo HEAD; the integration import target shifts from "main workspace" (user repo) to the main-session worktree. Subagent worktree path convention also moves under the per-change parent (`.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`).
- `workflow-run-state`: `LocalRunState` SHALL gain three new adapter-private fields (`base_commit`, `base_branch`, `cleanup_pending`); the `Started runs capture repository metadata via WorkspaceContext` scenario and the disjoint partition guard scenarios SHALL be updated to enumerate the new fields. `worktree_path` SHALL be allowed to differ from `repo_path`.
- `bundle-subagent-execution`: the workspace where subagent diffs are applied SHALL be the main-session worktree, not the user-facing repository root.

(Note: `canonical-workflow-state` is intentionally NOT modified. Its baseline already classifies `worktree_path` and `branch_name` as adapter-private examples — the canonical surface only enumerates nine semantic roles, none of which encode the path convention. The new path semantics are an adapter-level concern captured by `main-session-worktree` and `workflow-run-state`.)

## Impact

- Affected code:
  - `src/bin/specflow-prepare-change.ts` — replace `ensureBranch` (mutates the user's repo) with `ensureMainSessionWorktree` (creates/reuses `.specflow/worktrees/<CHANGE_ID>/main/`, records `base_commit`).
  - Run-state writers/readers: persist `base_commit`, allow `worktree_path != repo_path`, refuse to load run-state with `worktree_path == repo_path` (legacy guard).
  - Subagent dispatch path under `apply-worktree-integration` — change base HEAD source and parent directory layout.
  - Approve / Reject / Archive paths — push from worktree, base-branch resolution from `base_commit`, dirty/partial-aware cleanup.
  - Watch / Dashboard CLIs — confirm they resolve target paths via `worktree_path` from run-state and not via `process.cwd()` or `repo_path`.
- User-facing change: invoking `/specflow` no longer modifies the user's checked-out branch or working tree. PRs target the branch the user started from, not always `main`.
- Release coordination: this change is breaking. In-flight legacy runs SHALL be drained (approved or rejected) before this lands. The team should freeze new legacy-mode `/specflow` starts during the cutover.
- Cleanup: archived/rejected/approved changes SHALL leave no stale worktree under `.specflow/worktrees/<CHANGE_ID>/` *unless* a dirty/partial state intentionally defers cleanup.
- Tests: `prepare-change` integration tests, run-state schema tests, apply-integration tests, and approve flow tests need updates to assert worktree creation, path conventions, the new base-HEAD source, base-branch PR resolution, and dirty/partial cleanup gating.
