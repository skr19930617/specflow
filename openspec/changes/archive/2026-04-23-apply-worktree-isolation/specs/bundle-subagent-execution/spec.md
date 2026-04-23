## ADDED Requirements

### Requirement: Bundle execution mode is derived from subagent-eligibility

The dispatcher SHALL assign each bundle exactly one of two execution modes when `/specflow.apply` begins a window:

- `inline-main`: the bundle is implemented directly by the main agent in the primary workspace.
- `subagent-worktree`: the bundle is dispatched to a subagent running inside a dedicated ephemeral git worktree, as defined by the `apply-worktree-integration` capability.

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
3. `git apply --binary` at the repo root exited zero.

If any of 1–3 fails, the bundle SHALL transition to one of the new terminal-for-this-invocation statuses defined in `task-planner` (`subagent_failed` for failed 1; `integration_rejected` for failed 2 or 3), per `apply-worktree-integration`. The main agent SHALL NOT silently record `done` on an unverified or unimported subagent success.

For `inline-main` bundles, this requirement does NOT apply; inline bundles reach `done` under the existing completion rules.

#### Scenario: Subagent success alone does not reach done

- **WHEN** a `subagent-worktree` bundle's subagent returns `status: "success"`
- **AND** integration validation or patch-apply has not yet been executed
- **THEN** the main agent SHALL NOT invoke `specflow-advance-bundle ... done`

#### Scenario: Done is reached only after successful integration

- **WHEN** a `subagent-worktree` bundle's subagent returns `status: "success"`
- **AND** integration validation passes and `git apply --binary` succeeds
- **THEN** the main agent SHALL invoke `specflow-advance-bundle ... done`

#### Scenario: Inline-main completion rules are unchanged

- **WHEN** a bundle is assigned `inline-main`
- **THEN** this requirement SHALL NOT apply
- **AND** the bundle SHALL reach `done` under the existing inline completion rules

## MODIFIED Requirements

### Requirement: Fail-fast on subagent failure settles chunk then stops

The dispatcher SHALL fail fast on any subagent failure or integration rejection in the current chunk, but SHALL first drain the chunk so partial successes are recorded before stopping. When any subagent in the current chunk returns `status: "failure"`, or any `subagent-worktree` bundle in the chunk is rejected during main-agent integration:

1. The main agent SHALL wait for every other subagent in the same chunk to settle (return `"success"` or `"failure"`) and for each success to be processed through integration. This ensures partial successes in the chunk are recorded and produced artifacts are not lost.
2. For each sibling subagent whose integration succeeded, the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done`.
3. The failing bundle SHALL be transitioned via `specflow-advance-bundle` to the appropriate terminal-for-this-invocation status, per `apply-worktree-integration`:
   - `subagent_failed` when the subagent returned `status: "failure"`.
   - `integration_rejected` when the subagent returned `status: "success"` but main-agent integration validation or patch-apply rejected.
4. After all siblings have settled and their status transitions have been applied, the main agent SHALL STOP the apply immediately. It SHALL NOT begin the next chunk or the next window.
5. The run SHALL remain in `apply_draft`. The main agent SHALL surface the failure reason to the user (the subagent's `error` for `subagent_failed`; the specific integration-rejection cause for `integration_rejected`) and document recovery paths (`/specflow.fix_apply` using the retained worktree, or manual intervention).

This behavior is consistent with the existing `specflow-advance-bundle` fail-fast contract: CLI-mandatory status transitions remain serial through the main agent, no auto-retry is introduced, and no un-dispatched bundles are silently promoted.

#### Scenario: One failure in a chunk records siblings then stops

- **WHEN** a chunk contains subagents X, Y, Z where X returns `"failure"`, Y returns `"success"` (integration ok), Z returns `"success"` (integration ok)
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> Y done` and `specflow-advance-bundle <CHANGE_ID> Z done`
- **AND** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> X subagent_failed`
- **AND** the main agent SHALL STOP the apply after recording Y, Z, and X
- **AND** subsequent chunks and windows SHALL NOT be dispatched

#### Scenario: Integration rejection in chunk settles siblings then stops

- **WHEN** a chunk contains subagents X, Y where X returns `"success"` but integration is rejected, and Y returns `"success"` with integration ok
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> Y done`
- **AND** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> X integration_rejected`
- **AND** the main agent SHALL STOP the apply after recording both transitions
- **AND** subsequent chunks and windows SHALL NOT be dispatched

#### Scenario: Failing bundle settles to a terminal-for-invocation status

- **WHEN** subagent for bundle X returns `"failure"`
- **THEN** bundle X SHALL have status `"subagent_failed"` in `task-graph.json` after the apply stops
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Integration-rejected bundle settles to integration_rejected

- **WHEN** subagent for bundle X returns `"success"` but main-agent integration rejects
- **THEN** bundle X SHALL have status `"integration_rejected"` in `task-graph.json` after the apply stops
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Fail-fast surfaces the failure reason to the user

- **WHEN** a subagent returns `"failure"` with `error: "<message>"`
- **THEN** the main agent SHALL surface `<message>` to the user
- **AND** the guide SHALL cite `/specflow.fix_apply` (using the retained worktree) and manual intervention as recovery paths

- **WHEN** an integration is rejected for a specific reason (undeclared path, protected-path touch, empty-diff-on-success, or patch-apply failure)
- **THEN** the main agent SHALL surface the specific reason to the user
- **AND** the guide SHALL cite `/specflow.fix_apply` and manual worktree inspection as recovery paths
