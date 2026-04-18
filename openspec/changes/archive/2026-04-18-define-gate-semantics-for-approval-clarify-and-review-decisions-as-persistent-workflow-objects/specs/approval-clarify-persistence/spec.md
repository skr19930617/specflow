## REMOVED Requirements

### Requirement: Approval record captures the full lifecycle of a gated decision
**Reason**: Replaced by the unified `GateRecord` schema introduced by `workflow-gate-semantics`. Approval-specific fields are now expressed as `gate_kind: "approval"` with approval-specific context carried in the gate's `payload`.
**Migration**: A one-time migration SHALL convert every existing `ApprovalRecord` JSON file under `.specflow/runs/<run_id>/records/` into a `GateRecord` with `gate_kind: "approval"`. The migration SHALL preserve `record_id → gate_id`, `run_id`, `phase_from` / `phase_to` (moved into `payload`), `status` mapping (`pending` → `pending`, `approved` / `rejected` → `resolved`), `requested_at → created_at`, `decided_at → resolved_at`, `decision_actor`, and `event_ids`. After migration, raw `ApprovalRecord` reads SHALL NOT be supported.

### Requirement: Clarify record captures a single question-response pair
**Reason**: Replaced by the unified `GateRecord` schema. Clarify-specific fields are now expressed as `gate_kind: "clarify"` with the question text and context carried in the gate's `payload`.
**Migration**: A one-time migration SHALL convert every existing `ClarifyRecord` JSON file into a `GateRecord` with `gate_kind: "clarify"`. The migration SHALL preserve `record_id → gate_id`, `run_id`, `phase → originating_phase`, `question` and `question_context` (moved into `payload`), `answer` (moved into `payload` once resolved), `status` mapping (`pending` → `pending`, `resolved` → `resolved`), `asked_at → created_at`, `answered_at → resolved_at`, and `event_ids`. After migration, raw `ClarifyRecord` reads SHALL NOT be supported.

### Requirement: InteractionRecordStore provides the persistence interface
**Reason**: Replaced by `GateRecordStore` (see ADDED Requirements below). The new interface removes the `delete` operation because persistent gate objects are audit-relevant and SHALL NOT be deleted at the API level.
**Migration**: Update all callers to use `GateRecordStore.read` / `write` / `list`. Any caller that relied on per-record `delete` SHALL be rewritten to rely on run-directory cascade deletion instead.

### Requirement: LocalFsInteractionRecordStore implements the interface for local mode
**Reason**: Replaced by `LocalFsGateRecordStore`. Naming follows the new `GateRecord` schema; the file layout under `.specflow/runs/<run_id>/records/` is preserved so existing run directories continue to work after migration.
**Migration**: Rename the implementation class and update CLI entry-point injection to construct `LocalFsGateRecordStore` instead. No additional runtime behavior changes are introduced by the rename alone.

## ADDED Requirements

### Requirement: GateRecord is the unified persistence unit for workflow gates

The system SHALL define a `GateRecord` as the single persistence unit for every workflow gate. `GateRecord` SHALL cover all three gate kinds defined by `workflow-gate-semantics` (`approval`, `clarify`, `review_decision`). The record SHALL be created synchronously by the core runtime transition handler whenever a gate is created.

The `GateRecord` SHALL include the following fields:
- `gate_id`: A unique identifier for this record and its gate (required).
- `gate_kind`: One of `"approval"`, `"clarify"`, or `"review_decision"` (required).
- `run_id`: The run this record belongs to (required).
- `originating_phase`: The workflow phase that produced the gate (required).
- `status`: One of `"pending"`, `"resolved"`, or `"superseded"` (required).
- `reason`: A short human-readable string describing why the gate is open (required).
- `payload`: A kind-specific object carrying the detailed context needed to resolve the gate (required). For `approval` the payload SHALL include `phase_from` and `phase_to`. For `clarify` it SHALL include `question` and optional `question_context`, plus the `answer` text once resolved. For `review_decision` it SHALL include the `review_round_id` and the `findings` snapshot.
- `eligible_responder_roles`: A non-empty array of actor role identifiers (required).
- `allowed_responses`: The fixed response set determined by `gate_kind` (required).
- `created_at`: ISO 8601 timestamp when the record entered `pending` (required).
- `resolved_at`: ISO 8601 timestamp when the record reached `resolved` or `superseded` (required once non-pending, null otherwise).
- `decision_actor`: The actor identity that resolved the gate (required when `status` is `resolved`, null when `pending`, null when `superseded`).
- `event_ids`: An ordered array of surface event ids (required, may be empty initially).

The legacy fields `record_id` and `record_kind` SHALL NOT appear in `GateRecord`; they are replaced by `gate_id` and `gate_kind` respectively.

#### Scenario: GateRecord is created when a gate is issued

- **WHEN** the runtime creates a new gate
- **THEN** a `GateRecord` SHALL be written synchronously with `status: "pending"`, `resolved_at: null`, and `decision_actor: null`
- **AND** all required fields SHALL be populated before the transition that issued the gate returns

#### Scenario: GateRecord is updated when the gate resolves

- **WHEN** a valid response transitions the gate to `resolved`
- **THEN** the record SHALL be updated with `status: "resolved"`, `resolved_at` set to the current timestamp, `decision_actor` set to the responder identity
- **AND** the response event id SHALL be appended to `event_ids`

#### Scenario: GateRecord is updated when the gate is superseded

- **WHEN** a gate transitions to `superseded`
- **THEN** the record SHALL be updated with `status: "superseded"`, `resolved_at` set to the current timestamp
- **AND** `decision_actor` SHALL remain null
- **AND** the superseding event id SHALL be appended to `event_ids`

#### Scenario: Pending record has null resolution fields

- **WHEN** a `GateRecord` has `status: "pending"`
- **THEN** `resolved_at` SHALL be null
- **AND** `decision_actor` SHALL be null

### Requirement: GateRecordStore provides the persistence interface without a delete operation

The system SHALL define a `GateRecordStore` interface as the dedicated persistence abstraction for gate records. This interface SHALL be separate from `RunArtifactStore` to maintain clear responsibility separation. The interface SHALL expose the following operations:

- `write(runId, record)`: Persist a new or updated gate record.
- `read(runId, gateId)`: Read a single gate record by its `gate_id`.
- `list(runId)`: List all gate records for a given run (including superseded ones).

The interface SHALL NOT expose a `delete` operation. Removal of gate records SHALL occur only as part of run-directory cascade deletion (`run-artifact-store-conformance` and `workspace-context`) when a run is abandoned.

#### Scenario: Write persists a new record

- **WHEN** `write(runId, record)` is invoked with a new record
- **THEN** the record SHALL be persisted at the storage location corresponding to the run and gate identifiers
- **AND** subsequent `read(runId, gateId)` SHALL return the persisted record

#### Scenario: Write updates an existing record

- **WHEN** `write(runId, record)` is invoked with an existing `gate_id`
- **THEN** the stored record SHALL be replaced with the new content
- **AND** the replacement SHALL be atomic (no partial reads)

#### Scenario: Read returns null for non-existent record

- **WHEN** `read(runId, gateId)` is invoked with a non-existent `gate_id`
- **THEN** the operation SHALL return null
- **AND** it SHALL NOT throw an error

#### Scenario: List returns all records for a run including superseded ones

- **WHEN** `list(runId)` is invoked for a run with 3 records (1 pending, 1 resolved, 1 superseded)
- **THEN** it SHALL return all 3 records

#### Scenario: List returns empty array for run with no records

- **WHEN** `list(runId)` is invoked for a run with no gate records
- **THEN** it SHALL return an empty array

#### Scenario: Delete operation is not exposed

- **WHEN** a caller attempts to delete an individual gate record
- **THEN** no `GateRecordStore.delete(runId, gateId)` method SHALL be available
- **AND** record removal SHALL only occur through run-directory cascade deletion

### Requirement: LocalFsGateRecordStore implements the interface for local mode

The system SHALL provide a `LocalFsGateRecordStore` as the local filesystem implementation of `GateRecordStore`. This implementation SHALL store records as JSON files under `.specflow/runs/<run_id>/records/<gate_id>.json`.

#### Scenario: Local implementation uses atomic writes

- **WHEN** `LocalFsGateRecordStore.write()` persists a record
- **THEN** it SHALL use atomic write (write-to-temp then rename) to prevent partial reads

#### Scenario: Local implementation reads from the conventional path

- **WHEN** `LocalFsGateRecordStore.read(runId, gateId)` is invoked
- **THEN** it SHALL read from `.specflow/runs/<runId>/records/<gateId>.json`

#### Scenario: Local implementation lists by reading the records directory

- **WHEN** `LocalFsGateRecordStore.list(runId)` is invoked
- **THEN** it SHALL enumerate `.specflow/runs/<runId>/records/*.json` and parse each file

### Requirement: Legacy record schema SHALL NOT be read after migration

Once the one-time migration converts `.specflow/runs/<run_id>/records/*.json` entries from the legacy `ApprovalRecord` / `ClarifyRecord` shape into `GateRecord`, the runtime SHALL NOT retain any code path that reads the legacy shape directly. Runs whose records have not been migrated SHALL surface a clear migration error instead of best-effort compatibility reads.

#### Scenario: Reading an unmigrated legacy record fails fast

- **WHEN** the runtime attempts to `read(runId, recordId)` for a file that still uses the legacy `record_kind` / `record_id` schema
- **THEN** the call SHALL return an error identifying the record as unmigrated
- **AND** it SHALL NOT silently coerce the legacy fields into `GateRecord` shape

#### Scenario: Migration script is idempotent

- **WHEN** the one-time migration is run against a records directory that has already been migrated
- **THEN** it SHALL detect the `GateRecord` shape and exit without modifying files

## MODIFIED Requirements

### Requirement: Records are stored under the run directory with cascade lifecycle

Interaction records SHALL be stored under `.specflow/runs/<run_id>/records/` as individual JSON files named `<gate_id>.json`. Record lifecycle SHALL be coupled to the run lifecycle: deleting a run directory SHALL cascade-delete all contained records. Individual records SHALL NOT be deletable through any persistence API; run-directory cascade is the only supported removal path.

#### Scenario: Record file location follows convention

- **WHEN** a gate record with `gate_id: "gate-abc123"` is written for run `my-feature-1`
- **THEN** the record SHALL be stored at `.specflow/runs/my-feature-1/records/gate-abc123.json`

#### Scenario: Run deletion cascades to records

- **WHEN** a run directory `.specflow/runs/my-feature-1/` is deleted
- **THEN** all records under `.specflow/runs/my-feature-1/records/` SHALL be deleted as a consequence of the directory removal
- **AND** no orphaned record files SHALL remain

#### Scenario: Records directory is created on first write

- **WHEN** the first gate record is written for a run
- **THEN** the `records/` subdirectory SHALL be created if it does not exist
- **AND** the write SHALL NOT fail due to a missing directory

#### Scenario: Individual record deletion is not supported

- **WHEN** a caller attempts to delete a single gate record through any persistence API
- **THEN** no such API SHALL be provided
- **AND** the only supported record-removal path SHALL be cascade deletion when the containing run directory is removed

### Requirement: Core runtime creates records synchronously during transitions

The core runtime transition handler SHALL be responsible for creating and updating gate records. Record creation SHALL happen synchronously as part of the transition, ensuring atomicity between the state transition and the record persistence. The runtime SHALL also be responsible for detecting concurrency conflicts (as defined by `workflow-gate-semantics`) and transitioning superseded gates in the same synchronous flow.

#### Scenario: Gate record creation is part of the transition

- **WHEN** the core runtime processes a transition that issues a gate
- **THEN** it SHALL create the `GateRecord` using `GateRecordStore.write()` as part of the same synchronous flow
- **AND** if the record write fails, the transition SHALL also fail

#### Scenario: Clarify record creation is part of the clarify issuance

- **WHEN** the core runtime issues a clarify question
- **THEN** it SHALL create a `GateRecord` with `gate_kind: "clarify"` using `GateRecordStore.write()` before returning
- **AND** the returned clarify event SHALL include the `gate_id`

#### Scenario: Record update is part of the decision or response processing

- **WHEN** the core runtime processes an approval decision, a clarify response, or a review decision
- **THEN** it SHALL read the existing record, update it, and write it back using `GateRecordStore.write()`
- **AND** the updated record SHALL reflect the new status before the transition completes

#### Scenario: Superseding a prior pending gate is atomic with new gate creation

- **WHEN** the runtime creates a new gate that supersedes an existing pending gate for the same `gate_kind` and `originating_phase`
- **THEN** the prior record SHALL be updated to `status: "superseded"` in the same synchronous flow as the new record's creation
- **AND** if either write fails, both SHALL be rolled back together

### Requirement: CLI entry points inject InteractionRecordStore

CLI entry points SHALL instantiate a `LocalFsGateRecordStore` at startup and inject it into the core runtime alongside the existing `RunArtifactStore`, `ChangeArtifactStore`, and `WorkspaceContext`. The previous `LocalFsInteractionRecordStore` injection is removed and SHALL be replaced wherever it was used.

#### Scenario: specflow-run injects GateRecordStore for commands that need it

- **WHEN** `specflow-run advance` is invoked for a transition that creates or updates gate records
- **THEN** it SHALL construct a `LocalFsGateRecordStore` and pass it to the core runtime
- **AND** the core runtime SHALL NOT construct its own store implementation

#### Scenario: GateRecordStore injection does not affect unrelated commands

- **WHEN** `specflow-run status` is invoked (a command that does not interact with gate records)
- **THEN** the CLI MAY skip constructing `GateRecordStore`
- **AND** the command SHALL function identically to its prior behavior
