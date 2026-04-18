## 1. Gate Record Foundation ✓

> Define GateRecord as the canonical persistence model and replace the legacy interaction store at the data-layer boundary.

- [x] 1.1 Define GateKind, GateStatus, GatePayload, GateRecord, and GateRecordStore and remove the individual delete API from the contract
- [x] 1.2 Implement LocalFsGateRecordStore with write-to-temp plus rename semantics while preserving the existing records/ directory layout and gate_id filename mapping
- [x] 1.3 Add FakeGateRecordStore for runtime and transition tests
- [x] 1.4 Add unit coverage for read, write, list, no-delete behavior, and atomic persistence guarantees

## 2. Legacy Record Migration ✓

> Provide an idempotent migration and rollback path from legacy approval and clarify records to GateRecord JSON.

> Depends on: gate-record-foundation

- [x] 2.1 Implement forward migration that rewrites legacy approval and clarify record JSON in place and preserves record_id as gate_id
- [x] 2.2 Write .migrated sentinels and .backup snapshots per run so migration is idempotent and reversible
- [x] 2.3 Implement --undo to restore original files from .backup and remove the .migrated sentinel before any post-migration writes
- [x] 2.4 Make GateRecordStore read fail fast with UnmigratedRecordError when a legacy-shaped file is encountered
- [x] 2.5 Add tests for mixed directories, repeated migration runs, unknown record_kind values, and partially corrupted legacy records

## 3. Runtime Gate Helpers ✓

> Implement gate issuance and resolution semantics, including supersede, validation, and recovery rules, in the runtime layer.

> Depends on: gate-record-foundation

- [x] 3.1 Implement the runtime-owned allowed_responses mapping for approval, clarify, and review_decision gates
- [x] 3.2 Implement issueGate with same gate_kind plus originating_phase concurrency checks, paired supersede and create writes, and event_ids updates
- [x] 3.3 Implement resolveGate with allowed response validation, eligible responder role checks, terminal-state immutability, and resolved metadata writes
- [x] 3.4 Add in-process locking, best-effort rollback, and startup self-healing to reconcile duplicate pending gates after partial failures
- [x] 3.5 Add tests for supersede behavior, invalid response rejection, role mismatch rejection, non-pending response attempts, and rollback semantics

## 4. Transition and CLI Gate Adoption ✓

> Replace legacy transition record issuance and CLI wiring with GateRecord-backed behavior without changing run paths.

> Depends on: legacy-record-migration, runtime-gate-helpers

- [x] 4.1 Replace ApprovalRecord and ClarifyRecord writes in spec, design, and apply transitions with issueGate inputs and GateRecord payloads
- [x] 4.2 Update phase advancement checks so pending approval and review_decision gates block advancement while clarify gates remain non-blocking by themselves
- [x] 4.3 Switch CLI and runtime injection sites from LocalFsInteractionRecordStore to LocalFsGateRecordStore
- [x] 4.4 Add regression tests proving gate_kind, payload, and on-disk record path semantics match legacy behavior apart from the schema rename

## 5. Review Decision Gate Integration ✓

> Emit one review_decision gate per completed review round and link each round summary back to the gate.

> Depends on: runtime-gate-helpers, transition-and-cli-gate-adoption

- [x] 5.1 Update specflow-challenge-proposal to issue a review_decision gate after each completed proposal challenge round
- [x] 5.2 Update specflow-review-design to issue a review_decision gate carrying review_round_id and findings in the payload
- [x] 5.3 Update specflow-review-apply to issue a review_decision gate carrying review_round_id and findings in the payload
- [x] 5.4 Extend ledger round summary persistence to include gate_id while keeping legacy summaries readable when gate_id is absent
- [x] 5.5 Add tests proving exactly one review_decision gate per round, human-author-only eligibility, and gate_id equality with the ledger round back-reference

## 6. Gate Alias Layer and Change Verification ✓

> Preserve surface-event compatibility through the record_id alias layer and complete archive-level verification for the change.

> Depends on: legacy-record-migration, transition-and-cli-gate-adoption, review-decision-gates

- [x] 6.1 Add recordIdForGate that returns gate.gate_id and route surface-event payload construction through the alias helper
- [x] 6.2 Add compatibility tests proving payload.record_id remains present and equals gate.gate_id across updated emitters
- [x] 6.3 Add a follow-up tracking reference for removing the alias from surface-event-contract and workflow-run-state consumers
- [x] 6.4 Run openspec validate and specflow-spec-verify and resolve any remaining consistency issues required for archive readiness
