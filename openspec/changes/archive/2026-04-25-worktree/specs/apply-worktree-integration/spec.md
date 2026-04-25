## MODIFIED Requirements

### Requirement: Worktree is created from main HEAD at creation time

For every bundle assigned execution mode `subagent-worktree`, the main agent SHALL create an ephemeral git worktree via `git worktree add` using the **main-session worktree** HEAD at the moment of worktree creation as the base. The "main-session worktree" is the dedicated per-change worktree at `.specflow/worktrees/<CHANGE_ID>/main/` defined in the `main-session-worktree` capability; throughout this capability, "main workspace" is re-bound to that path. The main agent SHALL NOT pre-compute a shared base snapshot for the whole apply run, SHALL NOT rebase the worktree onto a different base before dispatch, and SHALL NOT rebase the worktree prior to integration. The user's repository working tree SHALL NOT be used as a base or as an integration target.

As a consequence, when earlier bundles in the same run have already been integrated into the main-session worktree before a later worktree is created, the later worktree SHALL observe those imports as part of its base. This creates a deterministic, per-worktree base commit that the main agent SHALL record and later use to compute the integration diff.

#### Scenario: Worktree base equals main-session worktree HEAD at creation time

- **WHEN** the main agent creates a worktree for bundle `B` at commit `<sha>`
- **THEN** the worktree's base SHALL equal the main-session worktree HEAD at the moment of creation
- **AND** the main agent SHALL record `<sha>` as the integration base for bundle `B`

#### Scenario: Later worktrees inherit earlier integrations

- **WHEN** bundle `A` has been integrated into the main-session worktree in this run
- **AND** the main agent then creates a worktree for bundle `B`
- **THEN** bundle `B`'s worktree SHALL include bundle `A`'s imported changes as part of its base
- **AND** no auto-rebase SHALL be performed later to reconcile drift

#### Scenario: No shared run-wide base snapshot is used

- **WHEN** an apply run dispatches multiple `subagent-worktree` bundles
- **THEN** each worktree SHALL record its own base commit at creation time
- **AND** worktrees created at different points in the run MAY have different base commits

#### Scenario: User repo working tree is not the base or target

- **WHEN** the main agent dispatches a `subagent-worktree` bundle for change `<CHANGE_ID>`
- **THEN** the user's repository working tree SHALL NOT be used as the base commit source
- **AND** the user's repository working tree SHALL NOT receive any patch imports

### Requirement: Worktree path convention

Every ephemeral worktree for a `subagent-worktree` bundle SHALL be created at the path `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/` relative to the user's repository root. This path is fixed in Phase 1 and SHALL NOT be configurable. The main agent SHALL ensure the parent directory `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/` exists before invoking `git worktree add`. Subagent worktrees thereby become siblings of the main-session worktree at `.specflow/worktrees/<CHANGE_ID>/main/` under the shared per-change parent `.specflow/worktrees/<CHANGE_ID>/`.

If the path already exists and the previous worktree cannot be reclaimed (e.g., it is registered in `git worktree list` and removal fails, or it is a non-worktree directory), the main agent SHALL trigger the worktree-unavailable fail-fast behavior defined below.

#### Scenario: Worktree is created at the conventional path

- **WHEN** the main agent creates a worktree for bundle `B` in run `R` for change `<CHANGE_ID>`
- **THEN** the worktree SHALL be located at `.specflow/worktrees/<CHANGE_ID>/<R>/<B>/`

#### Scenario: Existing stale worktree path triggers fail-fast

- **WHEN** `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/` already exists
- **AND** `git worktree remove` on that path fails
- **THEN** the main agent SHALL trigger worktree-unavailable fail-fast
- **AND** the worktree path SHALL NOT be silently overwritten

#### Scenario: Subagent worktrees share the per-change parent with the main-session worktree

- **WHEN** change `<CHANGE_ID>` has both a main-session worktree and one or more subagent worktrees
- **THEN** the main-session worktree SHALL be at `.specflow/worktrees/<CHANGE_ID>/main/`
- **AND** every subagent worktree SHALL be at `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`

### Requirement: Patch import via git apply covers all standard change types

When all integration-validation checks pass, the main agent SHALL import the subagent's changes into the **main-session worktree** via `git -C <worktree> diff --binary <base-sha>..HEAD | git -C <main-session-worktree> apply --binary` where `<main-session-worktree>` is `.specflow/worktrees/<CHANGE_ID>/main/`. The patch-import mechanism SHALL support the full set of change types that `git diff --binary` and `git apply --binary` themselves cover:

- file creation
- file deletion
- file modification (text content)
- file mode change
- file rename
- binary file content change

The main agent SHALL NOT use `--3way` fallback in Phase 1. If `git apply --binary` exits non-zero against the main-session worktree, the main agent SHALL reject integration. The user's repository working tree SHALL NOT receive the patch.

#### Scenario: Text modification applies cleanly

- **WHEN** integration validation passes and the patch modifies a text file
- **THEN** `git apply --binary` SHALL be invoked with `cwd = .specflow/worktrees/<CHANGE_ID>/main/`
- **AND** the bundle SHALL progress toward `done` on successful apply

#### Scenario: Binary change is included in the patch

- **WHEN** the worktree diff includes a binary file change
- **THEN** the diff SHALL be extracted with `git diff --binary`
- **AND** `git apply --binary` SHALL be invoked against the main-session worktree

#### Scenario: Patch-apply failure rejects integration

- **WHEN** `git apply --binary` exits non-zero against the main-session worktree
- **THEN** the main agent SHALL reject integration
- **AND** the bundle status SHALL become `integration_rejected`
- **AND** no `--3way` retry SHALL be attempted

#### Scenario: User repo working tree is never patched

- **WHEN** integration succeeds for bundle `B`
- **THEN** the patch SHALL be applied only to the main-session worktree
- **AND** the user repo working tree SHALL remain unchanged by the integration

### Requirement: Worktree retention policy

The main agent SHALL clean up worktrees based on the bundle's final status in the current apply invocation:

- On `done`: the worktree SHALL be removed immediately via `git worktree remove <path>`. If `git worktree remove` fails (e.g., due to uncommitted subagent changes that should already have been imported), the main agent SHALL surface the error but SHALL NOT revert the bundle's `done` status.
- On `subagent_failed`: the worktree SHALL be retained at its path at `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`.
- On `integration_rejected`: the worktree SHALL be retained at its path.

Retention behavior in Phase 1 is fixed and SHALL NOT be configurable. `/specflow.fix_apply` and manual inspection SHALL use the retained worktree path to diagnose failures.

The per-change parent `.specflow/worktrees/<CHANGE_ID>/` SHALL NOT be deleted by this capability while any subagent worktree (or the main-session worktree) under it remains. Removal of the parent is governed by the `main-session-worktree` capability's terminal-state cleanup.

#### Scenario: Successful bundle removes its worktree

- **WHEN** bundle `B` reaches `done`
- **THEN** `git worktree remove .specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<B>/` SHALL be invoked
- **AND** the worktree SHALL no longer appear in `git worktree list`

#### Scenario: Failed subagent retains worktree

- **WHEN** bundle `B` reaches `subagent_failed`
- **THEN** the worktree at `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<B>/` SHALL remain
- **AND** the worktree SHALL still appear in `git worktree list`

#### Scenario: Integration rejection retains worktree

- **WHEN** bundle `B` reaches `integration_rejected`
- **THEN** the worktree at `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<B>/` SHALL remain

#### Scenario: Retention policy is not configurable in Phase 1

- **WHEN** an operator attempts to override retention via config in Phase 1
- **THEN** the retention behavior SHALL be the fixed rule above
- **AND** no config key SHALL alter cleanup on success or retention on failure

#### Scenario: Per-change parent is not deleted by this capability

- **WHEN** the last `done` subagent worktree is removed
- **AND** the main-session worktree at `.specflow/worktrees/<CHANGE_ID>/main/` still exists
- **THEN** `.specflow/worktrees/<CHANGE_ID>/` SHALL remain on disk
