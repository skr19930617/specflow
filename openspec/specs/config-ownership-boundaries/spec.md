# config-ownership-boundaries Specification

## Purpose
TBD - created by archiving change clarify-config-ownership-boundaries-and-enable-subagent-dispatch-by-default. Update Purpose after archive.
## Requirements
### Requirement: Specflow settings are partitioned into shared workflow policy and local runtime preference

Every specflow-owned setting SHALL be classified into exactly one of two categories, each with a single canonical home file:

- **Shared workflow policy** — settings that govern how the project's workflow runs (review/autofix tuning, apply dispatch policy, project context, future workflow-level knobs). Canonical home: `.specflow/config.yaml`. This file SHALL be committed to the repository.
- **Local runtime / operator preference** — settings scoped to a single developer or machine (main agent selection, review agent selection, local CLI executable resolution, personal/local-only environment overrides). Canonical home: `.specflow/config.env`. This file SHALL be gitignored.

Specflow settings SHALL NOT live in `openspec/config.yaml`. `openspec/config.yaml` is reserved for OpenSpec's own configuration and SHALL NOT be a home for specflow-owned settings.

The classification rule applies only to specflow's own domain. OpenSpec's own settings, third-party tool configuration, and any non-specflow repo-level config surface SHALL NOT be classified by this rule.

#### Scenario: Apply dispatch policy lives in `.specflow/config.yaml`

- **WHEN** a contributor adds or reads `apply.subagent_dispatch.*`
- **THEN** the canonical location SHALL be `.specflow/config.yaml`
- **AND** the location SHALL NOT be `openspec/config.yaml`

#### Scenario: Operator agent selection lives in `.specflow/config.env`

- **WHEN** a contributor adds or reads main/review agent selection or local CLI path resolution
- **THEN** the canonical location SHALL be `.specflow/config.env`
- **AND** that file SHALL be gitignored

#### Scenario: OpenSpec's own settings are out of scope

- **WHEN** a contributor adds or reads an OpenSpec-owned setting (a setting that controls OpenSpec's own behavior, not specflow's)
- **THEN** this rule SHALL NOT apply to that setting
- **AND** OpenSpec retains its own ownership decisions for `openspec/config.yaml`

### Requirement: Borderline settings default to shared with explicit local override

A setting that has both workflow-policy semantics and a per-operator-tunable aspect (a "borderline setting") SHALL be defined in `.specflow/config.yaml` as the shared default. An operator MAY override the value for their own machine via `.specflow/config.env`. When an override is present, the local value SHALL take precedence over the shared default for that operator's apply runs.

This single shared→local override path is the only multi-level precedence supported by this capability. Any further precedence design (e.g., user-scope overrides, environment-specific overrides) is out of scope.

#### Scenario: Shared default applies when no local override is set

- **WHEN** a borderline setting is defined in `.specflow/config.yaml` with value `V`
- **AND** `.specflow/config.env` does not set a local override for that setting
- **THEN** the effective value SHALL be `V`

#### Scenario: Local override supersedes shared default

- **WHEN** a borderline setting is defined in `.specflow/config.yaml` with value `V_shared`
- **AND** `.specflow/config.env` sets a local override with value `V_local`
- **THEN** the effective value SHALL be `V_local`
- **AND** other operators (without the override) SHALL still see `V_shared`

### Requirement: Misplaced specflow settings are ignored with a deprecation warning

When specflow's config loader encounters a specflow-owned setting in a non-canonical location, the loader SHALL ignore that occurrence and SHALL emit a deprecation warning naming the canonical file the operator must move the setting to. The warning SHALL be visible to the operator at apply / workflow startup.

When the same specflow-owned setting is present in **both** the canonical file and a non-canonical file (a duplicate), the value from the canonical file SHALL take precedence and the duplicate SHALL emit a deprecation warning.

This rule supersedes any backward-compatibility read path; specflow SHALL NOT silently honor specflow settings stored in `openspec/config.yaml` after this capability is introduced.

#### Scenario: Specflow setting in `openspec/config.yaml` is ignored and warned

- **WHEN** `openspec/config.yaml` contains `apply.subagent_dispatch.enabled: true` and `.specflow/config.yaml` does not
- **THEN** the loader SHALL ignore the value in `openspec/config.yaml`
- **AND** the loader SHALL emit a deprecation warning identifying `apply.subagent_dispatch.enabled` and naming `.specflow/config.yaml` as the canonical location
- **AND** the effective value SHALL fall back to the documented default

#### Scenario: Duplicate entries: canonical wins, duplicate warned

- **WHEN** `apply.subagent_dispatch.enabled: false` is set in `.specflow/config.yaml`
- **AND** `apply.subagent_dispatch.enabled: true` is set in `openspec/config.yaml`
- **THEN** the effective value SHALL be `false`
- **AND** the loader SHALL emit a deprecation warning naming `openspec/config.yaml` as a non-canonical location for `apply.subagent_dispatch.enabled`

#### Scenario: Operator preference in `.specflow/config.yaml` is ignored and warned

- **WHEN** `.specflow/config.yaml` contains a local-runtime setting (e.g., main agent selection) that the rule classifies as `.specflow/config.env`-only
- **THEN** the loader SHALL ignore that occurrence
- **AND** the loader SHALL emit a deprecation warning naming `.specflow/config.env` as the canonical location for that setting

