## MODIFIED Requirements

### Requirement: Review configuration is read from `openspec/config.yaml` with stable defaults

The review runtime SHALL read review configuration from `.specflow/config.yaml` (the canonical home for shared workflow policy, per `config-ownership-boundaries`) and SHALL fall back to built-in defaults when the keys are absent or invalid.

Review configuration found in the legacy `openspec/config.yaml` location SHALL be ignored, with a one-time per-process deprecation warning naming the key and the canonical file (per `config-ownership-boundaries`).

#### Scenario: Missing config uses defaults

- **WHEN** review configuration cannot be read from `.specflow/config.yaml`
- **THEN** the runtime SHALL use `diff_warn_threshold = 1000`,
  `max_autofix_rounds = 4`, `autofix_heartbeat_seconds = 30`, and
  `autofix_stale_threshold_seconds = 120`

#### Scenario: Invalid max-autofix values fall back to the default

- **WHEN** `max_autofix_rounds` is not an integer in the range `1..10`
- **THEN** the runtime SHALL use `max_autofix_rounds = 4`

#### Scenario: Review keys in `openspec/config.yaml` are ignored with a warning

- **WHEN** `max_autofix_rounds` is set in `openspec/config.yaml` but absent from `.specflow/config.yaml`
- **THEN** the runtime SHALL ignore the value in `openspec/config.yaml`
- **AND** the runtime SHALL emit a deprecation warning naming `.specflow/config.yaml` as the canonical location for `max_autofix_rounds`
- **AND** the runtime SHALL fall back to the documented default
