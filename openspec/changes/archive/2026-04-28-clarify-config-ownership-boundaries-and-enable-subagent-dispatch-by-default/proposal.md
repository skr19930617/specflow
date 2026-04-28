## Why

specflow today scatters its settings across two files with no documented ownership rule, and one of them — `openspec/config.yaml` — is conceptually OpenSpec's territory rather than specflow's:

- specflow-related settings such as `apply.subagent_dispatch.*` and review/autofix tuning currently live inside `openspec/config.yaml`, mixed with OpenSpec's own config.
- Operator-local settings (main/review agent selection, local CLI paths) live in `.specflow/config.env`.
- There is no documented criterion for "which file owns which setting", so contributors cannot tell where to put a new specflow knob.

Compounding this, `apply.subagent_dispatch.enabled` defaults to `false`, even though the dispatcher is now treated as part of the apply execution strategy rather than an optional experiment. With the default off, the feature is effectively dormant — task-graphs and `size_score` exist but the dispatcher never engages unless an operator explicitly opts in.

The right fix is to give specflow its own dedicated home for shared workflow policy, separate from OpenSpec's config, and codify a single ownership rule that classifies every specflow setting. Once the boundary is documented and specflow's settings live under `.specflow/`, flipping `apply.subagent_dispatch.enabled` to default `true` is a routine policy decision rather than an ambiguous one.

## What Changes

- **Establish `.specflow/config.yaml` as the canonical home for specflow's shared workflow policy** — committed to the repo, project-wide, machine-independent. specflow settings SHALL NOT live in `openspec/config.yaml`.
- **Codify the config ownership boundary** with two categories that cover every specflow setting:
  - **Shared workflow policy** → `.specflow/config.yaml` (committed). Settings that govern how the project's workflow runs (review/autofix tuning, apply dispatch policy, project context, future workflow-level knobs).
  - **Local runtime / operator preference** → `.specflow/config.env` (gitignored). Settings scoped to a single developer or machine (main agent selection, review agent selection, local CLI executable resolution).
- **Borderline settings** (workflow-policy semantics but with a per-operator-tunable aspect) default to shared, with a documented local-override path: the value SHALL be defined in `.specflow/config.yaml`; an operator MAY override it via `.specflow/config.env`. (Multi-level precedence beyond this single override path remains out of scope.)
- **Migrate specflow settings out of `openspec/config.yaml`** — `apply.subagent_dispatch.*`, review/autofix tuning, and any other specflow-owned settings move to `.specflow/config.yaml`. Strict misplaced-entry handling: settings found in the wrong file SHALL be ignored and SHALL emit a deprecation warning naming the canonical location; if the same setting appears in both files, the canonical location wins and the duplicate emits a warning.
- **Flip `DEFAULT_DISPATCH_CONFIG.enabled` from `false` to `true`**. The canonical wording for dispatch semantics becomes **"enabled by default, explicit opt-out"** — the prior "opt-in" framing is dropped. Eligibility guards (`task-graph.json` present, `size_score > threshold`) are unchanged. The flip is immediate, with no grace period.
- **Fail fast on auto-engaged dispatch with missing local runtime**: when dispatch engages by default but the operator's local subagent runtime prerequisites are missing or invalid (e.g., agent CLI not found, invalid agent selection in `.specflow/config.env`), the apply SHALL stop with an actionable error pointing to either the local runtime fix or the explicit opt-out (`apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`).
- **Update existing docs / comments / examples / spec scenarios** that assume `enabled: false` is the default or that reference `openspec/config.yaml` as the home for specflow settings.
- **Out of scope** (preserved verbatim from the issue, plus what the redirect rules out): a full redesign of the config system; multi-level env/yaml precedence beyond the single shared→local override path; server-runtime config hierarchy; dispatcher classification rule changes; subagent transport / orchestration implementation changes; classification of OpenSpec's own settings or other repo-level config surfaces (the rule applies to specflow's domain only).

### Migration

The default flip is **immediate, with no grace period or deprecation phase**. On the next apply run after upgrade, repos that have never set `apply.subagent_dispatch.enabled` will see dispatch engage automatically — but only when the existing eligibility guards (`task-graph.json` present, at least one bundle with `size_score > threshold`) are satisfied. Operators who require pre-upgrade behavior must set `enabled: false` explicitly in `.specflow/config.yaml`.

For the file move (`openspec/config.yaml` → `.specflow/config.yaml`), specflow MAY automatically migrate or may rely on operators to relocate settings, but the **read path** SHALL be strict: the canonical file is `.specflow/config.yaml`, settings found in the legacy `openspec/config.yaml` location are ignored, and a deprecation warning SHALL name the canonical file. The change SHALL produce an operator-facing changelog/release-note entry describing both the new default and the new config location.

## Capabilities

### New Capabilities

- `config-ownership-boundaries`: Defines the ownership rule that classifies every specflow setting as either *shared workflow policy* (stored in `.specflow/config.yaml`, committed) or *local runtime / operator preference* (stored in `.specflow/config.env`, gitignored). Specifies the borderline-setting tie-breaker (default to shared, local override allowed), the misplaced-entry handling (ignore + warn), and the exclusion of OpenSpec's own settings from the rule's scope.

### Modified Capabilities

- `bundle-subagent-execution`: Two coordinated changes. (1) The canonical home of `apply.subagent_dispatch.*` moves from `openspec/config.yaml` to `.specflow/config.yaml`; spec text and examples are updated accordingly, and misplaced-entry semantics are inherited from `config-ownership-boundaries`. (2) The default value of `apply.subagent_dispatch.enabled` changes from `false` to `true`, with canonical wording shifting from "opt-in / gated by configuration" to "enabled by default, explicit opt-out". A new scenario covers the missing-local-runtime fail-fast case. Eligibility guards (`task-graph.json` present, `size_score > threshold`) are unchanged.
- `review-orchestration`: Update the spec-level requirement that defines where review configuration is read from. The canonical file moves from `openspec/config.yaml` to `.specflow/config.yaml`; entries left in the legacy file are ignored with a deprecation warning per `config-ownership-boundaries`.
- `review-autofix-progress-observability`: Update the heartbeat-bounds requirement to source `autofix_heartbeat_seconds` and `autofix_stale_threshold_seconds` from `.specflow/config.yaml` instead of `openspec/config.yaml`, with the same legacy-ignore semantics.
- `slash-command-guides`: Update the `/specflow.apply` documentation requirement to reflect the new canonical config file, the default-on dispatch semantics, the explicit opt-out path, and the runtime-prereq fail-fast behavior.

## Impact

- **Code**:
  - `DEFAULT_DISPATCH_CONFIG` (or equivalent constant) in the apply dispatcher: `enabled: false` → `enabled: true`.
  - Config loader: read shared workflow policy from `.specflow/config.yaml` instead of `openspec/config.yaml`; emit deprecation warning when specflow settings are detected in the legacy location.
  - Dispatcher startup path: detect missing/invalid local subagent runtime when default-engaged and fail fast with an actionable error.
  - Inline comments / doc strings describing the previous default or previous config location.
- **Specs**:
  - New spec file `openspec/specs/config-ownership-boundaries/spec.md`.
  - Modified scenarios under `openspec/specs/bundle-subagent-execution/spec.md` (the "Subagent dispatch is opt-in and gated by configuration" requirement and its scenarios that assume `enabled: false` is the default and that reference `openspec/config.yaml` as the home for `apply.subagent_dispatch`).
  - Other specs that reference `openspec/config.yaml` for specflow-owned settings (review-orchestration, review-autofix-progress-observability, slash-command-guides, project-bootstrap-installation, utility-cli-suite) need delta entries only if they specify spec-level requirements about that file path; otherwise they receive doc-only updates.
- **Docs / examples**: Any README, AGENTS.md, slash-command guide, or sample `openspec/config.yaml` that still references specflow settings or presents `enabled: false` as the documented default.
- **Operators**: Two visible behavior changes on next upgrade — (a) dispatch engages automatically when eligibility guards are met, and (b) settings must be relocated from `openspec/config.yaml` to `.specflow/config.yaml`. A deprecation warning at startup makes the second visible.
- **Tests**: Unit tests pinning `DEFAULT_DISPATCH_CONFIG.enabled` and behavioral tests assuming "missing config implies inline-only" need to be updated. Tests that load specflow settings from `openspec/config.yaml` need to be updated to read from `.specflow/config.yaml`. New tests SHALL cover (i) misplaced-entry warning + ignore, (ii) duplicate-entry canonical-wins + warning, (iii) borderline local-override path, and (iv) missing-local-runtime fail-fast on default-engaged dispatch.
