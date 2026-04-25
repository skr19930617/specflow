## ADDED Requirements

### Requirement: Main-session worktree replaces user-repo branch checkout

When `specflow-prepare-change` initializes a change for the first time, the main agent SHALL NOT execute `git checkout -b <CHANGE_ID>` (or any other `git checkout`) on the user's working repository. Instead, the main agent SHALL create a dedicated git worktree for the change and conduct all subsequent main-session work inside it. The user's working repository SHALL retain its current branch, current `HEAD`, and any staged, unstaged, or untracked changes exactly as they were before `/specflow` was invoked.

#### Scenario: User repo state is untouched on prepare-change

- **WHEN** the user invokes `/specflow` for a new change while their repo is on branch `feature/X` with uncommitted local edits
- **THEN** the main agent SHALL NOT switch the user's repo to any other branch
- **AND** the user's staged, unstaged, and untracked changes SHALL remain in the user repo unchanged
- **AND** `git -C <user-repo> branch --show-current` SHALL still report `feature/X` after `prepare-change` returns

#### Scenario: No git checkout is run on the user repo

- **WHEN** `specflow-prepare-change` initializes a new change `<CHANGE_ID>`
- **THEN** no `git checkout`, `git switch`, or branch-creation command SHALL be executed in the user repo working tree

### Requirement: Main-session worktree path convention

The main-session worktree for change `<CHANGE_ID>` SHALL be created at `.specflow/worktrees/<CHANGE_ID>/main/` relative to the user's repository root. The path SHALL NOT be configurable in this phase. Subagent worktrees for the same change SHALL live as siblings under `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`, so the parent directory `.specflow/worktrees/<CHANGE_ID>/` is the single root for all worktrees belonging to that change.

#### Scenario: Main-session worktree is created at the conventional path

- **WHEN** the main agent creates a main-session worktree for change `<CHANGE_ID>`
- **THEN** the worktree SHALL be located at `.specflow/worktrees/<CHANGE_ID>/main/`

#### Scenario: All change-scoped worktrees share a parent

- **WHEN** change `<CHANGE_ID>` has both a main-session worktree and one or more subagent worktrees
- **THEN** every such worktree SHALL be a direct or nested child of `.specflow/worktrees/<CHANGE_ID>/`

### Requirement: Main-session worktree base commit and branch

The main-session worktree SHALL be created from the user repository's current `HEAD` at the moment `prepare-change` first runs for the change. The branch checked out inside the worktree SHALL be named exactly `<CHANGE_ID>` (preserving `change_name == branch_name`). The branch SHALL be created via `git worktree add -b <CHANGE_ID> <path> HEAD` so the new branch exists only inside the worktree.

The main agent SHALL persist the resolved base commit SHA in run-state as `base_commit` together with the branch name the user was on at creation time (`base_branch`, used later for PR base resolution).

#### Scenario: base_commit equals user-repo HEAD at creation

- **WHEN** the user repo HEAD is `<sha>` at `prepare-change` time
- **THEN** the main-session worktree's base commit SHALL equal `<sha>`
- **AND** run-state SHALL persist `base_commit = <sha>`

#### Scenario: Worktree branch is named after the change

- **WHEN** the main agent creates the main-session worktree for `<CHANGE_ID>`
- **THEN** the branch checked out inside that worktree SHALL be `<CHANGE_ID>`
- **AND** the user-repo working tree SHALL NOT have `<CHANGE_ID>` checked out

#### Scenario: base_branch is recorded for PR base resolution

- **WHEN** the user is on branch `<USER_BRANCH>` at `prepare-change` time
- **THEN** run-state SHALL persist `base_branch = <USER_BRANCH>`

### Requirement: Main-session worktree reuse policy

If `.specflow/worktrees/<CHANGE_ID>/main/` already exists AND `git worktree list` shows it registered as the worktree for branch `<CHANGE_ID>`, the main agent SHALL reuse the existing worktree and branch as-is. The main agent SHALL NOT recreate the worktree, SHALL NOT delete its contents, and SHALL NOT touch any uncommitted state inside it.

#### Scenario: Existing main-session worktree is reused

- **WHEN** `prepare-change` runs and the main-session worktree already exists for `<CHANGE_ID>`
- **AND** the worktree is registered in `git worktree list` with branch `<CHANGE_ID>`
- **THEN** the main agent SHALL reuse the existing worktree
- **AND** uncommitted state inside the worktree SHALL be preserved

### Requirement: Conflict fail-fast on existing branch or stale worktree

If a local branch named `<CHANGE_ID>` already exists but is NOT tied to `.specflow/worktrees/<CHANGE_ID>/main/`, OR if any registered worktree is bound to branch `<CHANGE_ID>` at any path other than the conventional one, OR if `.specflow/worktrees/<CHANGE_ID>/main/` exists as a non-worktree directory, the main agent SHALL fail-fast `prepare-change`. The error message SHALL name the offending branch / path / worktree and instruct the user to manually resolve by renaming the branch, pruning the stale worktree, or selecting a different `change_id`.

The main agent SHALL NOT silently delete, prune, or overwrite the conflicting state.

#### Scenario: Pre-existing branch with no matching worktree triggers fail-fast

- **WHEN** local branch `<CHANGE_ID>` exists
- **AND** no worktree at `.specflow/worktrees/<CHANGE_ID>/main/` is registered for it
- **THEN** `prepare-change` SHALL exit non-zero with an actionable message
- **AND** the user repo SHALL be untouched

#### Scenario: Worktree registered at a non-conventional path triggers fail-fast

- **WHEN** branch `<CHANGE_ID>` is registered as a worktree at a path other than `.specflow/worktrees/<CHANGE_ID>/main/`
- **THEN** `prepare-change` SHALL fail-fast with the offending worktree path in the message

#### Scenario: Non-worktree directory at the conventional path triggers fail-fast

- **WHEN** `.specflow/worktrees/<CHANGE_ID>/main/` exists as a regular directory not registered as a git worktree
- **THEN** `prepare-change` SHALL fail-fast and SHALL NOT delete the directory

### Requirement: All main-session commands operate inside the worktree

After `prepare-change` returns, every specflow command that performs work for the change (including `/specflow.design`, `/specflow.apply`, `/specflow.review_design`, `/specflow.review_apply`, `/specflow.fix_design`, `/specflow.fix_apply`, `/specflow.approve`, `/specflow.reject`, and `/specflow.archive`) SHALL resolve its working directory from `worktree_path` in run-state and SHALL execute git operations and file edits inside the main-session worktree.

#### Scenario: Phase commands execute inside the main-session worktree

- **WHEN** `/specflow.apply` runs for change `<CHANGE_ID>`
- **THEN** all git operations and file edits SHALL target `.specflow/worktrees/<CHANGE_ID>/main/`

#### Scenario: User repo is read-only to main-session phase commands

- **WHEN** any main-session phase command executes
- **THEN** it SHALL NOT modify files, branches, or git refs inside the user repo working tree (outside `.specflow/worktrees/`)

### Requirement: Approve push and PR base resolution

`/specflow.approve` SHALL execute `git push -u origin <CHANGE_ID>` from inside the main-session worktree. The user repo SHALL NOT be used as the push source, and SHALL NOT receive cherry-picks or merges from the worktree.

The PR's base branch SHALL be resolved from run-state's `base_branch`. If `base_branch` has a known upstream remote tracking ref, the PR base SHALL be the corresponding remote branch (e.g., `origin/<base_branch>`); otherwise the PR base SHALL fall back to the repository's default branch.

#### Scenario: Push originates from the main-session worktree

- **WHEN** `/specflow.approve` runs for change `<CHANGE_ID>`
- **THEN** `git push -u origin <CHANGE_ID>` SHALL be executed with `cwd = .specflow/worktrees/<CHANGE_ID>/main/`
- **AND** no push SHALL be issued from the user repo

#### Scenario: PR base branch comes from base_branch

- **WHEN** the user started `/specflow` from branch `feature/X`
- **AND** `feature/X` is recorded in run-state as `base_branch`
- **THEN** the PR created by `/specflow.approve` SHALL target `feature/X` as its base
- **AND** SHALL NOT default to `main` unless `feature/X` is the default branch

#### Scenario: PR base falls back to default branch when base_branch has no upstream

- **WHEN** `base_branch` has no upstream tracking ref
- **THEN** the PR base SHALL fall back to the repository's default branch

### Requirement: Cleanup is gated on clean and complete terminal state

`/specflow.approve`, `/specflow.archive`, and `/specflow.reject` SHALL remove `.specflow/worktrees/<CHANGE_ID>/` (every registered worktree via `git worktree remove`, then the parent directory) **only when both** of the following hold at the moment of terminal phase entry:

1. The terminal action itself succeeded fully (e.g., `approve` pushed and created the PR; `archive` archived the change; `reject` reset all artifacts). No partial-failure state SHALL be recorded for the run.
2. Every worktree under `.specflow/worktrees/<CHANGE_ID>/` is clean (`git -C <wt> status --porcelain` returns empty output).

If either condition fails, cleanup SHALL be deferred. The run SHALL still enter its terminal phase, but a `cleanup_pending` marker SHALL be recorded in run-state, and the user-facing CLI output SHALL surface the dirty paths and/or partial-failure cause and instruct the user how to resolve manually.

#### Scenario: Successful approve cleans up worktrees

- **WHEN** `/specflow.approve` succeeds end-to-end
- **AND** every worktree under `.specflow/worktrees/<CHANGE_ID>/` is clean
- **THEN** every such worktree SHALL be removed via `git worktree remove`
- **AND** `.specflow/worktrees/<CHANGE_ID>/` SHALL be deleted
- **AND** run-state SHALL NOT have a `cleanup_pending` marker

#### Scenario: Dirty worktree blocks cleanup

- **WHEN** `/specflow.approve` succeeds but the main-session worktree has uncommitted changes
- **THEN** cleanup SHALL be skipped
- **AND** run-state SHALL record `cleanup_pending = true`
- **AND** the CLI output SHALL list the dirty paths

#### Scenario: Partial approve failure blocks cleanup

- **WHEN** `/specflow.approve` pushes successfully but PR creation fails
- **THEN** cleanup SHALL be skipped
- **AND** run-state SHALL record `cleanup_pending = true` with the partial-failure cause

### Requirement: No legacy mode coexistence

This capability SHALL NOT introduce a `legacy_mode` flag, dual-path code, or in-process migration of pre-existing run-state. Run-state records that still satisfy `worktree_path == repo_path` SHALL be treated as legacy artifacts that must be drained (approved or rejected) before this change is merged. After the change lands, encountering such a record SHALL cause `prepare-change` to refuse to proceed with an explicit error.

#### Scenario: Legacy run-state is rejected by prepare-change

- **WHEN** `prepare-change` resumes a run whose persisted run-state has `worktree_path == repo_path`
- **THEN** it SHALL exit non-zero with a message asking the user to finish or reject the legacy change
- **AND** SHALL NOT silently fall back to branch-checkout behavior
