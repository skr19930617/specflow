## ADDED Requirements

### Requirement: Approval record captures the full lifecycle of a gated decision

The system SHALL define an `ApprovalRecord` as the persistence unit for a gated approval interaction. Each approval record SHALL represent a single approval gate instance within a run. The record SHALL be created synchronously by the core runtime transition handler when an approval-gated phase is entered.

The `ApprovalRecord` SHALL include the following fields:
- `record_id`: A unique identifier for this record (required).
- `record_kind`: The literal string `"approval"` (required).
- `run_id`: The run this record belongs to (required).
- `phase_from`: The workflow phase that triggered the approval request (required).
- `phase_to`: The target workflow phase upon approval (required).
- `status`: One of `"pending"`, `"approved"`, or `"rejected"` (required).
- `requested_at`: ISO 8601 timestamp when the approval was requested (required).
- `decided_at`: ISO 8601 timestamp when the decision was made (required when status is not `"pending"`, null otherwise).
- `decision_actor`: Actor identity of who made the decision (required when status is not `"pending"`, null otherwise).
- `event_ids`: An array of `event_id` values for all surface events associated with this record (required, may be empty initially).

#### Scenario: Approval record is created when entering an approval-gated phase

- **WHEN** a run transitions to `spec_ready`, `design_ready`, or `apply_ready`
- **THEN** the core runtime transition handler SHALL synchronously create an `ApprovalRecord` with `status: "pending"` and `decided_at: null`
- **AND** the `phase_from` SHALL match the phase being entered
- **AND** the `phase_to` SHALL match the target phase upon approval

#### Scenario: Approval record is updated when decision is made

- **WHEN** `accept_spec`, `accept_design`, or `accept_apply` is applied to a run
- **THEN** the corresponding `ApprovalRecord` SHALL be updated with `status: "approved"`, `decided_at` set to the current timestamp, and `decision_actor` set to the acting actor identity
- **AND** the event_id of the approval event SHALL be appended to `event_ids`

#### Scenario: Approval record is updated on rejection

- **WHEN** `reject` is applied to a run that has a pending approval record
- **THEN** the corresponding `ApprovalRecord` SHALL be updated with `status: "rejected"`, `decided_at` set to the current timestamp, and `decision_actor` set to the acting actor identity

#### Scenario: Decision values are limited to approve and reject

- **WHEN** an approval decision is recorded
- **THEN** `status` SHALL be one of `"approved"` or `"rejected"`
- **AND** no other values (timeout, cancel, etc.) SHALL be accepted

#### Scenario: Pending approval has null decision fields

- **WHEN** an approval record has `status: "pending"`
- **THEN** `decided_at` SHALL be null
- **AND** `decision_actor` SHALL be null

### Requirement: Clarify record captures a single question-response pair

The system SHALL define a `ClarifyRecord` as the persistence unit for a single clarify interaction. Each clarify record SHALL represent exactly one question and its response. A phase may produce multiple clarify records. The record SHALL be created synchronously by the core runtime when a clarify question is issued.

The `ClarifyRecord` SHALL include the following fields:
- `record_id`: A unique identifier for this record (required).
- `record_kind`: The literal string `"clarify"` (required).
- `run_id`: The run this record belongs to (required).
- `phase`: The workflow phase where clarification occurred (required).
- `question`: The clarification question text (required).
- `question_context`: Additional context for the question (optional).
- `answer`: The clarification answer text (required when resolved, null when pending).
- `status`: One of `"pending"` or `"resolved"` (required).
- `asked_at`: ISO 8601 timestamp when the question was asked (required).
- `answered_at`: ISO 8601 timestamp when the answer was received (required when resolved, null when pending).
- `event_ids`: An array of `event_id` values for all surface events associated with this record (required, may be empty initially).

#### Scenario: Clarify record is created when a clarify question is issued

- **WHEN** the core runtime issues a clarify question during a clarify-capable phase
- **THEN** a `ClarifyRecord` SHALL be created with `status: "pending"`, `answer: null`, and `answered_at: null`
- **AND** the `question` field SHALL contain the question text
- **AND** the `phase` field SHALL match the current workflow phase

#### Scenario: Clarify record is auto-resolved when response is received

- **WHEN** a `clarify_response` is received for a pending clarify record
- **THEN** the record SHALL be updated with `status: "resolved"`, `answer` set to the response text, and `answered_at` set to the current timestamp
- **AND** the event_id of the response event SHALL be appended to `event_ids`

#### Scenario: Response automatically resolves the record without explicit action

- **WHEN** a clarify record receives its response
- **THEN** the record SHALL transition directly to `"resolved"` status
- **AND** no separate resolution action SHALL be required

#### Scenario: Multiple clarify records exist within one phase

- **WHEN** a clarify-capable phase issues three questions sequentially
- **THEN** three separate `ClarifyRecord` instances SHALL be created
- **AND** each SHALL have its own `record_id`

### Requirement: InteractionRecordStore provides the persistence interface

The system SHALL define an `InteractionRecordStore` interface as the dedicated persistence abstraction for interaction records. This interface SHALL be separate from `RunArtifactStore` to maintain clear responsibility separation.

The `InteractionRecordStore` interface SHALL provide the following operations:
- `write(runId, record)`: Persist a new or updated interaction record.
- `read(runId, recordId)`: Read a single interaction record by its `record_id`.
- `list(runId)`: List all interaction records for a given run.
- `delete(runId, recordId)`: Delete a single interaction record.

#### Scenario: Write persists a new record

- **WHEN** `write(runId, record)` is invoked with a new record
- **THEN** the record SHALL be persisted at the storage location corresponding to the run and record identifiers
- **AND** subsequent `read(runId, recordId)` SHALL return the persisted record

#### Scenario: Write updates an existing record

- **WHEN** `write(runId, record)` is invoked with an existing `record_id`
- **THEN** the stored record SHALL be replaced with the new content
- **AND** the replacement SHALL be atomic (no partial reads)

#### Scenario: Read returns null for non-existent record

- **WHEN** `read(runId, recordId)` is invoked with a non-existent `record_id`
- **THEN** the operation SHALL return null
- **AND** it SHALL NOT throw an error

#### Scenario: List returns all records for a run

- **WHEN** `list(runId)` is invoked for a run with 3 records
- **THEN** it SHALL return all 3 records
- **AND** the result SHALL include both approval and clarify records

#### Scenario: List returns empty array for run with no records

- **WHEN** `list(runId)` is invoked for a run with no interaction records
- **THEN** it SHALL return an empty array

### Requirement: Records are stored under the run directory with cascade lifecycle

Interaction records SHALL be stored under `.specflow/runs/<run_id>/records/` as individual JSON files named `<record_id>.json`. Record lifecycle SHALL be coupled to the run lifecycle: deleting a run directory SHALL cascade-delete all contained records.

#### Scenario: Record file location follows convention

- **WHEN** an interaction record with `record_id: "rec-abc123"` is written for run `my-feature-1`
- **THEN** the record SHALL be stored at `.specflow/runs/my-feature-1/records/rec-abc123.json`

#### Scenario: Run deletion cascades to records

- **WHEN** a run directory `.specflow/runs/my-feature-1/` is deleted
- **THEN** all records under `.specflow/runs/my-feature-1/records/` SHALL be deleted as a consequence of the directory removal
- **AND** no orphaned record files SHALL remain

#### Scenario: Records directory is created on first write

- **WHEN** the first interaction record is written for a run
- **THEN** the `records/` subdirectory SHALL be created if it does not exist
- **AND** the write SHALL NOT fail due to a missing directory

### Requirement: LocalFsInteractionRecordStore implements the interface for local mode

The system SHALL provide a `LocalFsInteractionRecordStore` as the local filesystem implementation of `InteractionRecordStore`. This implementation SHALL store records as JSON files under `.specflow/runs/<run_id>/records/`.

#### Scenario: Local implementation uses atomic writes

- **WHEN** `LocalFsInteractionRecordStore.write()` persists a record
- **THEN** it SHALL use atomic write (write-to-temp then rename) to prevent partial reads

#### Scenario: Local implementation reads from the conventional path

- **WHEN** `LocalFsInteractionRecordStore.read(runId, recordId)` is invoked
- **THEN** it SHALL read from `.specflow/runs/<runId>/records/<recordId>.json`

#### Scenario: Local implementation lists by reading the records directory

- **WHEN** `LocalFsInteractionRecordStore.list(runId)` is invoked
- **THEN** it SHALL enumerate `.specflow/runs/<runId>/records/*.json` and parse each file

### Requirement: Core runtime creates records synchronously during transitions

The core runtime transition handler SHALL be responsible for creating and updating interaction records. Record creation SHALL happen synchronously as part of the transition, ensuring atomicity between the state transition and the record persistence.

#### Scenario: Approval record creation is part of the transition

- **WHEN** the core runtime processes a transition to `spec_ready`
- **THEN** it SHALL create the `ApprovalRecord` using `InteractionRecordStore.write()` as part of the same synchronous flow
- **AND** if the record write fails, the transition SHALL also fail

#### Scenario: Clarify record creation is part of the clarify issuance

- **WHEN** the core runtime issues a clarify question
- **THEN** it SHALL create the `ClarifyRecord` using `InteractionRecordStore.write()` before returning
- **AND** the returned clarify event SHALL include the `record_id`

#### Scenario: Record update is part of the decision/response processing

- **WHEN** the core runtime processes an approval decision or clarify response
- **THEN** it SHALL read the existing record, update it, and write it back using `InteractionRecordStore.write()`
- **AND** the updated record SHALL reflect the new status before the transition completes

### Requirement: CLI entry points inject InteractionRecordStore

CLI entry points SHALL instantiate a `LocalFsInteractionRecordStore` at startup and inject it into the core runtime alongside the existing `RunArtifactStore`, `ChangeArtifactStore`, and `WorkspaceContext`.

#### Scenario: specflow-run injects InteractionRecordStore for commands that need it

- **WHEN** `specflow-run advance` is invoked for a transition that creates or updates records
- **THEN** it SHALL construct a `LocalFsInteractionRecordStore` and pass it to the core runtime
- **AND** the core runtime SHALL NOT construct its own store implementation

#### Scenario: InteractionRecordStore injection does not affect unrelated commands

- **WHEN** `specflow-run status` is invoked (a command that does not interact with records)
- **THEN** the CLI MAY skip constructing `InteractionRecordStore`
- **AND** the command SHALL function identically to its current behavior
