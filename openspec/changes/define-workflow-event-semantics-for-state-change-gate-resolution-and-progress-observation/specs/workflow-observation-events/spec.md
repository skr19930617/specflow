## ADDED Requirements

### Requirement: The workflow core defines the authoritative catalog of observation event kinds

The workflow core SHALL define a closed catalog of `event_kind` values that constitute the observation event contract. Every emitted observation event SHALL set `event_kind` to exactly one value from this catalog; undefined kinds SHALL NOT be emitted.

The catalog SHALL comprise the following four classes:

- **Lifecycle events** (4): `run_started`, `run_suspended`, `run_resumed`, `run_terminal`.
- **Phase events** (4): `phase_entered`, `phase_completed`, `phase_blocked`, `phase_reopened`.
- **Gate events** (3): `gate_opened`, `gate_resolved`, `gate_rejected`.
- **Progress/artifact events** (4): `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed`.

`event_kind` SHALL be a flat string discriminator; the contract SHALL NOT introduce a separate `event_category` field.

#### Scenario: Only catalogued event kinds are emitted

- **WHEN** the workflow core emits an observation event
- **THEN** `event_kind` SHALL equal one of the fifteen catalog values defined above
- **AND** any other string value SHALL be treated as a contract violation

#### Scenario: Event kind is the sole discriminator

- **WHEN** a consumer receives an observation event
- **THEN** it SHALL be able to select the per-event payload schema using `event_kind` alone
- **AND** the envelope SHALL NOT carry any additional category or type field

### Requirement: The observation event envelope defines the common fields

Every observation event SHALL conform to a common envelope containing the following fields:

- `event_id` — a unique identifier for this event instance. Consumers SHALL use it as the idempotency key.
- `event_kind` — the discriminator (see event catalog requirement).
- `run_id` — the run identifier in `<change_id>-<N>` format.
- `change_id` — the workflow change identifier that the run belongs to.
- `sequence` — a strictly increasing positive integer within a single `run_id`, starting at 1 for `run_started`.
- `timestamp` — an ISO 8601 UTC timestamp of when the event was first emitted.
- `source_phase` — the phase the run was in before the transition this event records; SHALL be set for phase events and for lifecycle events that change phase (`run_started` SHALL set it to `null`; `run_terminal` SHALL set it to the phase preceding termination). SHALL be `null` for progress/artifact events.
- `target_phase` — the phase the run enters as a result of the transition; same nullability rules as `source_phase`.
- `causal_context` — either `null` or a single cause reference containing (`kind`, `ref`) where `kind ∈ {user_event, observation_event}` and `ref` is a user event name or a prior `event_id`. Lists of causes SHALL NOT be emitted; only the immediate direct cause is recorded.
- `gate_ref` — optional reference to a gate record id; SHALL be set for gate events and for phase/lifecycle events directly caused by a gate.
- `artifact_ref` — optional reference to an artifact path or id; SHALL be set for progress/artifact events that relate to a specific artifact.
- `bundle_ref` — optional reference to a review bundle id; SHALL be set for `bundle_started`, `bundle_completed`, and for `artifact_written` / `review_completed` that belong to a review bundle.

The envelope SHALL contain no fields outside the list above; extension fields SHALL go into per-event `payload` schemas.

#### Scenario: Lifecycle event envelope

- **WHEN** the core emits a `run_started` event
- **THEN** `event_id`, `run_id`, `change_id`, `sequence` (equal to `1`), `timestamp`, and `event_kind = "run_started"` SHALL be present
- **AND** `source_phase` SHALL be `null`
- **AND** `causal_context` SHALL be `null`

#### Scenario: Phase event envelope

- **WHEN** the core emits a `phase_entered` event
- **THEN** `source_phase` SHALL equal the previous phase and `target_phase` SHALL equal the entered phase
- **AND** `causal_context` SHALL reference the immediate trigger (a user event or a prior observation event id)

#### Scenario: Gate event envelope

- **WHEN** the core emits `gate_opened`, `gate_resolved`, or `gate_rejected`
- **THEN** `gate_ref` SHALL be set to the gate record id
- **AND** `source_phase` and `target_phase` SHALL reflect the phase surrounding the gate transition, or be `null` if no phase boundary is crossed

#### Scenario: Progress event envelope

- **WHEN** the core emits `artifact_written`
- **THEN** `artifact_ref` SHALL be set to the artifact path or id
- **AND** `source_phase` and `target_phase` SHALL be `null`
- **AND** if the artifact belongs to a review bundle, `bundle_ref` SHALL be set

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
- **`review_completed`**: `payload = { outcome: "approved" | "changes_requested" | "rejected", reviewer: string, score: number | null }`. `artifact_ref` optional; `bundle_ref` SHALL be set when the review belongs to a bundle.
- **`bundle_started`**: `payload = { bundle_kind: "review_bundle", artifact_count: integer }`. `bundle_ref` required.
- **`bundle_completed`**: `payload = { bundle_kind: "review_bundle", outcome: "approved" | "changes_requested" | "rejected" }`. `bundle_ref` required.

`bundle_kind` is currently fixed to `"review_bundle"`; no other bundle kinds are in scope.

#### Scenario: Consumer interprets run_terminal from spec alone

- **WHEN** a consumer receives a `run_terminal` event
- **THEN** it SHALL read `payload.status` and expect exactly one of the three values defined above
- **AND** it SHALL NOT need to consult core implementation to interpret the value

#### Scenario: Consumer interprets gate_resolved from spec alone

- **WHEN** a consumer receives a `gate_resolved` event
- **THEN** `payload.resolution` SHALL be one of the values defined for that kind
- **AND** `gate_ref` SHALL point to a gate previously announced via `gate_opened`

### Requirement: Per-run monotonic ordering is guaranteed

Within a single `run_id`, observation events SHALL be observable in publication order as given by `sequence`. `sequence` SHALL start at 1 for `run_started` and increase strictly monotonically by 1 per newly published event within that run.

Ordering across different `run_id` values SHALL NOT be guaranteed. Consumers MUST NOT assume any cross-run ordering.

#### Scenario: Sequence increases monotonically within a run

- **WHEN** a consumer observes a contiguous slice of events for one `run_id`
- **THEN** their `sequence` values SHALL form a strictly increasing series 1, 2, 3, …

#### Scenario: Cross-run ordering is not guaranteed

- **WHEN** events for two different runs are observed
- **THEN** consumers SHALL NOT rely on their relative order across runs

### Requirement: Coupled events follow cause-to-effect order

When a single underlying workflow change produces several related observation events within the same run, the contract SHALL fix the following relative orderings:

- `gate_opened` SHALL precede any `phase_blocked` it causes, which SHALL precede any `run_suspended` it causes.
- `gate_resolved` or `gate_rejected` SHALL precede any `phase_reopened` or `phase_completed` it causes, which SHALL precede any `run_resumed` it causes.
- `bundle_started` SHALL precede every `artifact_written` and `review_completed` whose `bundle_ref` matches, which SHALL precede the matching `bundle_completed`.

These orderings SHALL be expressed both through `sequence` (earlier causes have smaller `sequence`) and through `causal_context` (downstream events reference upstream events via `event_id`).

#### Scenario: Gate-induced suspension order

- **WHEN** a gate opens that blocks the current phase and suspends the run
- **THEN** the emitted events SHALL appear in the order `gate_opened` → `phase_blocked` → `run_suspended`
- **AND** each later event's `causal_context` SHALL reference the immediately preceding event's `event_id`

#### Scenario: Bundle framing

- **WHEN** a review bundle is processed
- **THEN** `bundle_started` SHALL be followed by one or more `artifact_written` and `review_completed` events sharing the same `bundle_ref`
- **AND** `bundle_completed` with the same `bundle_ref` SHALL be the last event for that bundle

### Requirement: At-least-once delivery with consumer-side idempotency

The contract SHALL be at-least-once: after a crash, restart, or transient consumer failure, the workflow core MAY re-emit an event that has already been observed. Consumers SHALL de-duplicate observed events using `event_id` as the idempotency key.

Exactly-once and at-most-once delivery are explicitly NOT part of the contract.

#### Scenario: Duplicate event is idempotent

- **WHEN** a consumer receives a second event whose `event_id` matches an already-processed event
- **THEN** the consumer SHALL treat it as a duplicate and take no additional action

#### Scenario: Lost event is not guaranteed

- **WHEN** an event is dropped by a consumer's transport before receipt
- **THEN** the contract SHALL NOT guarantee automatic redelivery beyond the at-least-once guarantee provided by the publisher

### Requirement: Re-emission preserves full envelope and payload bit-identity

On re-emission of an already-published observation event, every envelope and payload field SHALL be bit-identical to the original emission. Specifically, `event_id`, `sequence`, `timestamp`, `event_kind`, `run_id`, `change_id`, `source_phase`, `target_phase`, `causal_context`, `gate_ref`, `artifact_ref`, `bundle_ref`, and `payload` SHALL all be unchanged.

Re-emitted events SHALL differ from new events only in the fact of being observed more than once. `timestamp` SHALL always reflect the original emission time, not the re-emission time.

#### Scenario: Re-emitted event has identical fields

- **WHEN** the core re-emits an event after recovery
- **THEN** every envelope and payload field SHALL equal the values of the original emission
- **AND** a consumer comparing the two byte-for-byte SHALL find them identical

#### Scenario: Timestamp is the original emission time

- **WHEN** an event is re-emitted one minute after its original publication
- **THEN** `timestamp` SHALL reflect the original publication time
- **AND** SHALL NOT be updated to the re-emission time

### Requirement: causal_context carries zero or one cause

`causal_context` SHALL be either `null` or a single cause reference; it SHALL NOT be a list. Root or system-generated events — notably `run_started` — SHALL set `causal_context` to `null`. For events with multiple logical antecedents, the workflow core SHALL record only the immediate direct cause; reconstructing transitive or multi-parent causation is a consumer responsibility.

#### Scenario: run_started has null causal_context

- **WHEN** the core emits `run_started`
- **THEN** `causal_context` SHALL be `null`

#### Scenario: Immediate cause is recorded even when multiple antecedents exist

- **WHEN** a `run_suspended` event has both a `phase_blocked` and an external user event as potential antecedents
- **THEN** `causal_context` SHALL reference exactly one of them — the immediate direct cause
- **AND** SHALL NOT be expanded into a list

### Requirement: Replay reconstructs the bounded snapshot subset

Replaying the observation event stream for a single `run_id` from `run_started` through the most recent event SHALL reconstruct the following subset of the canonical workflow snapshot:

- `current_phase` — derivable from the latest `phase_entered` / `phase_completed` / `phase_reopened` / `run_terminal` events.
- `status` — derivable from the latest lifecycle event (e.g., `run_terminal.payload.status`, or `active`/`suspended` from `run_suspended` / `run_resumed`).
- The set of currently open gates — derivable by tracking `gate_opened` minus `gate_resolved`/`gate_rejected` events grouped by `gate_ref`.
- The latest pointer (path or id) for each artifact — derivable from the most recent `artifact_written` per `artifact_ref`.

Other snapshot fields — derived metrics, full history lists, timestamps of prior reads, cached local-filesystem metadata — are explicitly outside the replay guarantee.

#### Scenario: Replay yields current_phase and status

- **WHEN** a consumer replays the event stream for a run
- **THEN** it SHALL produce the same `current_phase` and `status` as the canonical snapshot

#### Scenario: Replay yields open gate set

- **WHEN** a consumer replays the event stream for a run with two gates that were opened and one resolved
- **THEN** the reconstructed open-gate set SHALL contain exactly the one unresolved gate

#### Scenario: Replay does not cover derived metrics

- **WHEN** a consumer replays the event stream
- **THEN** it SHALL NOT be expected to reconstruct snapshot fields outside the list above
- **AND** the contract SHALL NOT be violated when such fields diverge

### Requirement: Event history retrieval is out of scope

The observation-events contract SHALL define replay semantics only — that is, the mathematical relationship between a replayed stream and the reconstructed snapshot. The contract SHALL NOT require the workflow core to persist all events or expose a history-retrieval API. Persistence, transport, and history-retrieval APIs are the responsibility of separate layers and are explicitly non-goal here.

#### Scenario: Core is not required to persist events

- **WHEN** this spec is inspected
- **THEN** it SHALL NOT require the workflow core to durably store every observation event
- **AND** it SHALL NOT require a history-retrieval endpoint

#### Scenario: Replay guarantee is conditional on available history

- **WHEN** a consumer or persistence layer has collected the full stream from `run_started`
- **THEN** replaying that stream SHALL reconstruct the bounded snapshot subset as defined
- **AND** the guarantee SHALL NOT imply that such a stream is always retrievable

### Requirement: Observation events are disjoint from surface events

The `workflow-observation-events` contract SHALL be disjoint from the `surface-event-contract`. Observation events are declarative notifications of workflow state change emitted by the core; surface events are imperative commands exchanged with external surfaces (approval, reject, clarify, resume).

The two contracts SHALL NOT share an envelope schema. `workflow-observation-events` and `surface-event-contract` SHALL cross-reference each other in their Purpose sections to disambiguate, but neither SHALL depend on or import fields from the other.

#### Scenario: Envelopes are independent

- **WHEN** the two contracts are compared
- **THEN** each SHALL define its own envelope schema
- **AND** neither SHALL reuse fields from the other

#### Scenario: Cross-reference only

- **WHEN** either spec is read
- **THEN** it SHALL reference the other to clarify the distinction between observation and command events
- **AND** SHALL NOT declare a shared parent schema
