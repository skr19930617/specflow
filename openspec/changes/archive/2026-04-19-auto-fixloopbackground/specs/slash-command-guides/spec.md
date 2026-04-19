## ADDED Requirements

### Requirement: Review guides drive the auto-fix loop via background invocation and progress polling

The generated `specflow.review_design.md` and `specflow.review_apply.md` slash-command guides SHALL invoke the auto-fix loop via a background invocation + progress-polling pattern for chat-style surfaces, and SHALL NOT require the surface to block on a single synchronous Bash call for the entire loop. The auto-fix loop is defined as `specflow-review-design autofix-loop` or `specflow-review-apply autofix-loop`.

Specifically, each guide's "Auto-fix Loop" (or equivalent) section SHALL:

- document resolving the active `run_id` **before** launching the
  background CLI — the same `run_id` the surface already holds from the
  review-orchestration flow that preceded the autofix invocation — and
  passing it to the CLI so the surface can compute the snapshot path for
  polling;
- document launching the CLI with `run_in_background: true` (or the
  surface-native equivalent) rather than as a synchronous blocking Bash
  call;
- document polling the per-run progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events (per `workflow-observation-events`)
  between rounds, keyed by the known `run_id`;
- document rendering a per-round progress update to the operator that
  references `round_index`, `max_rounds`, `loop_state`, and the severity
  `counters` from the snapshot / event payload;
- document finalizing the loop only when a terminal `loop_state`
  (`terminal_success` or `terminal_failure`) is observed or the
  `abandoned` classification rule (stale `heartbeat_at` beyond
  `autofix_stale_threshold_seconds`) is triggered;
- document the poller switchover rule for retry after `abandoned`: a
  fresh invocation generates a new `run_id`; the surface SHALL stop
  polling the old `run_id` and begin polling the new `run_id`'s snapshot
  path, with no state migration required;
- avoid documenting any loop-step alternative that relies solely on
  `stderr` lines or on parsing the final `LOOP_JSON` to display
  intermediate progress.

The guides MAY describe `stderr` output as a secondary human aid, but
SHALL NOT treat it as the contract source of progress.

#### Scenario: Review-design guide documents background + polling for autofix

- **WHEN** generated `specflow.review_design.md` is read
- **THEN** the Auto-fix Loop section SHALL document invoking
  `specflow-review-design autofix-loop <CHANGE_ID>` via a background
  invocation (e.g. `run_in_background: true` for chat surfaces)
- **AND** it SHALL document polling the progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events between rounds
- **AND** it SHALL NOT document a synchronous blocking Bash invocation as
  the only auto-fix loop path

#### Scenario: Review-apply guide documents background + polling for autofix

- **WHEN** generated `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document invoking
  `specflow-review-apply autofix-loop <CHANGE_ID>` via a background
  invocation (e.g. `run_in_background: true` for chat surfaces)
- **AND** it SHALL document polling the progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events between rounds
- **AND** it SHALL NOT document a synchronous blocking Bash invocation as
  the only auto-fix loop path

#### Scenario: Review guides render per-round progress to the operator

- **WHEN** generated `specflow.review_design.md` or
  `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document rendering a per-round
  progress update to the operator that references `round_index`,
  `max_rounds`, `loop_state`, and the severity `counters` from the
  snapshot or the event payload
- **AND** it SHALL NOT rely solely on `stderr` lines or on the final
  `LOOP_JSON` return value to display mid-loop progress

#### Scenario: Review guides finalize only on terminal or abandoned state

- **WHEN** generated `specflow.review_design.md` or
  `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document that the chat surface
  finalizes the loop only when a terminal `loop_state`
  (`terminal_success` or `terminal_failure`) is observed in the snapshot
  or the event stream
- **AND** it SHALL document the `abandoned` classification rule based on
  the stale-`heartbeat_at` threshold defined by
  `review-autofix-progress-observability`
- **AND** it SHALL document that a subsequent re-invocation is allowed
  when a prior run has been classified as `abandoned`
