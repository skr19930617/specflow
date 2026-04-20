## ADDED Requirements

### Requirement: `/specflow.apply` Step 1 documents the subagent dispatch decision

The generated `specflow.apply` guide SHALL, in "Step 1: Apply Draft and Implement", document the subagent-vs-inline decision made by the dispatcher for each window:

- The decision SHALL be described as a function of `apply.subagent_dispatch.enabled`, each bundle's `size_score`, and `apply.subagent_dispatch.threshold`.
- The guide SHALL state that a window with AT LEAST ONE subagent-eligible bundle SHALL dispatch the **entire window** as subagents (uniform per-window dispatch), and a window with NO subagent-eligible bundle SHALL execute inline on the main agent.
- The guide SHALL state that a bundle lacking a `size_score` field is always inline-only (backward compatibility for pre-feature `task-graph.json`).
- The guide SHALL state that when `apply.subagent_dispatch.enabled` is `false` (the default) the dispatcher SHALL NOT engage and every bundle SHALL be executed inline on the main agent, preserving pre-feature behavior.

#### Scenario: Generated apply guide documents the window-level dispatch rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL explicitly describe the three conditions under which a window is dispatched as subagents: (a) `enabled: true`, (b) a present-and-valid `task-graph.json`, and (c) at least one bundle in the window with `size_score > threshold`
- **AND** it SHALL state that a mixed window (some eligible, some not) dispatches ALL bundles as subagents
- **AND** it SHALL state that a window with zero eligible bundles executes inline on the main agent

#### Scenario: Generated apply guide documents the opt-in default

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** it SHALL state that subagent dispatch is opt-in via `apply.subagent_dispatch.enabled` in `openspec/config.yaml`
- **AND** it SHALL state that the default is `false`, which preserves the pre-feature single-agent behavior

#### Scenario: Generated apply guide documents the size_score backward-compatibility rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that a bundle with no `size_score` field is classified as inline-only regardless of the configured threshold

### Requirement: `/specflow.apply` documents the context-packaging contract for subagents

The generated `specflow.apply` guide SHALL document the context package the main agent assembles per subagent-dispatched bundle. The package SHALL be described as containing exactly:

1. `openspec/changes/<CHANGE_ID>/proposal.md` (full content)
2. `openspec/changes/<CHANGE_ID>/design.md` (full content)
3. For each `cap` in the bundle's `owner_capabilities`: the baseline spec at `openspec/specs/<cap>/spec.md` (if it exists) and the spec-delta at `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md` (if it exists)
4. The bundle slice of `task-graph.json` (bundle object + `outputs` of direct `depends_on`)
5. The bundle's section of `tasks.md`
6. The contents of each artifact listed in the bundle's `inputs`

The guide SHALL explicitly state that at least one of the baseline spec or spec-delta SHALL exist for every `cap`, and that if both are missing the apply SHALL abort with a fail-fast error identifying the missing capability.

#### Scenario: Generated apply guide enumerates the six context-package items

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL enumerate, in order, the six categories of content included in a subagent's context package (proposal.md, design.md, per-capability specs, bundle slice of task-graph.json, bundle's section of tasks.md, bundle inputs)

#### Scenario: Generated apply guide documents the missing-capability abort rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that if a bundle's `owner_capabilities` contains a `cap` for which neither baseline spec nor spec-delta exists, the apply SHALL abort before dispatching any subagent in the window
- **AND** it SHALL state that the run remains in `apply_draft` on this abort

### Requirement: `/specflow.apply` documents chunked parallel fan-out and fail-fast semantics

The generated `specflow.apply` guide SHALL describe the chunked parallel fan-out used when a window is dispatched as subagents:

- Windows larger than `apply.subagent_dispatch.max_concurrency` SHALL be split into sequential chunks of size ≤ `max_concurrency`.
- Within a chunk, subagents run in parallel. The next chunk SHALL NOT begin until every subagent in the current chunk has settled.
- If any subagent in the current chunk returns `"failure"`, the main agent SHALL wait for every sibling in the same chunk to settle, SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done` for each success, and SHALL NOT transition the failed bundle beyond the pre-dispatch `in_progress` state. After settling, the apply SHALL STOP with the run remaining in `apply_draft`.
- The guide SHALL cite `/specflow.fix_apply` and manual intervention as the documented recovery paths.
- The guide SHALL explicitly state that `specflow-advance-bundle` remains the sole mutation entry point and is invoked only by the main agent — subagents SHALL NOT invoke `specflow-advance-bundle` and SHALL NOT directly edit `task-graph.json` or `tasks.md`.

#### Scenario: Generated apply guide describes chunked fan-out bounded by max_concurrency

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL describe the chunking rule: windows larger than `apply.subagent_dispatch.max_concurrency` are split into sequential chunks of size ≤ `max_concurrency` and chunks run sequentially while subagents within a chunk run in parallel

#### Scenario: Generated apply guide describes the fail-fast settle-then-stop rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL describe that on any subagent failure the main agent waits for sibling subagents in the same chunk to settle, records `done` for each success via `specflow-advance-bundle`, leaves the failed bundle in `in_progress`, and then STOPs the apply with the run remaining in `apply_draft`

#### Scenario: Generated apply guide preserves sole-mutation-entry-point rule for subagents

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that subagents SHALL NOT invoke `specflow-advance-bundle` and SHALL NOT edit `task-graph.json` or `tasks.md` directly
- **AND** the main agent SHALL be the sole caller of `specflow-advance-bundle`
