# surface-event-contract Specification

## Purpose
TBD - created by archiving change define-surface-event-contract-for-external-runtimes. Update Purpose after archive.

Related specs:
- `workflow-observation-events`: observation events are declarative notifications of state change emitted by the workflow core; surface events (defined here) are imperative commands to/from external surfaces. The two contracts are disjoint — they do not share an envelope schema. Each cross-references the other to disambiguate.
## Requirements
### Requirement: Surface event envelope defines the standard message wrapper

The system SHALL define a `SurfaceEventEnvelope` as the standard wrapper for all surface events, both outbound (specflow → surface) and inbound (surface → specflow). The envelope SHALL be transport-agnostic: it defines a pure data schema with no dependency on HTTP, WebSocket, or any other transport mechanism.

The envelope SHALL include the following required fields:
- `schema_version`: A string identifying the envelope schema version (e.g., `"1.0"`). Consumers SHALL use this field to handle version mismatches.
- `event_id`: A unique identifier for the event instance.
- `event_kind`: A string identifying the abstract event category (one of `approval`, `reject`, `clarify`, `resume`).
- `event_type`: A string identifying the concrete event type (e.g., `accept_spec`, `design_review_approved`).
- `direction`: A string literal `"outbound"` or `"inbound"` indicating the event flow direction.
- `timestamp`: An ISO 8601 timestamp of when the event was created.
- `correlation`: A correlation object (defined in a separate requirement).
- `actor`: An actor identity object (defined in a separate requirement).
- `surface`: A surface identity object (defined in a separate requirement).
- `payload`: An event-type-specific payload object (defined per concrete event type).

#### Scenario: Outbound event envelope is complete

- **WHEN** specflow emits an outbound event to a surface
- **THEN** the event SHALL conform to the `SurfaceEventEnvelope` schema
- **AND** `direction` SHALL be `"outbound"`
- **AND** all required fields SHALL be present and non-null

#### Scenario: Inbound event envelope is complete

- **WHEN** a surface sends an inbound command to specflow
- **THEN** the command SHALL conform to the `SurfaceEventEnvelope` schema
- **AND** `direction` SHALL be `"inbound"`
- **AND** all required fields SHALL be present and non-null

#### Scenario: Schema version enables forward compatibility

- **WHEN** a consumer receives an event with an unrecognized `schema_version`
- **THEN** the consumer SHALL be able to read `schema_version` before attempting to parse the full payload
- **AND** the consumer MAY reject the event with a version-mismatch error rather than failing silently

### Requirement: Correlation object provides event traceability

The envelope SHALL include a `correlation` object with the following required fields:
- `run_id`: The run identifier in `<change_id>-<N>` format.
- `change_id`: The change identifier.

The correlation object SHALL include the following optional fields:
- `sequence`: A monotonically increasing integer within a run for ordering events.
- `caused_by`: The `event_id` of the event that triggered this event (for request-response correlation).

#### Scenario: Correlation links events to a run

- **WHEN** a surface event is created for a workflow run
- **THEN** the `correlation.run_id` SHALL match the run's `run_id`
- **AND** the `correlation.change_id` SHALL match the run's `change_name`

#### Scenario: Caused-by enables request-response pairing

- **WHEN** an inbound command is sent in response to an outbound notification
- **THEN** the inbound event's `correlation.caused_by` SHALL contain the `event_id` of the outbound event it responds to

### Requirement: Actor identity reuses actor-surface-model taxonomy

The envelope's `actor` field SHALL conform to the actor identity model defined in `actor-surface-model`. The event contract module SHALL re-export the actor identity types from `actor-surface-model` so that consumers need only a single import.

The actor identity object SHALL include:
- `actor`: The actor kind (`human`, `ai-agent`, or `automation`) as defined by the actor-surface-model capability matrix.
- `actor_id`: A stable identifier for the specific actor instance.

For delegated approval events, the actor identity object SHALL additionally include:
- `delegated_by`: The actor kind of the delegating actor (always `human`).
- `delegated_by_id`: The stable identifier of the delegating human actor.

#### Scenario: Actor identity matches actor-surface-model taxonomy

- **WHEN** a surface event is created
- **THEN** the `actor.actor` field SHALL be one of `human`, `ai-agent`, or `automation`
- **AND** the `actor.actor_id` field SHALL be a non-empty string

#### Scenario: Re-exported types provide single-import access

- **WHEN** an external consumer imports the event contract module
- **THEN** the actor identity types SHALL be available without a separate import from `actor-surface-model`

#### Scenario: Delegated approval includes delegating human provenance

- **WHEN** a delegated approval event is created
- **THEN** the `actor` object SHALL include `delegated_by: "human"` and a non-empty `delegated_by_id`

### Requirement: Surface identity identifies the interaction mediation layer

The envelope's `surface` field SHALL conform to the surface taxonomy defined in `actor-surface-model`. The event contract module SHALL re-export the surface identity types.

The surface identity object SHALL include:
- `surface`: The surface type (at minimum `local-cli`, `remote-api`, `agent-native`, `batch`) as defined by the actor-surface-model surface taxonomy.
- `surface_id`: An optional string providing a specific surface instance identifier (e.g., a session ID).

#### Scenario: Surface identity matches surface taxonomy

- **WHEN** a surface event is created
- **THEN** the `surface.surface` field SHALL be one of the recognized surface types from `actor-surface-model`

#### Scenario: Surface ID is optional

- **WHEN** a surface event is created without a specific surface instance
- **THEN** the `surface.surface_id` field MAY be omitted or null
- **AND** the event SHALL still be valid

### Requirement: Event type system uses a hierarchical category-specialization model

The event type system SHALL define 4 abstract categories and their concrete specializations:

**Category `approval`** (gated decisions):
- `accept_spec` — approve spec to enter design
- `accept_design` — approve design to enter apply
- `accept_apply` — approve implementation for final merge

**Category `reject`**:
- `reject` — irreversible run rejection (human-only per actor-surface-model)

**Category `clarify`**:
- `clarify_request` — outbound: specflow requests clarification from user
- `clarify_response` — inbound: user provides clarification answer

**Category `resume`**:
- `resume` — resume a suspended run

**Review outcomes** (classified under `approval` category as they gate workflow progression):
- `design_review_approved` — design review passes
- `apply_review_approved` — apply review passes
- `request_changes` — reviewer requests changes
- `block` — reviewer blocks progression

Each concrete event type SHALL have a unique `event_type` string. The `event_kind` field SHALL contain the abstract category name.

#### Scenario: Every concrete event maps to exactly one abstract category

- **WHEN** a concrete event type is inspected
- **THEN** its `event_kind` SHALL be one of `approval`, `reject`, `clarify`, `resume`
- **AND** the mapping SHALL be static and deterministic

#### Scenario: Consumers can filter by abstract category

- **WHEN** a consumer subscribes to events by `event_kind`
- **THEN** it SHALL receive all concrete events within that category
- **AND** no events from other categories

#### Scenario: Review outcomes are classified under approval category

- **WHEN** `design_review_approved`, `apply_review_approved`, `request_changes`, or `block` is inspected
- **THEN** its `event_kind` SHALL be `approval`

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

### Requirement: Slash-command-to-event mapping is documented as a reference table

The spec SHALL include a normative reference table mapping local slash commands to their corresponding surface event types. This mapping is documentation only — surface adapters are responsible for implementing the translation at runtime. The core workflow SHALL NOT reference or depend on slash command names.

| Slash Command | Direction | Event Type | Event Kind |
|---------------|-----------|------------|------------|
| `/specflow.approve` | inbound | `accept_spec`, `accept_design`, or `accept_apply` | `approval` |
| `/specflow.reject` | inbound | `reject` | `reject` |
| `/specflow` (clarify phase) | outbound | `clarify_request` | `clarify` |
| User response to clarify | inbound | `clarify_response` | `clarify` |
| `/specflow.approve` (resume) | inbound | `resume` | `resume` |
| `/specflow.review_design` | outbound/inbound | `design_review_approved` or `request_changes` | `approval` |
| `/specflow.review_apply` | outbound/inbound | `apply_review_approved` or `request_changes` | `approval` |

#### Scenario: Slash command mapping covers all event types

- **WHEN** the reference table is inspected
- **THEN** every concrete event type defined in this spec SHALL appear in at least one row of the mapping table

#### Scenario: Core workflow does not reference slash commands

- **WHEN** the event contract types and schemas are inspected
- **THEN** they SHALL NOT contain references to slash command names
- **AND** the event contract SHALL be usable without any knowledge of the slash command system

### Requirement: Contract is provided as both TypeScript types and JSON Schema

The event contract SHALL be provided in two formats within this repository:
- **TypeScript type definitions**: Exported from the event contract module under `src/contracts/`. Actor and surface identity types SHALL be re-exported from `actor-surface-model`.
- **JSON Schema**: Provided as `.json` schema files for language-agnostic consumers.

The TypeScript types SHALL be the source of truth. JSON Schema files SHALL be generated or kept in sync with the TypeScript definitions.

#### Scenario: TypeScript types are importable from contracts

- **WHEN** a TypeScript consumer imports the event contract
- **THEN** it SHALL have access to `SurfaceEventEnvelope`, all concrete event payload types, actor identity types, and surface identity types from a single module path under `src/contracts/`

#### Scenario: JSON Schema covers the full envelope

- **WHEN** the JSON Schema files are inspected
- **THEN** there SHALL be a schema for `SurfaceEventEnvelope` that references sub-schemas for correlation, actor, surface, and each concrete payload type

#### Scenario: JSON Schema is included in the distribution bundle

- **WHEN** the build pipeline runs
- **THEN** JSON Schema files SHALL be included in the distribution bundle as defined by `contract-driven-distribution`

### Requirement: Outbound events conform to phase-router emission contract

Outbound surface events emitted by the `phase-router` for gated decisions SHALL conform to this event contract. The `phase-router` spec's requirement that "the event schema MUST conform to the Surface event contract (#100)" is satisfied by this spec.

#### Scenario: Phase-router gated events use the envelope

- **WHEN** the `phase-router` emits a gated surface event
- **THEN** the event SHALL conform to `SurfaceEventEnvelope` with `direction: "outbound"`
- **AND** the `event_type` SHALL match the concrete gated decision type

#### Scenario: Phase-router deduplication is preserved

- **WHEN** the `phase-router` applies its `(runId, phase, event_kind)` deduplication
- **THEN** the deduplication SHALL operate on the `event_type` field of the envelope
- **AND** the deduplication logic SHALL NOT be affected by this contract

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

