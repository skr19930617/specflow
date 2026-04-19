## ADDED Requirements

### Requirement: Gate state changes emit observation events

Every authoritative state change of a gate record (approval, clarify, or review) SHALL emit a corresponding observation event under the `workflow-observation-events` contract:

- Opening a gate (recording a new gate record in the `pending` state) SHALL emit `gate_opened` with `payload.gate_kind ∈ {"approval", "clarify", "review_decision"}` and `gate_ref` set to the gate record id.
- Resolving a gate affirmatively SHALL emit `gate_resolved` with `payload.resolution ∈ {"approved", "answered", "changes_requested"}` and `payload.by_actor` identifying the actor that resolved it. The mapping is: `approval + accept` → `"approved"`, `clarify + clarify_response` → `"answered"`, `review_decision + accept` → `"approved"`, `review_decision + request_changes` → `"changes_requested"`.
- Rejecting a gate SHALL emit `gate_rejected` with `payload.resolution = "rejected"`, `payload.by_actor`, and `payload.reason` (nullable). Emitted for `approval + reject` and `review_decision + reject`.

A single gate record SHALL emit exactly one terminal gate event (`gate_resolved` or `gate_rejected`) across its lifetime. Re-emissions preserve event identity per the `workflow-observation-events` re-emission invariants; they SHALL NOT be treated as additional terminal events.

#### Scenario: Opening an approval gate

- **WHEN** an approval gate is opened
- **THEN** the core SHALL emit `gate_opened` with `payload.gate_kind = "approval"` and `gate_ref` equal to the new gate record id

#### Scenario: Resolving a clarify gate

- **WHEN** a clarify gate is resolved by user answer
- **THEN** the core SHALL emit `gate_resolved` with `payload.resolution = "answered"` and `gate_ref` equal to the gate record id
- **AND** it SHALL NOT emit a second terminal event for the same gate record

#### Scenario: Rejecting a review_decision gate

- **WHEN** a review_decision gate is rejected (response "reject")
- **THEN** the core SHALL emit `gate_rejected` with `payload.resolution = "rejected"`, `payload.by_actor` set, and `payload.reason` either set or `null`

### Requirement: Gate events precede downstream phase and lifecycle events

When a gate state change causes downstream phase or lifecycle transitions within the same run, the gate event SHALL be emitted before the caused phase event, which SHALL be emitted before any caused lifecycle event. Ordering SHALL be expressed through the `sequence` field and through `causal_context` references to the upstream gate event's `event_id`.

Specifically:

- `gate_opened` that blocks a phase SHALL precede `phase_blocked`, which SHALL precede any `run_suspended` it causes.
- `gate_resolved` or `gate_rejected` that unblocks a phase SHALL precede the `phase_reopened` or `phase_completed` it causes, which SHALL precede any `run_resumed` it causes.

#### Scenario: Gate-opened suspension chain

- **WHEN** opening a gate causes the phase to block and the run to suspend
- **THEN** the observation events SHALL be emitted in the order `gate_opened` → `phase_blocked` → `run_suspended`
- **AND** each later event's `causal_context` SHALL reference the immediately preceding event's `event_id`

#### Scenario: Gate-resolved unblock chain

- **WHEN** resolving a gate causes the phase to reopen and the run to resume
- **THEN** the observation events SHALL be emitted in the order `gate_resolved` → `phase_reopened` → `run_resumed`
- **AND** `causal_context` chaining SHALL match the emission order

### Requirement: Gate records remain the authoritative store

The `workflow-observation-events` contract SHALL NOT replace gate records as the authoritative store of gate state. Observation events are notifications of state change; a gate record remains the single source of truth for whether a gate is open, resolved, or rejected. Consumers that need authoritative gate state SHALL read the gate record; consumers that need realtime observation MAY rely on the event stream, subject to the at-least-once delivery and idempotency rules.

#### Scenario: Gate record is authoritative

- **WHEN** a consumer needs to know whether a gate is currently open
- **THEN** it SHALL consult the gate record, not the event stream alone
- **AND** the event stream SHALL only serve as a notification channel consistent with the record

#### Scenario: Event loss does not corrupt gate state

- **WHEN** an observation event for a gate is lost before consumer receipt
- **THEN** the gate record SHALL remain correct
- **AND** subsequent reads of the gate record SHALL produce the same authoritative result
