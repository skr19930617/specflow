# Handoff Notes — workflow-observation-events contract

## Review Summary (for approvers)

**Scope.** Contract-only change that introduces the authoritative `workflow-observation-events` capability and binds it into `workflow-run-state` and `workflow-gate-semantics` via additive deltas. Three spec delta files, no code changes.

**Non-goals.** Transport selection (WebSocket, SSE, polling, broker), persistence backend, history-retrieval API, frontend progress-graph rendering, extensions to `surface-event-contract`, non-`review_bundle` bundle kinds.

**Authoritative boundaries.**
- Run-state snapshots remain authoritative for `current_phase`, `status`, transitions.
- Gate records remain authoritative for gate lifecycle.
- Artifact store remains authoritative for artifact pointers.
- Observation events are a **notification side-channel** — consumers requiring authoritative state read the authoritative store, not the event stream.

**Why transport-agnostic.** The issue explicitly asks to freeze *event meaning* first; transport choice is deferred. At-least-once + bit-identical re-emission + `event_id` idempotency lets any future transport (pub/sub, SSE, append-only log) layer on top without renegotiating the contract.

## Archive Package Contents

All three deltas ship together; archiving any one without the others leaves dangling references.

1. `specs/workflow-observation-events/spec.md` — new capability (11 ADDED requirements, 25 scenarios).
2. `specs/workflow-run-state/spec.md` — additive delta (3 ADDED requirements) binding run-state transitions to observation events.
3. `specs/workflow-gate-semantics/spec.md` — additive delta (3 ADDED requirements) binding gate state changes to gate events.

**No runtime migration.** No production code changes. No data migration. Rollback = revert the archive merge.

**Validation.** `openspec validate --type change` passes cleanly. Cross-spec event-name consistency verified manually (see Step 4 bundle in the apply).

## Downstream Handoff

Follow-up changes that can start **after** this contract is archived:

- **Transport selection change.** Picks one of WebSocket / SSE / polling / append-only log and specifies wire format for the observation stream. Must preserve envelope + payload schemas verbatim.
- **Reference publisher implementation.** Extends `src/lib/workflow-machine.ts`, gate-runtime, and the artifact store to emit observation events on every transition and progress side-effect. Must respect per-run monotonic `sequence`, cause → effect ordering, and bit-identical re-emission.
- **Reference consumer / UI work.** Blocked on transport selection. Can rely on replay to reconstruct the bounded snapshot subset (`current_phase`, `status`, open gates, latest artifact pointers).
- **`spec-consistency-verification` update.** Adds pairings that check each run-state transition is observably matched by at least one lifecycle/phase/gate event emitted under this contract.
- **Optional follow-up: surface-event-contract cross-reference.** Add a Purpose-section cross-reference in `openspec/specs/surface-event-contract/spec.md` pointing at `workflow-observation-events` to complete the bidirectional disambiguation promised in D7. (Design-review P1 — accepted as MEDIUM risk for this change; handled in a separate delta so this change stays focused on the observation-event contract proper.)

## Known Deferred Items (accepted risk at design review)

- **P1 (MEDIUM)** — Bidirectional cross-reference to `surface-event-contract` in its Purpose section is called out in this change but not yet authored as a delta. Deferred to a separate follow-up delta. Observation-events spec already contains the cross-reference in its own requirement.
- **P2 (MEDIUM)** — Design doc wording described the envelope as "11 fields" in places; the spec authoritatively defines 12 (`event_id`, `event_kind`, `run_id`, `change_id`, `sequence`, `timestamp`, `source_phase`, `target_phase`, `causal_context`, `gate_ref`, `artifact_ref`, `bundle_ref`). The spec is correct; design copy is a cosmetic mismatch only.
