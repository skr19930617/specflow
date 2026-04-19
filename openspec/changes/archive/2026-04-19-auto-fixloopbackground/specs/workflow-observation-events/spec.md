## MODIFIED Requirements

### Requirement: Per-event payload schemas are fully defined by this spec

For every `event_kind` in the catalog, this spec SHALL enumerate the concrete `payload` fields, nullable envelope fields for that kind, and the allowed outcome/status values. Consumers SHALL be able to interpret every event purely from this spec without reading core implementation.

The per-kind schemas SHALL be:

- **`run_started`**: `payload = { source: { provider, reference }, title }`. Envelope: `source_phase = null`, `target_phase = <initial phase>`, `causal_context = null`.
- **`run_suspended`**: `payload = { reason: string }`. Envelope: `source_phase = <phase when suspended>`, `target_phase = null`.
- **`run_resumed`**: `payload = {}`. Envelope: `source_phase = null`, `target_phase = <phase resumed into>`.
- **`run_terminal`**: `payload = { status: "approved" | "decomposed" | "rejected", reason: string | null }`. Envelope: `source_phase = <last active phase>`, `target_phase = <terminal phase>`.
- **`phase_entered`**: `payload = { triggered_event: string }`. Envelope requires both `source_phase` and `target_phase`.
- **`phase_completed`**: `payload = { outcome: "advanced" | "bypassed" }`. Envelope requires both phase fields.
- **`phase_blocked`**: `payload = { reason: "gate_open" | "await_user" | "await_agent" }`. Envelope requires `source_phase`; `target_phase = null`.
- **`phase_reopened`**: `payload = { reason: string }`. Envelope requires both phase fields (phase reopened becomes `target_phase`).
- **`gate_opened`**: `payload = { gate_kind: "approval" | "clarify" | "review_decision" }`. `gate_ref` required.
- **`gate_resolved`**: `payload = { resolution: "approved" | "answered" | "changes_requested", by_actor: string }`. `gate_ref` required. Mapping: `approval + response="accept"` → `"approved"`; `clarify + response="clarify_response"` → `"answered"`; `review_decision + response="accept"` → `"approved"`; `review_decision + response="request_changes"` → `"changes_requested"`.
- **`gate_rejected`**: `payload = { resolution: "rejected", by_actor: string, reason: string | null }`. `gate_ref` required. Emitted for `approval + response="reject"` and `review_decision + response="reject"`.
- **`artifact_written`**: `payload = { path: string, bytes: integer, content_hash: string | null }`. `artifact_ref` required.
- **`review_completed`**: `payload = { outcome: "approved" | "changes_requested" | "rejected" | "autofix_in_progress", reviewer: string, score: number | null, autofix: AutofixRoundPayload | null }`. `artifact_ref` optional; `bundle_ref` SHALL be set when the review belongs to a bundle. The `autofix` field SHALL be present (non-null) whenever the event is emitted by the auto-fix loop (`specflow-review-design autofix-loop` or `specflow-review-apply autofix-loop`), and SHALL be `null` for every non-autofix review completion. The `"autofix_in_progress"` outcome value is reserved exclusively for non-terminal autofix emissions (where `autofix.loop_state ∈ {in_progress, awaiting_review}`); terminal autofix emissions and all non-autofix review completions SHALL use one of `"approved"`, `"changes_requested"`, or `"rejected"`. `AutofixRoundPayload` SHALL carry `{ round_index: integer, max_rounds: integer, loop_state: "starting" | "in_progress" | "awaiting_review" | "terminal_success" | "terminal_failure", terminal_outcome: "loop_no_findings" | "loop_with_findings" | "max_rounds_reached" | "no_progress" | "consecutive_failures" | null, counters: { unresolvedCriticalHigh: integer, totalOpen: integer, resolvedThisRound: integer, newThisRound: integer, severitySummary: object }, ledger_round_id: string | null }`. The `counters` field SHALL be derived from the review ledger via the existing `unresolvedCriticalHighCount` helper (and its siblings) so that the event and the `review-autofix-progress-observability` snapshot agree on round-level state. `terminal_outcome` SHALL be `null` when `loop_state ∈ {starting, in_progress, awaiting_review}` and non-null when `loop_state ∈ {terminal_success, terminal_failure}`.

  **Non-terminal autofix base payload rules (D9):**
  - **`outcome`**: SHALL be `"autofix_in_progress"` for all non-terminal autofix emissions (`loop_state ∈ {in_progress, awaiting_review}`). This value is not a valid terminal review outcome, ensuring consumers that switch on `outcome` for finalization logic never accidentally treat a progress emission as a completed review.
  - **`reviewer`**: SHALL be the reviewer actor identity (e.g., `"codex"`), populated from the loop's configured reviewer. This is always known at loop start.
  - **`score`**: SHALL be `null` for non-terminal emissions. No review score exists until the terminal re-review completes. Consumers that read `score` for display SHALL treat `null` as "not yet scored".
  - **Round-start events** (`loop_state = in_progress`): `autofix.counters` SHALL be populated from the **previous round's** ledger summary when `round_index > 1`, or all zeros when `round_index = 1` (first round, no prior review data). `autofix.ledger_round_id` SHALL reference the previous round's ledger round id when available, or `null` for round 1.
  - **Round-end events** (`loop_state = awaiting_review` or terminal): `autofix.counters` and `autofix.ledger_round_id` SHALL be populated from the **current round's** ledger summary, which exists because the re-review has just completed.
  - **Consumer discrimination rule:** Consumers SHALL distinguish autofix progress events from actual review-result events by checking `payload.autofix !== null`. When `payload.autofix` is non-null and `outcome = "autofix_in_progress"`, the base payload does not represent a finalized review. Consumers that only care about finalized reviews SHOULD filter on `payload.autofix === null || autofix.loop_state ∈ {terminal_success, terminal_failure}`.
- **`bundle_started`**: `payload = { bundle_kind: "review_bundle", artifact_count: integer }`. `bundle_ref` required.
- **`bundle_completed`**: `payload = { bundle_kind: "review_bundle", outcome: "approved" | "changes_requested" | "rejected" }`. `bundle_ref` required.

`bundle_kind` is currently fixed to `"review_bundle"`; no other bundle kinds are in scope.

The 15-kind catalog defined in the "The workflow core defines the authoritative catalog of observation event kinds" requirement SHALL remain closed; the auto-fix round progress signal SHALL be carried by the extended `review_completed` payload above rather than by a new `event_kind` value.

#### Scenario: Consumer interprets run_terminal from spec alone

- **WHEN** a consumer receives a `run_terminal` event
- **THEN** it SHALL read `payload.status` and expect exactly one of the three values defined above
- **AND** it SHALL NOT need to consult core implementation to interpret the value

#### Scenario: Consumer interprets gate_resolved from spec alone

- **WHEN** a consumer receives a `gate_resolved` event
- **THEN** `payload.resolution` SHALL be one of the values defined for that kind
- **AND** `gate_ref` SHALL point to a gate previously announced via `gate_opened`

#### Scenario: Autofix round review_completed carries AutofixRoundPayload

- **WHEN** a consumer receives a `review_completed` event emitted by
  `specflow-review-design autofix-loop` or `specflow-review-apply autofix-loop`
- **THEN** `payload.autofix` SHALL be non-null and conform to
  `AutofixRoundPayload`
- **AND** `payload.autofix.loop_state` SHALL be exactly one of
  `starting`, `in_progress`, `awaiting_review`, `terminal_success`, or
  `terminal_failure`
- **AND** `payload.autofix.terminal_outcome` SHALL be `null` when
  `loop_state ∈ {starting, in_progress, awaiting_review}` and SHALL be
  one of `loop_no_findings`, `loop_with_findings`, `max_rounds_reached`,
  `no_progress`, or `consecutive_failures` otherwise

#### Scenario: Non-autofix review_completed leaves autofix null

- **WHEN** a consumer receives a `review_completed` event emitted outside
  the auto-fix loop (e.g. a single `specflow-review-design review` or
  `specflow-review-apply review` round)
- **THEN** `payload.autofix` SHALL be `null`
- **AND** the existing `outcome`, `reviewer`, and `score` fields SHALL
  retain their prior semantics

#### Scenario: Counters agree with the autofix snapshot contract

- **WHEN** a consumer compares `payload.autofix.counters` with the
  progress snapshot defined by `review-autofix-progress-observability`
  for the same `run_id` and `round_index`
- **THEN** both SHALL carry the same `unresolvedCriticalHigh`,
  `totalOpen`, `resolvedThisRound`, `newThisRound`, and
  `severitySummary` values when the event and the snapshot refer to the
  same ledger round
- **AND** divergence SHALL be resolved by the
  `review-autofix-progress-observability` authority-precedence rule
  (ledger > events > snapshot)
