# apply-worktree-integration Specification

## Purpose
TBD - created by archiving change apply-worktree-isolation. Update Purpose after archive.
## Requirements
### Requirement: Worktree is created from main HEAD at creation time

For every bundle assigned execution mode `subagent-worktree`, the main agent SHALL create an ephemeral git worktree via `git worktree add` using the current repository HEAD at the moment of worktree creation as the base. The main agent SHALL NOT pre-compute a shared base snapshot for the whole apply run, SHALL NOT rebase the worktree onto a different base before dispatch, and SHALL NOT rebase the worktree prior to integration.

As a consequence, when earlier bundles in the same run have already been integrated into the main workspace before a later worktree is created, the later worktree SHALL observe those imports as part of its base. This creates a deterministic, per-worktree base commit that the main agent SHALL record and later use to compute the integration diff.

#### Scenario: Worktree base equals main HEAD at creation time

- **WHEN** the main agent creates a worktree for bundle `B` at commit `<sha>`
- **THEN** the worktree's base SHALL equal the main workspace HEAD at the moment of creation
- **AND** the main agent SHALL record `<sha>` as the integration base for bundle `B`

#### Scenario: Later worktrees inherit earlier integrations

- **WHEN** bundle `A` has been integrated into the main workspace in this run
- **AND** the main agent then creates a worktree for bundle `B`
- **THEN** bundle `B`'s worktree SHALL include bundle `A`'s imported changes as part of its base
- **AND** no auto-rebase SHALL be performed later to reconcile drift

#### Scenario: No shared run-wide base snapshot is used

- **WHEN** an apply run dispatches multiple `subagent-worktree` bundles
- **THEN** each worktree SHALL record its own base commit at creation time
- **AND** worktrees created at different points in the run MAY have different base commits

### Requirement: Worktree path convention

Every ephemeral worktree for a `subagent-worktree` bundle SHALL be created at the path `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` relative to the repository root. This path is fixed in Phase 1 and SHALL NOT be configurable. The main agent SHALL ensure the parent directory `.specflow/worktrees/<RUN_ID>/` exists before invoking `git worktree add`.

If the path already exists and the previous worktree cannot be reclaimed (e.g., it is registered in `git worktree list` and removal fails, or it is a non-worktree directory), the main agent SHALL trigger the worktree-unavailable fail-fast behavior defined below.

#### Scenario: Worktree is created at the conventional path

- **WHEN** the main agent creates a worktree for bundle `B` in run `R`
- **THEN** the worktree SHALL be located at `.specflow/worktrees/<R>/<B>/`

#### Scenario: Existing stale worktree path triggers fail-fast

- **WHEN** `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` already exists
- **AND** `git worktree remove` on that path fails
- **THEN** the main agent SHALL trigger worktree-unavailable fail-fast
- **AND** the worktree path SHALL NOT be silently overwritten

### Requirement: Worktree-unavailable fail-fast

When the main agent cannot create a usable worktree for a subagent-eligible bundle, the main agent SHALL fail-fast the entire apply. Triggering conditions include, but are not limited to:

- `git worktree` is unavailable (git version too old or binary missing),
- the target path cannot be created due to filesystem or permission errors,
- the target path already exists and cannot be reclaimed,
- `git worktree add` exits non-zero for any other reason.

On any such trigger, the main agent SHALL:

1. Surface an actionable error message that names the attempted worktree path and the underlying git/OS error.
2. Leave the run in `apply_draft`.
3. NOT silently fall back to `inline-main` for the failing bundle or for any other bundle.
4. NOT dispatch any further subagent in the current window, chunk, or subsequent windows.

#### Scenario: git worktree add failure aborts the apply

- **WHEN** the main agent invokes `git worktree add` for bundle `B` and the command exits non-zero
- **THEN** the main agent SHALL surface the git error with the attempted worktree path
- **AND** the run SHALL remain in `apply_draft`
- **AND** no subsequent subagent SHALL be dispatched

#### Scenario: No silent degradation to inline-main

- **WHEN** worktree creation fails for a `subagent-worktree` bundle
- **THEN** the main agent SHALL NOT run that bundle inline
- **AND** the main agent SHALL NOT warn-then-continue

### Requirement: Subagent returns structured result with produced_artifacts

The subagent SHALL return a structured result containing at minimum:

- `status`: `"success"` | `"failure"`
- `produced_artifacts`: a set of repo-relative file paths that the subagent intended to create, modify, delete, rename (with new path), or change mode on. Over-declared entries (paths listed that do not appear in the diff) are permitted.
- `error`: human-readable message plus any structured diagnostic fields, required when `status = "failure"`; forbidden when `status = "success"`.

The main agent SHALL parse this result and use it as the sole source of truth for integration validation on `status = "success"`. On `status = "failure"`, the main agent SHALL skip integration and record the failure per the bundle-status contract below.

#### Scenario: Successful subagent result includes produced_artifacts

- **WHEN** a subagent returns `status: "success"`
- **THEN** the result SHALL include a `produced_artifacts` field
- **AND** `produced_artifacts` SHALL be a set of repo-relative paths

#### Scenario: Failed subagent result includes error

- **WHEN** a subagent returns `status: "failure"`
- **THEN** the result SHALL include a non-empty `error` field
- **AND** the main agent SHALL NOT compute a diff or attempt integration for that bundle

### Requirement: Main-agent integration authority — diff inspection and artifact cross-check

Before a `subagent-worktree` bundle can reach `done`, the main agent SHALL perform integration validation on the worktree. Integration validation in Phase 1 is limited to **diff inspection + produced-artifact cross-check**; running lint, tests, or other side effects is explicitly OUT of scope for this requirement.

The main agent SHALL:

1. Compute the worktree diff via `git -C <worktree> diff --binary <base-sha>..HEAD` where `<base-sha>` is the base commit recorded at worktree-creation time.
2. Extract the set of touched paths from the diff, where:
   - an added file contributes its path,
   - a deleted file contributes its deleted path,
   - a modified file contributes its path,
   - a renamed file contributes the **new** path (not the old path),
   - a mode-only change contributes its path (counts as a modification).
3. Compare the set of touched paths to `produced_artifacts`:
   - Every touched path SHALL appear in `produced_artifacts`.
   - Entries in `produced_artifacts` not present in the touched-path set (over-declaration) SHALL NOT cause rejection; the main agent MAY emit a warning.
4. Check the touched paths against the protected-path list (see below).
5. Check for the empty-diff-on-success condition (see below).

If all checks pass, the main agent SHALL proceed to patch import. If any check fails, the main agent SHALL record the bundle status as `integration_rejected` per the bundle-status contract below.

#### Scenario: Every diff path must be declared

- **WHEN** the worktree diff touches paths `{a, b, c}` and `produced_artifacts = {a, b, c}`
- **THEN** the undeclared-paths check SHALL pass

#### Scenario: Undeclared path causes integration rejection

- **WHEN** the worktree diff touches `{a, b, c}` but `produced_artifacts = {a, b}`
- **THEN** the main agent SHALL reject integration
- **AND** the bundle status SHALL become `integration_rejected`

#### Scenario: Over-declared artifact does not reject

- **WHEN** the worktree diff touches `{a, b}` but `produced_artifacts = {a, b, c}`
- **THEN** the main agent MAY emit a warning about `c`
- **AND** the main agent SHALL NOT reject integration on this condition alone

#### Scenario: Renamed file is matched by the new path

- **WHEN** the worktree diff contains a rename from `old/p.ts` to `new/p.ts`
- **AND** `produced_artifacts` contains `new/p.ts` but not `old/p.ts`
- **THEN** the undeclared-paths check SHALL pass

#### Scenario: Deletion is matched by the deleted path

- **WHEN** the worktree diff deletes `x.ts`
- **AND** `produced_artifacts` contains `x.ts`
- **THEN** the undeclared-paths check SHALL pass

#### Scenario: Mode-only change counts as modification

- **WHEN** the worktree diff contains a mode-only change on `bin/run.sh`
- **AND** `produced_artifacts` contains `bin/run.sh`
- **THEN** the undeclared-paths check SHALL pass

### Requirement: Protected-path touch causes integration rejection

The main agent SHALL reject integration when the worktree diff touches any of the following paths:

- `openspec/changes/<CHANGE_ID>/task-graph.json`
- `openspec/changes/<CHANGE_ID>/tasks.md`
- Any path under `.specflow/`

These paths are reserved for main-agent mutation. Protected-path rejection takes precedence over the undeclared-paths check: even if a subagent declares a protected path in `produced_artifacts`, touching that path SHALL reject integration.

#### Scenario: Touching task-graph.json rejects

- **WHEN** the worktree diff modifies `openspec/changes/<CHANGE_ID>/task-graph.json`
- **THEN** the main agent SHALL reject integration
- **AND** the bundle status SHALL become `integration_rejected`

#### Scenario: Touching tasks.md rejects

- **WHEN** the worktree diff modifies `openspec/changes/<CHANGE_ID>/tasks.md`
- **THEN** the main agent SHALL reject integration

#### Scenario: Touching any path under .specflow/ rejects

- **WHEN** the worktree diff adds, modifies, or deletes a path under `.specflow/`
- **THEN** the main agent SHALL reject integration

#### Scenario: Declaring a protected path in produced_artifacts does not bypass the check

- **WHEN** the worktree diff modifies a protected path
- **AND** that path is listed in `produced_artifacts`
- **THEN** the main agent SHALL still reject integration

### Requirement: Empty-diff-on-success causes integration rejection

If a subagent returns `status: "success"` but the worktree diff is empty (no path is touched), the main agent SHALL reject integration. An empty diff paired with success indicates the subagent did not produce the work the bundle claims to have done.

#### Scenario: Empty diff with success rejects

- **WHEN** a subagent returns `status: "success"`
- **AND** `git -C <worktree> diff --binary <base-sha>..HEAD` produces no changes
- **THEN** the main agent SHALL reject integration
- **AND** the bundle status SHALL become `integration_rejected`

### Requirement: Patch import via git apply covers all standard change types

When all integration-validation checks pass, the main agent SHALL import the subagent's changes into the main workspace via `git -C <worktree> diff --binary <base-sha>..HEAD | git apply --binary` executed at the repository root. The patch-import mechanism SHALL support the full set of change types that `git diff --binary` and `git apply --binary` themselves cover:

- file creation
- file deletion
- file modification (text content)
- file mode change
- file rename
- binary file content change

The main agent SHALL NOT use `--3way` fallback in Phase 1. If `git apply --binary` exits non-zero at the repo root, the main agent SHALL reject integration.

#### Scenario: Text modification applies cleanly

- **WHEN** integration validation passes and the patch modifies a text file
- **THEN** `git apply --binary` SHALL be invoked at the repo root
- **AND** the bundle SHALL progress toward `done` on successful apply

#### Scenario: Binary change is included in the patch

- **WHEN** the worktree diff includes a binary file change
- **THEN** the diff SHALL be extracted with `git diff --binary`
- **AND** `git apply --binary` SHALL be invoked at the repo root

#### Scenario: Patch-apply failure rejects integration

- **WHEN** `git apply --binary` exits non-zero
- **THEN** the main agent SHALL reject integration
- **AND** the bundle status SHALL become `integration_rejected`
- **AND** no `--3way` retry SHALL be attempted

### Requirement: Bundle status transition after integration

A `subagent-worktree` bundle SHALL reach `done` only after integration validation passes and `git apply --binary` succeeds at the repo root. The main agent SHALL call `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done` ONLY after successful patch import.

If the subagent returned `status: "failure"`, the main agent SHALL call `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> subagent_failed`.

If the subagent returned `status: "success"` but integration validation (any reason: undeclared path, protected-path touch, empty diff, patch-apply failure) rejected, the main agent SHALL call `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> integration_rejected`.

#### Scenario: Successful path advances to done only after integration

- **WHEN** a subagent returns `status: "success"` for bundle `B`
- **AND** all integration checks pass and `git apply --binary` succeeds
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> B done`

#### Scenario: Subagent failure advances to subagent_failed

- **WHEN** a subagent returns `status: "failure"` for bundle `B`
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> B subagent_failed`
- **AND** no integration, diff inspection, or patch apply SHALL be performed for `B`

#### Scenario: Integration rejection advances to integration_rejected

- **WHEN** a subagent returns `status: "success"` for bundle `B`
- **AND** any integration check rejects (undeclared path, protected-path touch, empty-diff-on-success, or patch-apply failure)
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> B integration_rejected`

### Requirement: Worktree retention policy

The main agent SHALL clean up worktrees based on the bundle's final status in the current apply invocation:

- On `done`: the worktree SHALL be removed immediately via `git worktree remove <path>`. If `git worktree remove` fails (e.g., due to uncommitted subagent changes that should already have been imported), the main agent SHALL surface the error but SHALL NOT revert the bundle's `done` status.
- On `subagent_failed`: the worktree SHALL be retained at its path at `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/`.
- On `integration_rejected`: the worktree SHALL be retained at its path.

Retention behavior in Phase 1 is fixed and SHALL NOT be configurable. `/specflow.fix_apply` and manual inspection SHALL use the retained worktree path to diagnose failures.

#### Scenario: Successful bundle removes its worktree

- **WHEN** bundle `B` reaches `done`
- **THEN** `git worktree remove .specflow/worktrees/<RUN_ID>/<B>/` SHALL be invoked
- **AND** the worktree SHALL no longer appear in `git worktree list`

#### Scenario: Failed subagent retains worktree

- **WHEN** bundle `B` reaches `subagent_failed`
- **THEN** the worktree at `.specflow/worktrees/<RUN_ID>/<B>/` SHALL remain
- **AND** the worktree SHALL still appear in `git worktree list`

#### Scenario: Integration rejection retains worktree

- **WHEN** bundle `B` reaches `integration_rejected`
- **THEN** the worktree at `.specflow/worktrees/<RUN_ID>/<B>/` SHALL remain

#### Scenario: Retention policy is not configurable in Phase 1

- **WHEN** an operator attempts to override retention via config in Phase 1
- **THEN** the retention behavior SHALL be the fixed rule above
- **AND** no config key SHALL alter cleanup on success or retention on failure

