## MODIFIED Requirements

### Requirement: Bundle execution mode is derived from subagent-eligibility

The dispatcher SHALL assign each bundle exactly one of two execution modes when `/specflow.apply` begins a window:

- `inline-main`: the bundle is implemented directly by the main agent in the **main-session worktree** at `.specflow/worktrees/<CHANGE_ID>/main/` (formerly referred to as "the primary workspace"). The user's repository working tree SHALL NOT be used as the primary workspace.
- `subagent-worktree`: the bundle is dispatched to a subagent running inside a dedicated ephemeral git worktree at `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`, as defined by the `apply-worktree-integration` capability.

The mode assignment rule SHALL be:

- A bundle classified as **subagent-eligible** (per the existing "Bundle subagent-eligibility is derived from size_score" requirement) SHALL be assigned `subagent-worktree`.
- A bundle classified as **inline-only** SHALL be assigned `inline-main`.

No third execution mode SHALL be introduced in this phase. In particular, a dispatched subagent without an isolated worktree (historically `subagent-shared`) SHALL NOT be a supported mode.

Dispatch signals SHALL remain limited to the existing eligibility rule (`apply.subagent_dispatch.enabled = true` and `size_score > threshold`). No additional signals such as side-effect risk, lockfile/codegen touches, or changed-path count SHALL influence mode assignment in this phase.

#### Scenario: Eligible bundle routes to subagent-worktree

- **WHEN** dispatch is enabled and a bundle has `size_score = 8` and `threshold = 5`
- **THEN** the bundle SHALL be assigned execution mode `subagent-worktree`

#### Scenario: Ineligible bundle routes to inline-main

- **WHEN** a bundle is classified as inline-only (for any reason: dispatch disabled, `size_score <= threshold`, missing `size_score`, or task-graph.json absent)
- **THEN** the bundle SHALL be assigned execution mode `inline-main`

#### Scenario: Inline-main executes inside the main-session worktree

- **WHEN** a bundle is assigned execution mode `inline-main`
- **THEN** the main agent SHALL perform that bundle's edits inside `.specflow/worktrees/<CHANGE_ID>/main/`
- **AND** SHALL NOT modify the user's repository working tree

#### Scenario: Subagent-shared is not a supported mode

- **WHEN** the dispatcher assigns execution mode
- **THEN** the set of possible modes SHALL be exactly `{"inline-main", "subagent-worktree"}`
- **AND** a dispatched subagent executing without a dedicated worktree SHALL NOT occur

#### Scenario: No extra dispatch signals influence mode

- **WHEN** the dispatcher assigns execution mode for a bundle
- **THEN** the decision SHALL depend only on the existing subagent-eligibility rule
- **AND** signals such as side-effect risk, lockfile touches, or changed-path count SHALL NOT be consulted in this phase

### Requirement: Bundle `done` requires main-agent integration success for subagent-worktree mode

For every bundle assigned execution mode `subagent-worktree`, the main agent SHALL NOT invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done` on a subagent `status: "success"` alone. The main agent SHALL first run the integration authority contract defined in `apply-worktree-integration` (diff inspection, artifact cross-check, protected-path check, empty-diff-on-success check, and patch-apply).

A `subagent-worktree` bundle SHALL reach `done` if and only if:

1. The subagent returned `status: "success"`, AND
2. Integration validation passed, AND
3. `git apply --binary` against the **main-session worktree** at `.specflow/worktrees/<CHANGE_ID>/main/` exited zero.

If any of 1–3 fails, the bundle SHALL transition to one of the new terminal-for-this-invocation statuses defined in `task-planner` (`subagent_failed` for failed 1; `integration_rejected` for failed 2 or 3), per `apply-worktree-integration`. The main agent SHALL NOT silently record `done` on an unverified or unimported subagent success. The user's repository working tree SHALL NOT be the patch-apply target.

For `inline-main` bundles, this requirement does NOT apply; inline bundles reach `done` under the existing completion rules but execute inside the main-session worktree per the execution-mode requirement above.

#### Scenario: Subagent success alone does not reach done

- **WHEN** a `subagent-worktree` bundle's subagent returns `status: "success"`
- **AND** integration validation or patch-apply has not yet been executed
- **THEN** the main agent SHALL NOT invoke `specflow-advance-bundle ... done`

#### Scenario: Done is reached only after successful integration into the main-session worktree

- **WHEN** a `subagent-worktree` bundle's subagent returns `status: "success"`
- **AND** integration validation passes and `git apply --binary` against `.specflow/worktrees/<CHANGE_ID>/main/` succeeds
- **THEN** the main agent SHALL invoke `specflow-advance-bundle ... done`

#### Scenario: User repo is never the integration target

- **WHEN** integration succeeds for a `subagent-worktree` bundle
- **THEN** the patch SHALL have been applied to the main-session worktree
- **AND** the user's repository working tree SHALL remain untouched by the patch

#### Scenario: Inline-main completion rules are unchanged

- **WHEN** a bundle is assigned `inline-main`
- **THEN** this requirement SHALL NOT apply
- **AND** the bundle SHALL reach `done` under the existing inline completion rules
