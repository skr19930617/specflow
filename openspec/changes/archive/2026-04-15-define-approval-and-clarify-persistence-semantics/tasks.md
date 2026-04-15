## 1. Define InteractionRecord types and schemas

> Define ApprovalRecord, ClarifyRecord types and their JSON Schema validation in src/types/ and dist/package/global/schemas/.

- [x] 1.1 Define ApprovalRecord type with fields: record_id, record_kind ('approval'), run_id, phase_from, phase_to, status ('pending' | 'approved' | 'rejected'), requested_at, decided_at (nullable), decision_actor (nullable ActorIdentity), event_ids (string[])
- [x] 1.2 Define ClarifyRecord type with fields: record_id, record_kind ('clarify'), run_id, phase, question, question_context?, answer?, status ('pending' | 'resolved'), asked_at, answered_at?, event_ids (string[])
- [x] 1.3 Define InteractionRecord discriminated union (ApprovalRecord | ClarifyRecord) and RecordKind type
- [x] 1.4 Implement generateRecordId(kind, runId, sequence) helper function returning '<kind>-<runId>-<sequence>' format
- [x] 1.5 Create JSON Schema files for approval-record.schema.json and clarify-record.schema.json in dist/package/global/schemas/interaction-records/
- [x] 1.6 Add schema validation for InteractionRecord types consistent with existing contract validation patterns

## 2. Define InteractionRecordStore interface and LocalFs implementation

> Create the InteractionRecordStore interface and LocalFsInteractionRecordStore that persists records to .specflow/runs/<runId>/records/<recordId>.json.

> Depends on: interaction-record-types

- [x] 2.1 Define InteractionRecordStore interface with methods: write(runId, record), read(runId, recordId), list(runId), delete(runId, recordId)
- [x] 2.2 Implement LocalFsInteractionRecordStore with file layout .specflow/runs/<runId>/records/<recordId>.json
- [x] 2.3 Implement atomic write (write-to-temp + rename) in LocalFsInteractionRecordStore.write()
- [x] 2.4 Implement createLocalFsInteractionRecordStore(projectRoot) factory function following existing store factory patterns
- [x] 2.5 Create InMemoryInteractionRecordStore for test use following existing test helper patterns

## 3. Integrate record creation into advance transition handler

> Extend AdvanceDeps with optional records field and create interaction records synchronously during approval/clarify transitions.

> Depends on: interaction-record-store

- [x] 3.1 Add optional records?: InteractionRecordStore to AdvanceDeps interface
- [x] 3.2 Identify and document which transitions require record creation (approval gate, clarify request, clarify response)
- [x] 3.3 Implement record creation logic in advanceRun for approval-related transitions: create ApprovalRecord with status 'pending' and write via records store; on decision transitions, read existing record, update status/decided_at/decision_actor, append event_id to event_ids, and write back
- [x] 3.4 Implement record creation logic in advanceRun for clarify-related transitions: create ClarifyRecord with status 'pending' and write via records store; on clarify_response, read existing record, update status to 'resolved'/answer/answered_at, append event_id to event_ids, and write back
- [x] 3.5 Ensure record write failure causes transition failure (synchronous error propagation)
- [x] 3.6 When records is undefined, skip record creation and allow transition to succeed (backward compatibility)

## 4. Add record_ref to RunHistoryEntry

> Extend RunHistoryEntry with optional record_ref field and populate it during record-associated transitions in advance.ts.

> Depends on: advance-integration

- [x] 4.1 Add optional record_ref?: string to RunHistoryEntry interface in src/types/contracts.ts
- [x] 4.2 Update history entry creation in advance.ts (lines 74-82) to include record_id when a record was created for the transition
- [x] 4.3 Update any JSON Schema for RunHistoryEntry if one exists to include optional record_ref field

## 5. Add record_id to surface event payloads

> Extend ApprovalPayload, ClarifyRequestPayload, and ClarifyResponsePayload with record_id field and update corresponding JSON Schema files.

> Depends on: interaction-record-types

- [x] 5.1 Add record_id: string to ApprovalPayload in src/contracts/surface-events.ts
- [x] 5.2 Add record_id: string to ClarifyRequestPayload in src/contracts/surface-events.ts
- [x] 5.3 Add record_id: string to ClarifyResponsePayload in src/contracts/surface-events.ts
- [x] 5.4 Update approval-payload.schema.json to include record_id as required string field
- [x] 5.5 Update clarify-request-payload.schema.json to include record_id as required string field
- [x] 5.6 Update clarify-response-payload.schema.json to include record_id as required string field
- [x] 5.7 Add optional record_id: string to RejectPayload in src/contracts/surface-events.ts (present when a pending ApprovalRecord exists, omitted otherwise)
- [x] 5.8 Update reject-payload.schema.json to include record_id as optional string field

## 6. Tests and verification for interaction record persistence

> Add comprehensive tests covering record creation, store operations, advance integration, and backward compatibility, then run all verification steps.

> Depends on: advance-integration, history-record-ref, surface-event-record-id

- [x] 6.1 Write unit tests for generateRecordId helper function
- [x] 6.2 Write unit tests for InMemoryInteractionRecordStore (write, read, list, delete)
- [x] 6.3 Write integration tests for LocalFsInteractionRecordStore (file creation, atomic write, directory structure)
- [x] 6.4 Write tests for advance with records injected: verify record creation on approval transitions
- [x] 6.5 Write tests for advance with records injected: verify record creation on clarify transitions
- [x] 6.6 Write tests for advance with records undefined: verify transitions succeed without record creation (backward compat)
- [x] 6.7 Write tests verifying record_ref is populated in RunHistoryEntry for record-associated transitions
- [x] 6.8 Write tests verifying record write failure causes transition failure
- [x] 6.9 Write tests for advance with records injected: verify record update on approval decision (status, decided_at, decision_actor, event_ids appended)
- [x] 6.10 Write tests for advance with records injected: verify record update on clarify response (status 'resolved', answer, answered_at, event_ids appended)
- [x] 6.11 Write tests verifying reject payload includes optional record_id when pending ApprovalRecord exists and omits it otherwise
- [x] 6.12 Run formatting, linting, type checking, and full test suite; fix any failures
