## ADDED Requirements

### Requirement: Each completed review round issues a review_decision gate

Every completed review round SHALL result in the core runtime issuing exactly one `"review_decision"` gate, as defined by `workflow-gate-semantics`. A review round is defined as a single invocation of `specflow-challenge-proposal challenge`, `specflow-review-design review`, or `specflow-review-apply review` that produces a ledger snapshot with a bounded set of findings (or, for proposal challenge, a bounded set of challenge questions).

Individual findings SHALL NOT produce their own gates. All findings for the round SHALL be carried as `payload.findings` on the single `"review_decision"` gate issued for that round. The `payload` SHALL additionally include `review_round_id` identifying the ledger round, the `reviewer_actor` / `reviewer_actor_id` provenance values persisted in the round summary, and the `approval_binding` value recorded for that round.

#### Scenario: Proposal challenge issues a single review_decision gate per round

- **WHEN** `specflow-challenge-proposal challenge <CHANGE_ID>` completes
- **THEN** the runtime SHALL issue one `"review_decision"` gate with `originating_phase: "proposal_challenge"`
- **AND** the gate's `payload.findings` SHALL contain the challenge questions for that round

#### Scenario: Design review issues a single review_decision gate per round

- **WHEN** `specflow-review-design review <CHANGE_ID>` completes a review round
- **THEN** the runtime SHALL issue one `"review_decision"` gate with `originating_phase: "design_review"`
- **AND** the gate's `payload.findings` SHALL contain the design findings for that round

#### Scenario: Apply review issues a single review_decision gate per round

- **WHEN** `specflow-review-apply review <CHANGE_ID>` completes a review round
- **THEN** the runtime SHALL issue one `"review_decision"` gate with `originating_phase: "apply_review"`
- **AND** the gate's `payload.findings` SHALL contain the apply findings for that round

#### Scenario: Findings do not generate individual gates

- **WHEN** a review round produces multiple findings (critical, high, medium, low)
- **THEN** no per-finding `"review_decision"` gate SHALL be created
- **AND** all findings SHALL appear in the single round-level gate's `payload.findings`

### Requirement: Review_decision gates are resolved exclusively by human-author role

The runtime SHALL set `eligible_responder_roles = ["human-author"]` on every `"review_decision"` gate regardless of the review phase that produced it. AI-agent actors SHALL continue to generate review findings and MAY populate advisory metadata in the ledger, but SHALL NOT resolve any `"review_decision"` gate.

Responses from non-`human-author` roles SHALL be rejected; the gate SHALL remain `pending` and its fields SHALL remain unchanged. This requirement is consistent with the existing review-orchestration rule that an undelegated AI-agent approval is advisory only.

#### Scenario: Human-author resolves the review_decision gate

- **WHEN** a `"review_decision"` gate is pending
- **AND** a responder whose role is `human-author` submits `"accept"`, `"reject"`, or `"request_changes"`
- **THEN** the runtime SHALL resolve the gate

#### Scenario: AI-agent response to a review_decision gate is rejected

- **WHEN** an `ai-agent` responder submits any response to a pending `"review_decision"` gate
- **THEN** the runtime SHALL reject the response
- **AND** the gate SHALL remain `pending`
- **AND** the ledger SHALL still record the AI-agent's review findings as advisory metadata for that round

#### Scenario: Automation response to a review_decision gate is rejected

- **WHEN** an `automation` actor attempts to submit any response to a pending `"review_decision"` gate
- **THEN** the runtime SHALL reject the response
- **AND** the gate SHALL remain `pending`

### Requirement: Review ledger persists the issuing gate id for each review round

Each review ledger round summary SHALL persist the `gate_id` of the `"review_decision"` gate issued for that round. Consumers SHALL be able to traverse from a ledger round to its gate without ambiguity, and the gate's `payload.review_round_id` SHALL reference the same round id recorded in the ledger snapshot.

#### Scenario: Ledger round summary records the issuing gate id

- **WHEN** a review round is appended to the ledger
- **THEN** the round summary SHALL include a `gate_id` field pointing to the `"review_decision"` gate issued for that round

#### Scenario: Gate payload back-references the ledger round id

- **WHEN** a `"review_decision"` gate is created
- **THEN** its `payload.review_round_id` SHALL equal the ledger's round identifier for the same round
- **AND** the ledger's round summary SHALL include the same `gate_id` for round-level traversal

## MODIFIED Requirements

### Requirement: Review handoff distinguishes actor kinds in review decisions

Review orchestration SHALL recognize the actor kind of the reviewer when processing review outcomes. Review outcomes SHALL remain review-phase decisions that are distinct from workflow `approve` and `reject` operations. The mapping from review outcome to workflow transition SHALL account for whether the reviewer is `human`, `ai-agent`, or `automation`. `automation` actors SHALL NOT issue review outcomes and SHALL NOT participate in review phases. In addition, the authoritative resolver of the round-level `"review_decision"` gate SHALL always be a `human-author` role; AI-agent review outcomes SHALL continue to be recorded in the ledger as advisory metadata but SHALL NOT resolve the gate.

Whenever this requirement refers to "no unresolved high findings", the gate SHALL be evaluated as `unresolvedCriticalHighCount(ledger) == 0` — i.e., the gate covers both `critical` and `high` severities, and ignores `medium` and `low` severities. MEDIUM and LOW findings SHALL NOT block the binding-approval handoff; they remain visible via `handoff.severity_summary` and Remaining Risks aggregation.

#### Scenario: Human reviewer approval is binding

- **WHEN** a `human` reviewer issues `review_approved`
- **THEN** the review orchestration SHALL treat the outcome as a binding review approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return `handoff.state = "review_approved"` (or `"review_no_findings"` for the apply / design review handoff payload, per the severity-aware gate requirement)
- **AND** the `"review_decision"` gate for that round SHALL be resolved with `"accept"`

#### Scenario: Undelegated AI-agent reviewer approval is advisory only

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** no delegation exists for the current run
- **THEN** the review orchestration SHALL record the outcome as an advisory recommendation
- **AND** it SHALL NOT return `handoff.state = "review_approved"` based on this outcome alone
- **AND** the workflow SHALL NOT advance to the next gated phase based on this outcome alone
- **AND** the `"review_decision"` gate SHALL remain `pending` until a `human-author` resolves it

#### Scenario: Delegated AI-agent reviewer approval is binding

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** delegation is active for the current run
- **THEN** the review orchestration SHALL treat the outcome as a binding review approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return `handoff.state = "review_approved"` (or `"review_no_findings"` for the apply / design review handoff payload, per the severity-aware gate requirement)
- **AND** unresolved findings whose `severity ∈ {medium, low}` SHALL NOT prevent this binding handoff
- **AND** the `"review_decision"` gate SHALL remain `pending` until a `human-author` resolves it, because gate resolution is always bound to the `human-author` role even when delegated AI approval is the binding review outcome

#### Scenario: Request-changes outcome requires a phase revision

- **WHEN** a `human` reviewer or an `ai-agent` reviewer issues `request_changes`
- **THEN** the review orchestration SHALL return a non-approved handoff for the current phase
- **AND** the handoff SHALL require the phase-appropriate revise transition (`revise_design` or `revise_apply`) before the next review round
- **AND** delegation SHALL NOT change this mapping because `request_changes` is a review-phase outcome, not a gated workflow approval
- **AND** when resolved by a `human-author`, the corresponding `"review_decision"` gate SHALL be resolved with `"request_changes"`, which maps to the phase-appropriate revise workflow event

#### Scenario: AI-agent block is overridable in the ledger

- **WHEN** an `ai-agent` reviewer issues `block`
- **THEN** a `human` actor SHALL be able to override the finding status in the review ledger
- **AND** the override SHALL be recorded with the overriding actor's identity

#### Scenario: Human reviewer block is non-overridable

- **WHEN** a `human` reviewer issues `block`
- **THEN** no actor SHALL override the block
- **AND** the review orchestration SHALL reject any attempt to change the status of a human-issued block finding

#### Scenario: Automation cannot issue review outcomes

- **WHEN** an `automation` actor attempts to issue a review outcome (`review_approved`, `request_changes`, or `block`)
- **THEN** the review orchestration SHALL reject the operation
- **AND** automation actors SHALL NOT participate in review phases

#### Scenario: Automation evidence is advisory only

- **WHEN** an automation source emits CI, webhook, or batch evidence during a review phase
- **THEN** the review orchestration MAY surface or persist that evidence for a reviewer
- **AND** it SHALL NOT treat the automation source as the reviewer or as a review outcome
