## ADDED Requirements

### Requirement: Review outcome events SHALL be emitted only when the HIGH+ severity gate is satisfied

The `apply_review_approved` and `design_review_approved` events SHALL be emitted only when the corresponding review ledger satisfies the HIGH+ severity gate defined in `review-orchestration` — namely, when no unresolved finding has `severity ∈ {critical, high}` and `status ∈ {new, open}`. Findings whose `severity ∈ {medium, low}` SHALL NOT block emission of `*_review_approved`. The reviewer's free-form `decision` string SHALL NOT be used as the gate; only the ledger's HIGH+ unresolved count drives event emission.

#### Scenario: apply_review_approved is emitted when no HIGH+ findings remain

- **WHEN** an apply review round (or autofix loop) finishes with `unresolvedCriticalHighCount(ledger) == 0`
- **AND** the reviewer is binding-eligible (per `review-orchestration`)
- **THEN** an `apply_review_approved` event SHALL be eligible for emission
- **AND** the presence of unresolved LOW or MEDIUM findings SHALL NOT prevent emission

#### Scenario: apply_review_approved is NOT emitted while HIGH+ findings remain

- **WHEN** an apply review round finishes with `unresolvedCriticalHighCount(ledger) > 0`
- **THEN** an `apply_review_approved` event SHALL NOT be emitted
- **AND** the run state SHALL remain in `apply_review`

#### Scenario: design_review_approved follows the same severity-aware rule

- **WHEN** a design review round (or autofix loop) finishes with `unresolvedCriticalHighCount(ledger) == 0` and the reviewer is binding-eligible
- **THEN** a `design_review_approved` event SHALL be eligible for emission
- **AND** unresolved LOW or MEDIUM findings SHALL NOT prevent emission

### Requirement: Review outcome payloads SHALL declare a `schema_version`

Review outcome event payloads (`design_review_approved`, `apply_review_approved`, `request_changes`, `block`) SHALL include an integer `schema_version` field. Newly emitted events SHALL set `schema_version = 2`, indicating that the gate is severity-aware (HIGH+ unresolved count). Consumers reading persisted events SHALL treat any payload missing `schema_version`, or whose `schema_version < 2`, as a legacy event whose `*_no_findings` / `*_with_findings` semantics were derived from `actionable_count` (all severities) rather than `unresolvedCriticalHighCount`.

#### Scenario: New review outcome events declare schema_version 2

- **WHEN** an `apply_review_approved`, `design_review_approved`, `request_changes`, or `block` event is created by the current runtime
- **THEN** its payload SHALL include `schema_version: 2`

#### Scenario: Legacy review outcome events are flagged on read

- **WHEN** a consumer reads a persisted review outcome event whose payload omits `schema_version`, or whose `schema_version < 2`
- **THEN** the consumer SHALL treat the event as `legacy_actionable_count_basis: true`
- **AND** the consumer MAY surface a warning that `_no_findings` / `_with_findings` for this event was derived from actionable_count (all severities) rather than the HIGH+ severity gate

#### Scenario: schema_version is forward-compatible

- **WHEN** a consumer encounters a payload whose `schema_version` is greater than the version it natively supports
- **THEN** the consumer SHALL still apply the "unknown payload fields are tolerated" rule
- **AND** required fields for the consumer's known schema SHALL still be validated

## MODIFIED Requirements

### Requirement: Each concrete event type defines a fixed payload schema

Each concrete event type SHALL define a payload schema with explicitly declared required and optional fields. External runtimes SHALL be able to validate payloads strictly against the declared schema. Payloads for events that are associated with interaction records SHALL include a `record_id` field linking the event to its persistence record.

**Approval payloads** (`accept_spec`, `accept_design`, `accept_apply`) SHALL include:
- `phase_from`: The workflow phase the approval transitions from (required).
- `phase_to`: The workflow phase the approval transitions to (required).
- `record_id`: The `record_id` of the associated `ApprovalRecord` (required).

**Reject payload** SHALL include:
- `phase_from`: The workflow phase where rejection occurred (required).
- `reason`: A human-readable rejection reason (optional).
- `record_id`: The `record_id` of the associated `ApprovalRecord`, if one exists in pending state (optional).

**Clarify request payload** (`clarify_request`, outbound) SHALL include:
- `question`: The clarification question text (required).
- `context`: Additional context for the question (optional).
- `record_id`: The `record_id` of the associated `ClarifyRecord` (required).

**Clarify response payload** (`clarify_response`, inbound) SHALL include:
- `answer`: The clarification answer text (required).
- `question_event_id`: The `event_id` of the corresponding `clarify_request` (required).
- `record_id`: The `record_id` of the associated `ClarifyRecord` (required).

**Resume payload** SHALL include:
- `phase_from`: The phase the run was suspended in (required).

**Review outcome payloads** (`design_review_approved`, `apply_review_approved`, `request_changes`, `block`) SHALL include:
- `phase_from`: The review phase (required).
- `reviewer_actor`: The actor identity of the reviewer (required).
- `summary`: A review summary text (optional).
- `issues`: An array of review issues (optional, for `request_changes` and `block`).
- `schema_version`: An integer declaring the gate semantics version (required for newly emitted events; current value `2`). See the "Review outcome payloads SHALL declare a `schema_version`" requirement for legacy-event handling.

#### Scenario: Approval payload includes record_id

- **WHEN** an `accept_spec` event is created
- **THEN** the payload SHALL include `phase_from`, `phase_to`, and `record_id`
- **AND** `record_id` SHALL reference the `ApprovalRecord` that was created when the approval-gated phase was entered
- **AND** all three fields SHALL be non-empty strings

#### Scenario: Clarify request payload includes record_id

- **WHEN** a `clarify_request` event is created
- **THEN** the payload SHALL include `question` and `record_id`
- **AND** `record_id` SHALL reference the `ClarifyRecord` created for this question

#### Scenario: Clarify response payload includes record_id

- **WHEN** a `clarify_response` event is created
- **THEN** the payload SHALL include `answer`, `question_event_id`, and `record_id`
- **AND** `record_id` SHALL match the `record_id` of the originating `clarify_request`

#### Scenario: Resume payload does not include record_id

- **WHEN** a `resume` event is created
- **THEN** the payload SHALL include `phase_from`
- **AND** the payload SHALL NOT include `record_id`

#### Scenario: Review outcome includes reviewer identity

- **WHEN** a `request_changes` event is created
- **THEN** the payload SHALL include `reviewer_actor` conforming to the actor identity schema
- **AND** the payload MAY include `issues` as an array
- **AND** newly emitted events SHALL include `schema_version: 2`

#### Scenario: Unknown payload fields are tolerated for forward compatibility

- **WHEN** a consumer receives a payload with fields not defined in the current schema version
- **THEN** the consumer SHALL ignore unknown fields rather than rejecting the event
- **AND** validation SHALL pass if all required fields are present

#### Scenario: Reject payload optionally includes record_id

- **WHEN** a `reject` event is created and a pending `ApprovalRecord` exists for the run
- **THEN** the payload MAY include `record_id` referencing the pending approval record
- **AND** if no pending approval record exists, `record_id` SHALL be omitted
