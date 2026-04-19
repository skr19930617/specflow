# workflow-gate-semantics Specification

## Purpose
TBD - created by archiving change define-gate-semantics-for-approval-clarify-and-review-decisions-as-persistent-workflow-objects. Update Purpose after archive.

Related specs:
- `workflow-observation-events`: gate state changes (opening, resolution, rejection) emit `gate_opened`, `gate_resolved`, `gate_rejected` observation events. Gate records remain the authoritative store; observation events are notifications.

## Requirements
### Requirement: Gate is a first-class persistent workflow object

The system SHALL define **Gate** as a first-class persistent workflow object representing a pending decision point in a run. A Gate SHALL exist independently of any surface (CLI, UI, server) and any specific actor identity. A Gate SHALL be created by the workflow core runtime whenever a phase transition requires a gated decision, and SHALL persist until it reaches a terminal status (`resolved` or `superseded`).

Each Gate SHALL include the following fields:
- `gate_id`: A unique identifier for this gate (required).
- `gate_kind`: One of `"approval"`, `"clarify"`, or `"review_decision"` (required).
- `run_id`: The run this gate belongs to (required).
- `originating_phase`: The workflow phase that produced this gate (required).
- `status`: One of `"pending"`, `"resolved"`, or `"superseded"` (required).
- `reason`: A short human-readable string describing why the gate is open (required).
- `payload`: A kind-specific structured object containing the detailed context needed to answer the gate (required, schema varies by `gate_kind`).
- `eligible_responder_roles`: A non-empty set of actor role identifiers indicating who may resolve the gate (required).
- `allowed_responses`: The fixed list of response tokens the gate accepts, determined by `gate_kind` (required).
- `created_at`: ISO 8601 timestamp when the gate entered `pending` (required).
- `resolved_at`: ISO 8601 timestamp when the gate reached `resolved` or `superseded` (required once non-pending, null otherwise).
- `decision_actor`: The actor identity that resolved the gate (required once `resolved`, null otherwise; always null when `superseded`).
- `event_ids`: An ordered array of surface event ids associated with the gate's history (required, may be empty when first created).

#### Scenario: Gate is created when a gated phase transition requires a decision

- **WHEN** the workflow core processes a transition that requires an approval, a clarification, or a review decision
- **THEN** the runtime SHALL create a Gate with `status: "pending"` and `resolved_at: null` before surfacing the stop point to any surface
- **AND** the gate SHALL carry the `originating_phase` matching the phase that produced it

#### Scenario: Gate object is surface-agnostic

- **WHEN** a surface (CLI, UI, or server runtime) reads the current run state
- **THEN** it SHALL be able to list all pending gates using only the Gate schema fields
- **AND** the gate definition SHALL NOT depend on any surface-specific field (button labels, UI copy, transport identifiers)

### Requirement: Gate kinds are limited to approval, clarify, and review_decision

The system SHALL support exactly three gate kinds. No other `gate_kind` value SHALL be accepted by the runtime.

- `"approval"`: Represents an approval-required stop point (e.g., `spec_ready`, `design_ready`, `apply_ready`). The payload SHALL include the phase pair (`phase_from`, `phase_to`) being gated.
- `"clarify"`: Represents a single clarification question issued by the workflow. The payload SHALL include the question text and any additional question context.
- `"review_decision"`: Represents a human decision on a completed review round. The payload SHALL include the review round id and the findings snapshot for that round.

#### Scenario: Unknown gate kind is rejected at creation

- **WHEN** the runtime receives a request to create a gate with `gate_kind` outside the set `{approval, clarify, review_decision}`
- **THEN** the runtime SHALL reject the creation
- **AND** no gate record SHALL be persisted

### Requirement: Gate lifecycle supports pending, resolved, and superseded

Every Gate SHALL transition through a finite state machine with exactly three states: `pending`, `resolved`, and `superseded`. `pending` is the initial state. `resolved` and `superseded` are terminal states: once a gate leaves `pending`, its status SHALL NOT change again.

- `pending` → `resolved`: triggered by a valid response received through `allowed_responses`. The resolution SHALL populate `resolved_at` and `decision_actor`.
- `pending` → `superseded`: triggered when the runtime creates a new gate with the same `gate_kind` and `originating_phase` for the same run while the prior gate is still pending. The prior gate SHALL be marked `superseded`, `resolved_at` SHALL be populated, and `decision_actor` SHALL remain null.

Superseded gates SHALL NOT be counted as pending gates and SHALL NOT be treated as resolved decisions; they SHALL remain in persistence for history only.

#### Scenario: Valid response resolves the gate

- **WHEN** a responder submits a valid response for a pending gate
- **THEN** the runtime SHALL transition the gate to `resolved`
- **AND** `resolved_at` SHALL be set to the current timestamp
- **AND** `decision_actor` SHALL be set to the responder's actor identity

#### Scenario: New gate of same kind in same originating phase supersedes the prior pending gate

- **WHEN** a gate with `gate_kind: K` is `pending` for `originating_phase: P` in a run
- **AND** the runtime creates a new gate with the same `gate_kind: K` and the same `originating_phase: P` for the same run
- **THEN** the prior pending gate SHALL transition to `superseded`
- **AND** `resolved_at` SHALL be set on the superseded gate
- **AND** `decision_actor` SHALL remain null on the superseded gate

#### Scenario: Terminal states are immutable

- **WHEN** a gate is in `resolved` or `superseded` status
- **THEN** no subsequent response or transition SHALL change its status
- **AND** attempts to resolve a non-pending gate SHALL be rejected

#### Scenario: Superseded gates are excluded from pending listings

- **WHEN** a surface lists pending gates for a run
- **THEN** gates with `status: "superseded"` SHALL NOT appear in the pending list
- **AND** they SHALL remain retrievable for history / audit purposes

### Requirement: Allowed responses are fixed per gate kind

The runtime SHALL use a fixed `allowed_responses` set determined by `gate_kind`. The sets SHALL NOT vary by `originating_phase` or by gate instance.

- `"approval"` → `["accept", "reject"]`
- `"clarify"` → `["clarify_response"]`
- `"review_decision"` → `["accept", "reject", "request_changes"]`

Any response token outside the set for the given gate kind SHALL be rejected as invalid. A rejected response SHALL NOT change the gate's status; the gate SHALL remain `pending`.

#### Scenario: Approval gate accepts accept and reject only

- **WHEN** an `"approval"` gate receives a response of `"accept"` or `"reject"`
- **THEN** the runtime SHALL transition the gate to `resolved`

#### Scenario: Clarify gate accepts clarify_response only

- **WHEN** a `"clarify"` gate receives a response of `"clarify_response"`
- **THEN** the runtime SHALL transition the gate to `resolved`

#### Scenario: Review_decision gate accepts accept, reject, and request_changes

- **WHEN** a `"review_decision"` gate receives `"accept"`, `"reject"`, or `"request_changes"`
- **THEN** the runtime SHALL transition the gate to `resolved`

#### Scenario: Invalid response is rejected and leaves the gate pending

- **WHEN** a gate receives a response token outside its kind's `allowed_responses`
- **THEN** the runtime SHALL return an error describing the invalid response
- **AND** the gate SHALL remain `pending` with unchanged fields
- **AND** no `event_ids` entry SHALL be appended for the rejected attempt

### Requirement: Gate responses map deterministically to handoff signals

Each gate response SHALL map to exactly one handoff signal that the runtime produces as part of the same synchronous resolution. The mapping SHALL be deterministic and SHALL NOT depend on actor identity beyond eligibility checks.

For `approval` gates, the handoff signal is an **existing transition handler entry point** (`accept_spec`, `accept_design`, `accept_apply`, `reject`) already defined by the runtime's transition handler implementations.

For `review_decision` gates, the handoff signal is a **review-orchestration handoff outcome** (`handoff.state` value), consistent with review-orchestration's requirement that review outcomes are distinct from workflow approve/reject operations. The `request_changes` handoff additionally specifies the phase-appropriate revise transition (`revise_proposal` / `revise_design` / `revise_apply`) that existing transition handlers already support.

For `clarify` gates, the handoff signal is `clarify_response`, which keeps the run in its current phase.

- `approval.accept` → `accept_spec` / `accept_design` / `accept_apply` (determined by `originating_phase`)
- `approval.reject` → `reject`
- `clarify.clarify_response` → `clarify_response` (keeps the run in its current phase, appends the answer)
- `review_decision.accept` → `handoff.state = review_approved` (review round closes; the run proceeds to the downstream approval gate)
- `review_decision.reject` → `handoff.state = review_rejected` (review-level rejection, distinct from the approval-level `reject` transition)
- `review_decision.request_changes` → `handoff.state = request_changes` → `revise_proposal` / `revise_design` / `revise_apply` (determined by `originating_phase`)

#### Scenario: Approval response produces the phase-appropriate accept signal

- **WHEN** an `"approval"` gate with `originating_phase: "spec_ready"` is resolved with `"accept"`
- **THEN** the runtime SHALL produce the `accept_spec` handoff signal in the same transition

#### Scenario: Review request_changes maps to the phase-appropriate revise handoff

- **WHEN** a `"review_decision"` gate with `originating_phase: "design_review"` is resolved with `"request_changes"`
- **THEN** the runtime SHALL produce a `handoff.state = request_changes` signal that maps to the `revise_design` transition

#### Scenario: Review reject produces a review-level rejection handoff distinct from approval reject

- **WHEN** a `"review_decision"` gate is resolved with `"reject"`
- **THEN** the runtime SHALL produce a `handoff.state = review_rejected` signal
- **AND** this signal SHALL be distinct from the `reject` transition produced by `approval.reject`

#### Scenario: Clarify response does not change phase

- **WHEN** a `"clarify"` gate is resolved with `"clarify_response"`
- **THEN** the run SHALL remain in its current phase
- **AND** the clarification answer SHALL be persisted as part of the gate's resolution

### Requirement: Concurrency rules limit approval and review gates to one pending per phase

Within a single run, the runtime SHALL enforce the following concurrency rules:

- A phase MAY have multiple `"clarify"` gates pending concurrently.
- A phase SHALL have at most one pending `"approval"` gate at a time.
- A phase SHALL have at most one pending `"review_decision"` gate at a time.

While a run has a pending `"approval"` or `"review_decision"` gate, the runtime SHALL NOT advance the run to a subsequent phase. Pending `"clarify"` gates SHALL NOT block phase transitions by themselves, except where a phase's own acceptance criteria require clarify resolution.

#### Scenario: Multiple clarify gates can coexist in one phase

- **WHEN** a phase issues three clarification questions in sequence
- **THEN** three `"clarify"` gates SHALL exist concurrently with `status: "pending"`
- **AND** each SHALL resolve independently when answered

#### Scenario: Second approval gate in same phase supersedes the first

- **WHEN** an `"approval"` gate is pending for `originating_phase: P`
- **AND** the runtime creates a new `"approval"` gate for the same `originating_phase: P` in the same run
- **THEN** the prior gate SHALL transition to `superseded`
- **AND** only one `"approval"` gate SHALL remain `pending` for that phase

#### Scenario: Pending approval blocks phase advancement

- **WHEN** a run has any pending `"approval"` gate
- **THEN** the runtime SHALL NOT apply a transition that advances the run into the next phase
- **AND** the gate SHALL be resolved before advancement becomes possible

### Requirement: Eligible responders are expressed as actor roles

The `eligible_responder_roles` field SHALL contain a non-empty set of role identifiers defined by `actor-surface-model` (for example: `human-author`, `ai-agent`, `reviewer`). The runtime SHALL NOT encode specific actor identities in `eligible_responder_roles`; identity-level resolution remains a future extension point.

A response SHALL be accepted only if the responding actor's active role intersects `eligible_responder_roles`. Responses from actors whose roles do not intersect SHALL be rejected, and the gate SHALL remain `pending`.

#### Scenario: Responder role matches eligible roles

- **WHEN** a responder whose active role is in `eligible_responder_roles` submits a valid response
- **THEN** the runtime SHALL accept the response and resolve the gate

#### Scenario: Responder role does not match eligible roles

- **WHEN** a responder whose active role is NOT in `eligible_responder_roles` submits a response
- **THEN** the runtime SHALL reject the response
- **AND** the gate SHALL remain `pending`

### Requirement: Review_decision gates are issued per review round and resolved by human-author

The runtime SHALL create exactly one `"review_decision"` gate per completed review round. A review round is defined as a single invocation of `specflow-challenge-proposal`, `specflow-review-design`, or `specflow-review-apply` that produces a set of findings. Individual findings SHALL NOT generate their own gates; they SHALL be represented inside the gate's `payload.findings` array.

All `"review_decision"` gates SHALL set `eligible_responder_roles = ["human-author"]` regardless of the review phase (`proposal_challenge`, `design_review`, or `apply_review`). AI-agent actors MAY generate review findings and MAY emit advisory opinions through the ledger, but they SHALL NOT resolve `"review_decision"` gates.

#### Scenario: One review_decision gate per review round

- **WHEN** a review round (proposal challenge, design review, or apply review) completes
- **THEN** the runtime SHALL create exactly one `"review_decision"` gate with the round's findings in `payload.findings`
- **AND** no per-finding gate SHALL be created

#### Scenario: Human-author is the only eligible responder for review decisions

- **WHEN** a `"review_decision"` gate is created
- **THEN** `eligible_responder_roles` SHALL equal `["human-author"]`
- **AND** any response submitted by an actor whose role is not `human-author` SHALL be rejected

#### Scenario: AI-agent findings are represented in payload, not as gates

- **WHEN** an AI-agent review produces findings during a review round
- **THEN** the findings SHALL appear in the resulting `"review_decision"` gate's `payload.findings`
- **AND** no separate gate SHALL be created per finding

### Requirement: Gate history is derived from event_ids and is surface-agnostic

Each gate's `event_ids` array SHALL reference surface events (as defined by `surface-event-contract`) that relate to the gate's lifecycle: creation, responses (including rejected ones that produced errors, if the surface chose to emit them), and resolution. The gate object itself SHALL carry enough state (`status`, `resolved_at`, `decision_actor`) for a surface to display the gate's current position without replaying the event stream.

The runtime SHALL NOT require a specific transport to deliver gate state; any surface that can read the persisted gate and the referenced events SHALL be able to render gate history faithfully.

#### Scenario: Gate state is self-sufficient for rendering current position

- **WHEN** a surface reads a gate record from persistence
- **THEN** it SHALL be able to display the gate's current status, reason, and decision (if any) without reading any other resource

#### Scenario: Event_ids link the gate to its surface history

- **WHEN** a gate is resolved
- **THEN** the resolution event's id SHALL be appended to `event_ids`
- **AND** consumers that read the event store SHALL be able to reconstruct the timeline of the gate's life

#### Scenario: Superseded gates retain their history

- **WHEN** a gate transitions to `superseded`
- **THEN** its `event_ids` SHALL remain intact and queryable
- **AND** surfaces SHALL be able to display the superseded gate as part of historical audit views

