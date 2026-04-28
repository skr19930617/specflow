## MODIFIED Requirements

### Requirement: Heartbeat refresh is bounded and stale-threshold driven

The auto-fix loop SHALL refresh the progress snapshot `heartbeat_at` at
least every 30 seconds while the loop is in a non-terminal state, even
when no round transition has occurred. Chat surfaces MAY classify the
loop as `abandoned` when the observed `heartbeat_at` is older than 120
seconds relative to wall-clock time. Both bounds SHALL be overridable via
`.specflow/config.yaml` (the canonical home for shared workflow policy, per `config-ownership-boundaries`) keys `autofix_heartbeat_seconds` (default `30`) and
`autofix_stale_threshold_seconds` (default `120`). Missing or invalid
values SHALL fall back to the defaults using the same pattern documented
by `review-orchestration` for `max_autofix_rounds`. Values found in the legacy `openspec/config.yaml` location SHALL be ignored, with a deprecation warning per `config-ownership-boundaries`.

#### Scenario: Heartbeat is refreshed at least every heartbeat interval

- **WHEN** the auto-fix loop is in a non-terminal `loop_state`
- **THEN** successive snapshot writes for the same `run_id` + `phase`
  SHALL have `heartbeat_at` values no further apart than the configured
  `autofix_heartbeat_seconds` (default `30`)

#### Scenario: Stale heartbeat allows abandoned classification

- **WHEN** a chat surface polls the progress snapshot and observes a
  non-terminal `loop_state` with a `heartbeat_at` older than the
  configured `autofix_stale_threshold_seconds` (default `120`) relative to
  wall-clock time
- **THEN** the surface MAY classify the run as `abandoned`

#### Scenario: Config overrides are honored when valid

- **WHEN** `.specflow/config.yaml` sets
  `autofix_heartbeat_seconds` to a positive integer and
  `autofix_stale_threshold_seconds` to a positive integer greater than or
  equal to `autofix_heartbeat_seconds`
- **THEN** the loop SHALL use the configured values
- **AND** when either value is missing or invalid, the loop SHALL use the
  defaults `30` and `120` respectively
