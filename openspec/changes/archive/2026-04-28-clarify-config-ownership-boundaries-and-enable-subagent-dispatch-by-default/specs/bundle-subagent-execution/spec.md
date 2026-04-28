## MODIFIED Requirements

### Requirement: Subagent dispatch is opt-in and gated by configuration

The system SHALL expose `apply.subagent_dispatch` in `.specflow/config.yaml` (the canonical home for shared workflow policy, per `config-ownership-boundaries`) with three fields:

- `enabled`: boolean. **Default `true`**. When `true`, the dispatcher SHALL engage whenever the eligibility guards (`task-graph.json` present, at least one bundle with `size_score > threshold`) are satisfied. When `false`, the dispatcher SHALL execute every bundle inline on the main agent. Operators MAY explicitly opt out by setting `enabled: false`.
- `threshold`: non-negative integer. Default `5`. A bundle is subagent-eligible only when its `size_score` is strictly greater than `threshold`.
- `max_concurrency`: positive integer. Default `3`. Upper bound on the number of subagents that SHALL run concurrently within a single dispatch chunk.

The canonical wording for dispatch semantics is **"enabled by default, explicit opt-out"**. The prior "opt-in" framing is dropped; the requirement name is retained for archive continuity but the normative behavior matches the new default.

When `enabled` is `false`, `threshold` and `max_concurrency` SHALL have no effect on behavior.

When `enabled` is `true` but `task-graph.json` is absent (legacy fallback), the dispatcher SHALL NOT engage — the apply SHALL proceed on the legacy tasks.md path.

The `apply.subagent_dispatch.*` setting SHALL NOT be read from `openspec/config.yaml`. Per `config-ownership-boundaries`, an occurrence in `openspec/config.yaml` SHALL be ignored and SHALL emit a deprecation warning.

#### Scenario: Default configuration engages dispatch when guards are satisfied

- **WHEN** `.specflow/config.yaml` does not define `apply.subagent_dispatch`
- **AND** `/specflow.apply` runs with a valid `task-graph.json` containing at least one bundle whose `size_score > threshold`
- **THEN** the dispatcher SHALL engage
- **AND** subagent-eligible bundles SHALL be dispatched as subagents

#### Scenario: Default configuration is inline when no bundle is eligible

- **WHEN** `.specflow/config.yaml` does not define `apply.subagent_dispatch`
- **AND** `/specflow.apply` runs with a valid `task-graph.json` in which no bundle has `size_score > threshold`
- **THEN** every bundle SHALL be executed inline by the main agent
- **AND** no subagent SHALL be spawned

#### Scenario: Explicit opt-out preserves inline-only behavior

- **WHEN** `.specflow/config.yaml` sets `apply.subagent_dispatch.enabled: false`
- **AND** `/specflow.apply` runs with a valid `task-graph.json`
- **THEN** every bundle SHALL be executed inline by the main agent
- **AND** no subagent SHALL be spawned regardless of any bundle's `size_score`

#### Scenario: Legacy fallback bypasses dispatch even when enabled

- **WHEN** `apply.subagent_dispatch.enabled` is `true` (default or explicit)
- **AND** `task-graph.json` is absent
- **THEN** the apply SHALL proceed on the legacy tasks.md path
- **AND** no subagent SHALL be spawned

#### Scenario: `apply.subagent_dispatch` in `openspec/config.yaml` is ignored and warned

- **WHEN** `apply.subagent_dispatch.enabled` is set in `openspec/config.yaml` (not in `.specflow/config.yaml`)
- **THEN** the value in `openspec/config.yaml` SHALL be ignored
- **AND** the dispatcher SHALL behave as if `apply.subagent_dispatch.enabled` is unset (effective default `true`)
- **AND** a deprecation warning SHALL be emitted naming `.specflow/config.yaml` as the canonical location

## ADDED Requirements

### Requirement: Default-engaged dispatch fails fast on missing local subagent runtime

When the dispatcher engages by default (i.e., `apply.subagent_dispatch.enabled` is unset or `true`) and a window contains at least one subagent-eligible bundle, the apply SHALL verify that the operator's local subagent runtime prerequisites are satisfied **before** spawning any subagent for that window. The prerequisites are:

1. The agent CLI required by the local runtime selection in `.specflow/config.env` is resolvable on the operator's `PATH` (or at the configured absolute path).
2. The local runtime selection in `.specflow/config.env` references a known, valid agent identifier.

If any prerequisite is unsatisfied, the apply SHALL stop with a fail-fast error before any subagent is spawned. The error message SHALL:

- Identify the missing/invalid prerequisite (which CLI is unresolvable, or which selection is invalid).
- Cite the canonical fix path: either resolve the local runtime issue in `.specflow/config.env`, or explicitly opt out by setting `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`.
- Leave the run in `apply_draft` (no implicit fallback to inline execution).

The dispatcher SHALL NOT silently fall back to inline execution on missing local runtime, because doing so would mask operator misconfiguration introduced by the default-engaged dispatch.

#### Scenario: Missing agent CLI fails fast with actionable error

- **WHEN** dispatch engages by default and a window contains a subagent-eligible bundle
- **AND** the agent CLI required by `.specflow/config.env` is not resolvable on the operator's `PATH`
- **THEN** the apply SHALL stop before spawning any subagent
- **AND** the error message SHALL identify the unresolvable CLI
- **AND** the error message SHALL cite both the local-runtime fix and the explicit opt-out (`apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`)
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Invalid agent selection fails fast with actionable error

- **WHEN** dispatch engages by default and a window contains a subagent-eligible bundle
- **AND** `.specflow/config.env` contains an invalid main agent or review agent selection
- **THEN** the apply SHALL stop before spawning any subagent
- **AND** the error message SHALL identify the invalid selection
- **AND** the error message SHALL cite both the local-runtime fix and the explicit opt-out
- **AND** the run SHALL remain in `apply_draft`

#### Scenario: Explicit opt-out bypasses the runtime check

- **WHEN** `.specflow/config.yaml` sets `apply.subagent_dispatch.enabled: false`
- **AND** the operator's local subagent runtime prerequisites are unsatisfied
- **THEN** the apply SHALL NOT perform the runtime check
- **AND** the apply SHALL proceed inline without error

#### Scenario: No eligible bundle skips the runtime check

- **WHEN** dispatch engages by default but the current window contains no subagent-eligible bundle
- **THEN** the apply SHALL NOT perform the runtime check for that window
- **AND** the window SHALL execute inline
