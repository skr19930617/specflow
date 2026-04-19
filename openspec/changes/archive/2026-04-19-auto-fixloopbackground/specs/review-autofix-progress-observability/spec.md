## ADDED Requirements

### Requirement: Auto-fix loop exposes a closed five-value loop-state enum

The auto-fix loop SHALL expose its current progress using a closed five-value `loop_state` enum that is carried in both the `review_completed` observation event payload and in the progress snapshot artifact. The loop is defined as `specflow-review-design autofix-loop` or `specflow-review-apply autofix-loop`. The values SHALL be exactly:

- `starting` — the loop has been invoked but has not yet entered round 1.
- `in_progress` — a fix step for the current round is being performed (the
  main agent is rewriting design/tasks or the apply diff).
- `awaiting_review` — the current round's fix step has completed and the
  review agent is re-reviewing the updated artifacts.
- `terminal_success` — the loop ended with the severity-aware gate satisfied
  (`unresolvedCriticalHighCount == 0`, i.e. the `loop_no_findings` handoff).
- `terminal_failure` — the loop ended in any non-success terminal outcome
  (`loop_with_findings`, `max_rounds_reached`, `no_progress`, or
  `consecutive_failures`).

The loop SHALL additionally expose a `terminal_outcome` field that is `null`
while the loop is non-terminal, and SHALL equal one of
`loop_no_findings`, `loop_with_findings`, `max_rounds_reached`,
`no_progress`, or `consecutive_failures` in the terminal states. No other
`loop_state` or `terminal_outcome` string SHALL be emitted.

#### Scenario: Non-terminal loop state is in the closed set

- **WHEN** a consumer reads a progress snapshot or a `review_completed`
  event payload for an in-flight auto-fix loop
- **THEN** `loop_state` SHALL be exactly one of `starting`, `in_progress`,
  or `awaiting_review`
- **AND** `terminal_outcome` SHALL be `null`

#### Scenario: Terminal loop state is in the closed set

- **WHEN** a consumer reads a progress snapshot or a `review_completed`
  event payload for a terminated auto-fix loop
- **THEN** `loop_state` SHALL be exactly one of `terminal_success` or
  `terminal_failure`
- **AND** `terminal_outcome` SHALL be exactly one of `loop_no_findings`,
  `loop_with_findings`, `max_rounds_reached`, `no_progress`, or
  `consecutive_failures`

#### Scenario: terminal_success maps to loop_no_findings

- **WHEN** the loop's severity-aware gate is satisfied on termination
  (`unresolvedCriticalHighCount(ledger) == 0`)
- **THEN** the terminal snapshot and final `review_completed` event SHALL
  carry `loop_state = "terminal_success"` and `terminal_outcome =
  "loop_no_findings"`

#### Scenario: terminal_failure covers all non-success terminal outcomes

- **WHEN** the loop terminates without satisfying the severity-aware gate
- **THEN** the terminal snapshot and final `review_completed` event SHALL
  carry `loop_state = "terminal_failure"`
- **AND** `terminal_outcome` SHALL identify the specific non-success
  outcome (`loop_with_findings`, `max_rounds_reached`, `no_progress`, or
  `consecutive_failures`)

### Requirement: Per-run progress snapshot lives under the run-artifact store

The auto-fix loop SHALL persist a per-run progress snapshot at a deterministic
path keyed by the run's `run_id` under the existing run-artifact store (see
`run-artifact-store-conformance`). The snapshot path SHALL be distinct per
review phase so that concurrent design and apply loops for the same run do
not overwrite each other, and the loop SHALL NOT write progress snapshots
outside the run-artifact store.

The snapshot schema SHALL carry:

- `schema_version`: an integer identifying the snapshot schema (currently
  `1`).
- `run_id`, `change_id`, `phase` (`"design_review"` or `"apply_review"`).
- `round_index` (1-based integer for the currently active or last-active
  round; `0` before any round has started).
- `max_rounds` (configured `max_autofix_rounds` at loop start).
- `loop_state` and `terminal_outcome` (per the loop-state enum
  requirement).
- A `counters` object with `unresolvedCriticalHigh`, `totalOpen`,
  `resolvedThisRound`, `newThisRound`, and `severitySummary`, all derived
  from the review ledger using the existing helper functions
  (`unresolvedCriticalHighCount` and friends).
- `heartbeat_at`: an ISO 8601 UTC timestamp that SHALL be monotonically
  non-decreasing on each snapshot rewrite for a given `run_id` + `phase`.
- `ledger_round_id`: the ledger round identifier this snapshot
  cross-references (null before round 1 has appended a round summary).

The snapshot SHALL NOT duplicate ledger round data; it SHALL cross-reference
the ledger round via `ledger_round_id`.

#### Scenario: Snapshot path is deterministic from run_id and phase

- **WHEN** an active auto-fix loop for a given `run_id` and `phase` writes
  its progress snapshot
- **THEN** the snapshot SHALL be located at a deterministic path under the
  run-artifact store that is a function of `run_id` and `phase` alone
- **AND** stale snapshots from prior runs of the same change SHALL NOT be
  visible to pollers of the active run via that path

#### Scenario: Snapshot schema fields are complete

- **WHEN** a consumer reads the snapshot JSON
- **THEN** it SHALL contain `schema_version`, `run_id`, `change_id`,
  `phase`, `round_index`, `max_rounds`, `loop_state`, `terminal_outcome`,
  `counters`, `heartbeat_at`, and `ledger_round_id` fields
- **AND** unknown fields SHALL be tolerated for forward compatibility

#### Scenario: Heartbeat timestamps are monotonically non-decreasing

- **WHEN** the loop rewrites the snapshot for the same `run_id` + `phase`
- **THEN** each successive `heartbeat_at` SHALL be greater than or equal to
  the previous one

#### Scenario: Snapshot is not written outside the run-artifact store

- **WHEN** the auto-fix loop writes or rewrites a progress snapshot
- **THEN** it SHALL use the run-artifact store interface exclusively
- **AND** it SHALL NOT write progress snapshots into the change artifact
  store, the ledger file, or any global path

### Requirement: Heartbeat refresh is bounded and stale-threshold driven

The auto-fix loop SHALL refresh the progress snapshot `heartbeat_at` at
least every 30 seconds while the loop is in a non-terminal state, even
when no round transition has occurred. Chat surfaces MAY classify the
loop as `abandoned` when the observed `heartbeat_at` is older than 120
seconds relative to wall-clock time. Both bounds SHALL be overridable via
`openspec/config.yaml` keys `autofix_heartbeat_seconds` (default `30`) and
`autofix_stale_threshold_seconds` (default `120`). Missing or invalid
values SHALL fall back to the defaults using the same pattern documented
by `review-orchestration` for `max_autofix_rounds`.

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

- **WHEN** `openspec/config.yaml` sets
  `autofix_heartbeat_seconds` to a positive integer and
  `autofix_stale_threshold_seconds` to a positive integer greater than or
  equal to `autofix_heartbeat_seconds`
- **THEN** the loop SHALL use the configured values
- **AND** when either value is missing or invalid, the loop SHALL use the
  defaults `30` and `120` respectively

### Requirement: Abrupt termination is classified via stale-heartbeat abandoned rule

Surfaces SHALL classify abrupt termination of the auto-fix loop via the stale-heartbeat rule and SHALL NOT poll the loop process directly. When the auto-fix loop is interrupted or exits before writing a terminal snapshot and emitting a terminal `review_completed` event, a snapshot whose `loop_state` is non-terminal and whose `heartbeat_at` has been stale for more than `autofix_stale_threshold_seconds` SHALL be treated as `abandoned`. Once `abandoned`, a subsequent `/specflow.review_design` or `/specflow.review_apply` invocation SHALL be allowed to resume with a fresh round without blocking on the stale snapshot.

#### Scenario: Interrupted loop is observable as abandoned

- **WHEN** the auto-fix loop is interrupted mid-round (e.g. killed, host
  crash, or network loss)
- **AND** the surface polls the snapshot after the stale threshold has
  elapsed
- **THEN** the snapshot SHALL still show a non-terminal `loop_state`
- **AND** the surface SHALL classify the run as `abandoned`

#### Scenario: Abandoned run does not block a fresh invocation

- **WHEN** a run has been classified as `abandoned`
- **AND** the operator invokes `/specflow.review_design` or
  `/specflow.review_apply` again
- **THEN** the new invocation SHALL generate a new `run_id` and start a
  fresh loop from `loop_state = starting`
- **AND** the new run's progress snapshot SHALL be written under the new
  `run_id`'s artifact path, leaving the old snapshot unreachable via the
  new `run_id`'s deterministic path (no explicit cleanup required)
- **AND** the surface SHALL stop polling the old `run_id` and begin
  polling the new `run_id`'s snapshot path

### Requirement: Authority precedence is ledger > events > snapshot

Consumers SHALL resolve disagreement between the review ledger, the observation event stream, and the progress snapshot using the precedence `ledger > events > snapshot`. The review ledger's round summary is the source of truth for round-level data. Observation events are the authoritative progress signal for surfaces and SHALL be de-duplicated by `event_id`. The progress snapshot is a fast-path reconstruction view; when it disagrees with the ledger, the snapshot SHALL be considered stale and the ledger SHALL win.

#### Scenario: Snapshot vs. ledger disagreement

- **WHEN** a consumer observes that the snapshot's `counters` disagree
  with the current ledger round summary's severity counts
- **THEN** the consumer SHALL treat the ledger values as authoritative
- **AND** the consumer MAY report the snapshot as stale

#### Scenario: Events vs. snapshot disagreement

- **WHEN** a consumer observes that the most recent `review_completed`
  event for the run indicates a terminal `loop_state`
- **AND** the snapshot still shows a non-terminal `loop_state`
- **THEN** the consumer SHALL treat the terminal event as authoritative

#### Scenario: Event stream de-duplication by event_id

- **WHEN** the same `review_completed` event is re-emitted after a
  consumer failure or crash
- **THEN** the consumer SHALL de-duplicate using `event_id`
- **AND** the re-emission SHALL NOT produce a duplicate round progression
  in consumer state

### Requirement: Auto-fix progress contract is surface-agnostic

The auto-fix progress contract SHALL be consumable by any surface adapter
(local chat, remote-api, agent-native, batch). The snapshot schema,
observation event payload extensions, and the polling pattern SHALL NOT
depend on any Claude-specific side channel, SHALL NOT embed transport
details (HTTP, WebSocket), and SHALL be read equally by polling the
run-artifact store or subscribing to the observation event stream
defined by `workflow-observation-events`.

#### Scenario: Surface reads progress via run-artifact store alone

- **WHEN** a surface adapter has only the run-artifact store and the
  observation event stream available
- **THEN** it SHALL be able to reconstruct `loop_state`, `round_index`,
  `counters`, and `terminal_outcome` from those two sources alone

#### Scenario: Contract does not reference Claude-specific channels

- **WHEN** the auto-fix progress contract is inspected
- **THEN** it SHALL NOT reference Claude-specific tools (Bash
  `run_in_background`, `Monitor`, etc.) as contract inputs
- **AND** such tools MAY appear in slash-command guides as surface-level
  implementation guidance, but SHALL NOT be required by this contract
