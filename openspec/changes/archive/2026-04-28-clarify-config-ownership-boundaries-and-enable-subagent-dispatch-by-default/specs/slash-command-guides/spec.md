## MODIFIED Requirements

### Requirement: `/specflow.apply` Step 1 documents the subagent dispatch decision

The generated `specflow.apply` guide SHALL, in "Step 1: Apply Draft and Implement", document the subagent-vs-inline decision made by the dispatcher for each window:

- The decision SHALL be described as a function of `apply.subagent_dispatch.enabled`, each bundle's `size_score`, and `apply.subagent_dispatch.threshold`.
- The guide SHALL state that a window with AT LEAST ONE subagent-eligible bundle SHALL dispatch the **entire window** as subagents (uniform per-window dispatch), and a window with NO subagent-eligible bundle SHALL execute inline on the main agent.
- The guide SHALL state that a bundle lacking a `size_score` field is always inline-only (backward compatibility for pre-feature `task-graph.json`).
- The guide SHALL state that when `apply.subagent_dispatch.enabled` is `true` (the default), the dispatcher engages whenever the eligibility guards are satisfied; when `false` (explicit opt-out), every bundle SHALL be executed inline on the main agent.
- The guide SHALL state that subagent dispatch policy lives in `.specflow/config.yaml` (the canonical home for shared workflow policy, per `config-ownership-boundaries`); legacy entries in `openspec/config.yaml` SHALL be ignored with a deprecation warning.
- The guide SHALL state that when dispatch engages by default and a window contains a subagent-eligible bundle, the dispatcher SHALL verify local subagent runtime prerequisites (CLI availability and valid agent identifiers in `.specflow/config.env`) before spawning any subagent, and SHALL fail fast with an actionable error citing both fix paths (resolve the local runtime, or set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`).

#### Scenario: Generated apply guide documents the window-level dispatch rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL explicitly describe the three conditions under which a window is dispatched as subagents: (a) `enabled: true`, (b) a present-and-valid `task-graph.json`, and (c) at least one bundle in the window with `size_score > threshold`
- **AND** it SHALL state that a mixed window (some eligible, some not) dispatches ALL bundles as subagents
- **AND** it SHALL state that a window with zero eligible bundles executes inline on the main agent

#### Scenario: Generated apply guide documents the default-on dispatch

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** it SHALL state that subagent dispatch is configured via `apply.subagent_dispatch.enabled` in `.specflow/config.yaml`
- **AND** it SHALL state that the default is `true` (enabled by default, explicit opt-out)
- **AND** it SHALL document the explicit opt-out path: setting `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`

#### Scenario: Generated apply guide documents the runtime-prereq fail-fast

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** it SHALL document that when default-engaged dispatch is about to spawn subagents in a window, a runtime check verifies the local subagent runtime
- **AND** it SHALL document that on failure the apply stops with an error naming both fix paths (resolve `.specflow/config.env`, or explicit opt-out in `.specflow/config.yaml`)

#### Scenario: Generated apply guide documents the size_score backward-compatibility rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that a bundle with no `size_score` field is classified as inline-only regardless of the configured threshold
