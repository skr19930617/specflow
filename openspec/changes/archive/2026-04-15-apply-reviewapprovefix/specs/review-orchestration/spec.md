## ADDED Requirements

### Requirement: Review handoff state SHALL be derived from HIGH+ unresolved finding count

Apply and design review orchestrators SHALL derive the `handoff.state` value strictly from the count of unresolved findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`. The reviewer's free-form `decision` string and findings of severity `medium` or `low` SHALL NOT be used as gate inputs for the `handoff.state` field. The total unresolved-finding count (`actionable_count`) SHALL still be reported in the handoff payload for downstream consumers (e.g., approval-summary Remaining Risks aggregation).

This requirement defines the canonical mapping:

- `unresolvedCriticalHighCount(ledger) == 0` → `handoff.state = "review_no_findings"` (after a single review round) or `"loop_no_findings"` (after an autofix loop).
- `unresolvedCriticalHighCount(ledger) > 0` → `handoff.state = "review_with_findings"` (after a single review round) or `"loop_with_findings"` (after an autofix loop).

The literal state names (`review_no_findings`, `review_with_findings`, `loop_no_findings`, `loop_with_findings`) SHALL remain stable for backward compatibility; only the gate semantics change.

#### Scenario: Apply review with only LOW findings reports no_findings

- **WHEN** `specflow-review-apply review <CHANGE_ID>` finishes a review round
- **AND** the resulting ledger contains zero findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **AND** the resulting ledger contains one or more findings whose `severity == "low"` and whose `status ∈ {new, open}`
- **THEN** `handoff.state` SHALL equal `"review_no_findings"`
- **AND** `handoff.actionable_count` SHALL equal the total unresolved finding count (LOW included)
- **AND** `handoff.severity_summary` SHALL include the LOW count so downstream UI can display Remaining Risks

#### Scenario: Apply review with HIGH unresolved reports with_findings

- **WHEN** `specflow-review-apply review <CHANGE_ID>` finishes a review round
- **AND** the resulting ledger contains one or more findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **THEN** `handoff.state` SHALL equal `"review_with_findings"`
- **AND** `handoff.actionable_count` SHALL include those HIGH+ findings

#### Scenario: Apply autofix loop applies the same severity-aware gate

- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID>` finishes
- **THEN** `handoff.state` SHALL equal `"loop_no_findings"` if `unresolvedCriticalHighCount(ledger) == 0`
- **AND** `handoff.state` SHALL equal `"loop_with_findings"` otherwise
- **AND** the gate SHALL NOT consider MEDIUM or LOW findings

#### Scenario: Design review applies the same severity-aware gate as apply review

- **WHEN** `specflow-review-design review <CHANGE_ID>` finishes a review round
- **THEN** `handoff.state` SHALL be derived from `unresolvedCriticalHighCount` against the design ledger using the same mapping defined above
- **AND** the design autofix loop SHALL apply the same gate

#### Scenario: Reviewer decision string does not gate handoff state

- **WHEN** the review agent returns a `decision` string of `"approve"` while the ledger still contains a HIGH-severity open finding
- **THEN** `handoff.state` SHALL equal `"review_with_findings"` (gate is severity-driven, not decision-driven)
- **AND** the `decision` string MAY still be displayed in the review UI for context

### Requirement: Severity-aware gate SHALL be exposed via a single helper

The review runtime SHALL expose a single ledger helper, `unresolvedCriticalHighCount(ledger: ReviewLedger): number`, that returns the count of findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`. All apply / design review orchestrators, current-phase rendering, and tests SHALL use this helper as the single source of truth for the severity-aware gate. The legacy helper that counted only `severity == "high"` SHALL be removed; no caller may bypass `unresolvedCriticalHighCount` by hand-rolling the predicate.

#### Scenario: All gate sites call unresolvedCriticalHighCount

- **WHEN** the apply review orchestrator, design review orchestrator, or current-phase renderer computes `handoff.state` or "Next Recommended Action"
- **THEN** the implementation SHALL call `unresolvedCriticalHighCount(ledger)` rather than re-implementing the predicate inline
- **AND** no production code path SHALL retain a HIGH-only severity check for gating

#### Scenario: Helper aggregates critical and high in one number

- **WHEN** `unresolvedCriticalHighCount` is invoked on a ledger with a `critical` open finding and a `high` open finding
- **THEN** the helper SHALL return `2`

## MODIFIED Requirements

### Requirement: Review handoff distinguishes actor kinds in review decisions

Review orchestration SHALL recognize the actor kind of the reviewer when
processing review outcomes. Review outcomes SHALL remain review-phase decisions
that are distinct from workflow `approve` and `reject` operations. The mapping
from review outcome to workflow transition SHALL account for whether the
reviewer is `human`, `ai-agent`, or `automation`. `automation` actors SHALL NOT
issue review outcomes and SHALL NOT participate in review phases.

Whenever this requirement refers to "no unresolved high findings", the gate SHALL be evaluated as `unresolvedCriticalHighCount(ledger) == 0` — i.e., the gate covers both `critical` and `high` severities, and ignores `medium` and `low` severities. MEDIUM and LOW findings SHALL NOT block the binding-approval handoff; they remain visible via `handoff.severity_summary` and Remaining Risks aggregation.

#### Scenario: Human reviewer approval is binding

- **WHEN** a `human` reviewer issues `review_approved`
- **THEN** the review orchestration SHALL treat the outcome as a binding review
  approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return
  `handoff.state = "review_approved"` (or `"review_no_findings"` for the
  apply / design review handoff payload, per the severity-aware gate
  requirement)

#### Scenario: Undelegated AI-agent reviewer approval is advisory only

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** no delegation exists for the current run
- **THEN** the review orchestration SHALL record the outcome as an advisory recommendation
- **AND** it SHALL NOT return `handoff.state = "review_approved"` based on
  this outcome alone
- **AND** the workflow SHALL NOT advance to the next gated phase based on this
  outcome alone

#### Scenario: Delegated AI-agent reviewer approval is binding

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** delegation is active for the current run
- **THEN** the review orchestration SHALL treat the outcome as a binding review
  approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return
  `handoff.state = "review_approved"` (or `"review_no_findings"` for the
  apply / design review handoff payload, per the severity-aware gate
  requirement)
- **AND** unresolved findings whose `severity ∈ {medium, low}` SHALL NOT
  prevent this binding handoff

#### Scenario: Request-changes outcome requires a phase revision

- **WHEN** a `human` reviewer or an `ai-agent` reviewer issues
  `request_changes`
- **THEN** the review orchestration SHALL return a non-approved handoff for the
  current phase
- **AND** the handoff SHALL require the phase-appropriate revise transition
  (`revise_design` or `revise_apply`) before the next
  review round
- **AND** delegation SHALL NOT change this mapping because `request_changes` is
  a review-phase outcome, not a gated workflow approval

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

- **WHEN** an automation source emits CI, webhook, or batch evidence during a
  review phase
- **THEN** the review orchestration MAY surface or persist that evidence for a
  reviewer
- **AND** it SHALL NOT treat the automation source as the reviewer or as a
  review outcome
