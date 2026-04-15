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

#### Scenario: Unknown payload fields are tolerated for forward compatibility

- **WHEN** a consumer receives a payload with fields not defined in the current schema version
- **THEN** the consumer SHALL ignore unknown fields rather than rejecting the event
- **AND** validation SHALL pass if all required fields are present

#### Scenario: Reject payload optionally includes record_id

- **WHEN** a `reject` event is created and a pending `ApprovalRecord` exists for the run
- **THEN** the payload MAY include `record_id` referencing the pending approval record
- **AND** if no pending approval record exists, `record_id` SHALL be omitted

## ADDED Requirements

### Requirement: Event-to-record cardinality is N:1

The system SHALL support multiple surface events referencing the same interaction record. The `record_id` field in event payloads SHALL establish an N:1 relationship from events to records. A single `ApprovalRecord` SHALL be referenced by both the approval request event (outbound) and the approval decision event (inbound). A single `ClarifyRecord` SHALL be referenced by both the `clarify_request` event and the `clarify_response` event.

#### Scenario: Approval lifecycle produces two events referencing one record

- **WHEN** an approval gate is entered and later decided
- **THEN** the outbound approval request event and the inbound approval decision event SHALL both contain the same `record_id`
- **AND** the `ApprovalRecord.event_ids` array SHALL contain both event_id values

#### Scenario: Clarify lifecycle produces two events referencing one record

- **WHEN** a clarify question is issued and later answered
- **THEN** the `clarify_request` event and the `clarify_response` event SHALL both contain the same `record_id`
- **AND** the `ClarifyRecord.event_ids` array SHALL contain both event_id values

#### Scenario: Record can be found from any associated event

- **WHEN** a consumer has an event with a `record_id` in its payload
- **THEN** the consumer SHALL be able to retrieve the full interaction record using `InteractionRecordStore.read(runId, recordId)`
- **AND** the record SHALL contain the complete lifecycle state including all associated event_ids
