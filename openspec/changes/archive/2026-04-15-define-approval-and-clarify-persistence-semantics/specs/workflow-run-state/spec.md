## MODIFIED Requirements

### Requirement: Run-state history entries record actor provenance

Each history entry appended to run-state SHALL include actor provenance, regardless of which surface or adapter initiated the transition. The provenance SHALL identify the actor kind and the actor identity. History entries for transitions that create or update interaction records SHALL additionally include a `record_ref` field linking the entry to the associated persistence record.

#### Scenario: History entry includes actor kind and identity

- **WHEN** a run-state transition is recorded as a history entry
- **THEN** the entry SHALL include an `actor` field identifying the actor kind (`human`, `ai-agent`, or `automation`)
- **AND** the entry SHALL include an `actor_id` field providing a stable identifier for the specific actor (e.g., username, agent name, or automation source identifier)

#### Scenario: Delegated gated approval history captures delegating human provenance

- **WHEN** `accept_spec`, `accept_design`, or `accept_apply` is recorded as a
  delegated `approve` transition
- **THEN** the entry SHALL include `actor: "ai-agent"` and `actor_id`
  identifying the executing ai-agent actor
- **AND** the entry SHALL include `delegated_by: "human"`
- **AND** the entry SHALL include `delegated_by_id` identifying the
  delegating human actor

#### Scenario: Surface provenance is optional

- **WHEN** a history entry is created
- **THEN** the entry MAY include a `surface` field identifying the surface type
- **AND** omitting the `surface` field SHALL NOT cause an error

#### Scenario: System-generated transitions use automation actor

- **WHEN** a system-generated event (timeout, auto-advance) triggers a transition
- **THEN** the history entry SHALL record `actor: "automation"` and `actor_id` SHALL identify the automation source (e.g., `"system:timeout"`, `"ci:webhook"`)

#### Scenario: Legacy runs without provenance default to unknown

- **WHEN** run-state is read and a history entry lacks the `actor` field
- **THEN** the system SHALL treat the actor as `"unknown"`
- **AND** existing run behavior SHALL NOT be altered

#### Scenario: History entry includes record_ref for record-associated transitions

- **WHEN** a transition creates or updates an interaction record (e.g., entering `spec_ready`, processing `accept_spec`, issuing a clarify question, or receiving a clarify response)
- **THEN** the history entry SHALL include a `record_ref` field containing the `record_id` of the associated interaction record
- **AND** the `record_ref` field SHALL be a string matching the `record_id` of the corresponding `ApprovalRecord` or `ClarifyRecord`

#### Scenario: History entry omits record_ref for non-record transitions

- **WHEN** a transition does not involve interaction record creation or update (e.g., `check_scope`, `continue_proposal`, `validate_spec`)
- **THEN** the history entry SHALL NOT include a `record_ref` field
- **AND** the absence of `record_ref` SHALL NOT cause an error

#### Scenario: Existing history entries without record_ref remain valid

- **WHEN** run-state is read and a history entry lacks the `record_ref` field
- **THEN** the system SHALL treat the entry as having no associated interaction record
- **AND** no migration of existing data SHALL be required
