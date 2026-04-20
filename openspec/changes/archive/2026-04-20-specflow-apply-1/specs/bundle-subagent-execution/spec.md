## ADDED Requirements

### Requirement: Subagent dispatch is opt-in and gated by configuration

The system SHALL expose `apply.subagent_dispatch` in `openspec/config.yaml` with three fields:

- `enabled`: boolean. Default `false`. When `false`, the dispatcher SHALL execute every bundle inline on the main agent, preserving pre-feature behavior.
- `threshold`: non-negative integer. Default `5`. A bundle is subagent-eligible only when its `size_score` is strictly greater than `threshold`.
- `max_concurrency`: positive integer. Default `3`. Upper bound on the number of subagents that SHALL run concurrently within a single dispatch chunk.

When `enabled` is `false`, `threshold` and `max_concurrency` SHALL have no effect on behavior.

When `enabled` is `true` but `task-graph.json` is absent (legacy fallback), the dispatcher SHALL NOT engage — the apply SHALL proceed on the legacy tasks.md path.

#### Scenario: Disabled dispatch falls through to inline execution

- **WHEN** `apply.subagent_dispatch.enabled` is `false`
- **AND** `/specflow.apply` runs with a valid `task-graph.json`
- **THEN** every bundle SHALL be executed inline by the main agent
- **AND** no subagent SHALL be spawned regardless of any bundle's `size_score`

#### Scenario: Default configuration does not change behavior for existing users

- **WHEN** `openspec/config.yaml` does not define `apply.subagent_dispatch`
- **THEN** the dispatcher SHALL behave as if `enabled: false`
- **AND** `/specflow.apply` SHALL execute every bundle inline on the main agent

#### Scenario: Legacy fallback bypasses dispatch even when enabled

- **WHEN** `apply.subagent_dispatch.enabled` is `true`
- **AND** `task-graph.json` is absent
- **THEN** the apply SHALL proceed on the legacy tasks.md path
- **AND** no subagent SHALL be spawned

### Requirement: Bundle subagent-eligibility is derived from size_score

A bundle SHALL be classified as subagent-eligible for the current apply invocation when ALL of the following hold:

1. `apply.subagent_dispatch.enabled` is `true`
2. `task-graph.json` is present and schema-valid
3. The bundle's `size_score` field is present (integer, as computed by `task-planner`)
4. `size_score > apply.subagent_dispatch.threshold`

When any of conditions 1–4 fail for a given bundle, that bundle SHALL be classified as inline-only. In particular, a bundle whose `size_score` field is absent SHALL always be inline-only, regardless of the configured threshold (this preserves backward compatibility for pre-feature `task-graph.json` files — see `task-planner`).

#### Scenario: Bundle above threshold is subagent-eligible when enabled

- **WHEN** dispatch is enabled and a bundle has `size_score = 8` and `threshold = 5`
- **THEN** that bundle SHALL be classified as subagent-eligible

#### Scenario: Bundle at or below threshold is inline-only

- **WHEN** dispatch is enabled and a bundle has `size_score = 5` and `threshold = 5`
- **THEN** that bundle SHALL be classified as inline-only
- **AND** no subagent SHALL be spawned for that bundle

#### Scenario: Missing size_score forces inline-only classification

- **WHEN** dispatch is enabled and a bundle has no `size_score` field
- **THEN** that bundle SHALL be classified as inline-only
- **AND** the classification SHALL NOT depend on the configured threshold

### Requirement: Window-level uniform subagent dispatch

The dispatcher SHALL evaluate subagent-eligibility at the **window** granularity as returned by the existing `selectNextWindow` contract from `task-planner`. For each window:

- If AT LEAST ONE bundle in the window is subagent-eligible, the dispatcher SHALL dispatch the **entire window** as subagents — inline-only bundles in the same window SHALL also be run as subagents. This yields a single uniform code path per window and removes in-window mixed-mode scheduling.
- If NO bundle in the window is subagent-eligible, the dispatcher SHALL execute the entire window inline on the main agent.

The dispatcher SHALL process windows sequentially in the order returned by `selectNextWindow`. The next window SHALL NOT be evaluated until all bundles in the current window have settled (either `done` or the apply has stopped per fail-fast rules).

#### Scenario: Window with one eligible bundle dispatches all bundles as subagents

- **WHEN** the current window contains bundles A, B, C where A is subagent-eligible and B, C are inline-only
- **THEN** A, B, and C SHALL all be dispatched as subagents
- **AND** no bundle in this window SHALL be executed inline on the main agent

#### Scenario: Window with no eligible bundles is executed inline

- **WHEN** no bundle in the current window is subagent-eligible
- **THEN** every bundle in the window SHALL be executed inline by the main agent
- **AND** no subagent SHALL be spawned for this window

#### Scenario: Windows are processed sequentially

- **WHEN** the run has two windows W1 (dispatched as subagents) and W2 (any mode)
- **THEN** W2 SHALL NOT begin execution until every bundle in W1 has settled

### Requirement: Parallel fan-out is bounded by max_concurrency

When a window is dispatched as subagents, the dispatcher SHALL split the window into chunks of size at most `apply.subagent_dispatch.max_concurrency`. Within a chunk, subagents SHALL run in parallel. Chunks SHALL be processed sequentially — the next chunk SHALL NOT begin until every subagent in the current chunk has settled.

The chunking order SHALL be a stable function of bundle order in `task-graph.json`, so two invocations over the same graph produce the same chunk boundaries.

#### Scenario: Window equal to cap runs as single chunk

- **WHEN** a window contains 3 bundles and `max_concurrency = 3`
- **THEN** all 3 subagents SHALL run in parallel as a single chunk

#### Scenario: Window larger than cap is split into chunks

- **WHEN** a window contains 7 bundles and `max_concurrency = 3`
- **THEN** the dispatcher SHALL form chunks of sizes `[3, 3, 1]` in bundle order
- **AND** chunk 2 SHALL NOT begin until every subagent in chunk 1 has settled
- **AND** chunk 3 SHALL NOT begin until every subagent in chunk 2 has settled

#### Scenario: Chunk boundaries are deterministic across runs

- **WHEN** the dispatcher chunks the same window twice with the same `max_concurrency`
- **THEN** both invocations SHALL produce identical chunk boundaries

### Requirement: Context package is assembled per bundle

Before dispatching a bundle's subagent, the main agent SHALL assemble a **context package** containing exactly the following artifacts, read from the current repository state:

1. `openspec/changes/<CHANGE_ID>/proposal.md` — full content, no slicing
2. `openspec/changes/<CHANGE_ID>/design.md` — full content
3. For every `cap` in the bundle's `owner_capabilities`:
   - The baseline spec at `openspec/specs/<cap>/spec.md`, if the file exists
   - The spec-delta at `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md`, if the file exists
4. The bundle slice of `task-graph.json`: the bundle object itself plus the `outputs` of each bundle listed in its `depends_on`
5. The rendered section of `tasks.md` for this bundle (its heading + task checklist)
6. The contents of each artifact listed in the bundle's `inputs`

For condition 3, at least one of the baseline spec or the spec-delta SHALL exist for every `cap`. If both are missing for a given `cap`, the dispatcher SHALL abort the apply with a fail-fast error identifying the missing capability, and SHALL NOT dispatch any subagent in the current window.

The context package SHALL NOT include any other files. In particular, it SHALL NOT include:
- Baseline specs for capabilities not listed in the bundle's `owner_capabilities`
- Other bundles' outputs beyond direct `depends_on`
- Full `task-graph.json` or `tasks.md` (only the bundle slice / section is included)
- `.specflow/runs/` state or other orchestration artifacts

#### Scenario: Context package contains proposal, design, and bundle-scoped specs

- **WHEN** a bundle has `owner_capabilities = ["task-planner", "bundle-subagent-execution"]` and the dispatcher assembles its context package
- **THEN** the package SHALL contain `proposal.md`, `design.md`, any existing baseline spec for each capability, any existing spec-delta for each capability, the bundle slice of `task-graph.json`, the bundle's `tasks.md` section, and the contents of each `inputs` entry
- **AND** the package SHALL NOT contain baseline specs for capabilities outside the bundle's `owner_capabilities`

#### Scenario: Missing capability aborts the apply

- **WHEN** a bundle lists `cap` in `owner_capabilities`
- **AND** neither `openspec/specs/<cap>/spec.md` nor `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md` exists
- **THEN** the dispatcher SHALL abort the apply before dispatching any subagent in the window
- **AND** the error message SHALL identify the missing `cap`
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Bundle with only a new-capability (spec-delta) package is valid

- **WHEN** a bundle lists `cap` in `owner_capabilities` and only the spec-delta at `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md` exists (no baseline)
- **THEN** the context package SHALL include the spec-delta for `cap`
- **AND** the dispatcher SHALL NOT abort

### Requirement: Main agent is the sole caller of specflow-advance-bundle

The main agent SHALL be the sole caller of `specflow-advance-bundle` during subagent dispatch. Subagents SHALL NOT invoke `specflow-advance-bundle` and SHALL NOT directly edit `task-graph.json` or `tasks.md`. The main agent SHALL drive every status transition for subagent-dispatched bundles as follows:

1. The main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> in_progress` BEFORE spawning the subagent.
2. The subagent SHALL perform the bundle's implementation work and return a structured result containing at minimum: `status` (`"success"` | `"failure"`), `produced_artifacts` (list of artifact references), and (on failure) `error` (human-readable message plus any structured diagnostic fields).
3. On a `"success"` result, the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done`.
4. The subagent SHALL NOT invoke `specflow-advance-bundle` directly under any circumstances.
5. The subagent SHALL NOT edit `task-graph.json` or `tasks.md` directly.

This preserves the existing `task-planner` contract that `specflow-advance-bundle` is the sole mutation entry point, serialized through the main agent.

#### Scenario: Main agent records in_progress before dispatch

- **WHEN** the dispatcher is about to spawn a subagent for bundle B
- **THEN** the main agent SHALL have already transitioned B from `pending` to `in_progress` via `specflow-advance-bundle`

#### Scenario: Main agent records done only after subagent success

- **WHEN** a subagent returns `status: "success"` for bundle B
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> B done`

#### Scenario: Subagent does not touch task-graph.json

- **WHEN** a subagent executes a bundle
- **THEN** the subagent's action space SHALL NOT include invoking `specflow-advance-bundle`
- **AND** it SHALL NOT include direct edits to `task-graph.json` or `tasks.md`

### Requirement: Fail-fast on subagent failure settles chunk then stops

The dispatcher SHALL fail fast on any subagent failure in the current chunk, but SHALL first drain the chunk so partial successes are recorded before stopping. When any subagent in the current chunk returns `status: "failure"`:

1. The main agent SHALL wait for every other subagent in the same chunk to settle (return `"success"` or `"failure"`). This ensures partial successes in the chunk are recorded and produced artifacts are not lost.
2. For each sibling subagent that returned `"success"`, the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done`.
3. The failed bundle SHALL remain in `in_progress`. The main agent SHALL NOT attempt to transition it to `done`, `pending`, or any other status as part of the fail-fast handling.
4. After all siblings have settled and their status transitions have been applied, the main agent SHALL STOP the apply immediately. It SHALL NOT begin the next chunk or the next window.
5. The run SHALL remain in `apply_draft`. The main agent SHALL surface the failing subagent's `error` field to the user and document recovery paths (`/specflow.fix_apply` or manual intervention).

This behavior is consistent with the existing `specflow-advance-bundle` fail-fast contract: CLI-mandatory status transitions remain serial through the main agent, no auto-retry is introduced, and no un-dispatched bundles are silently promoted.

#### Scenario: One failure in a chunk records siblings then stops

- **WHEN** a chunk contains subagents X, Y, Z where X returns `"failure"`, Y returns `"success"`, Z returns `"success"` (order-independent)
- **THEN** the main agent SHALL invoke `specflow-advance-bundle <CHANGE_ID> Y done` and `specflow-advance-bundle <CHANGE_ID> Z done`
- **AND** the main agent SHALL NOT invoke `specflow-advance-bundle` for X beyond the earlier `in_progress` transition
- **AND** the main agent SHALL STOP the apply after recording Y and Z
- **AND** subsequent chunks and windows SHALL NOT be dispatched

#### Scenario: Failing bundle remains in_progress after fail-fast

- **WHEN** subagent for bundle X returns `"failure"`
- **THEN** bundle X SHALL remain in `in_progress` in `task-graph.json` after the apply stops
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Fail-fast surfaces subagent error to the user

- **WHEN** a subagent returns `"failure"` with `error: "<message>"`
- **THEN** the main agent SHALL surface `<message>` to the user
- **AND** the guide SHALL cite `/specflow.fix_apply` and manual intervention as recovery paths
