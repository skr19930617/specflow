## Context

The workflow core in `spec-scripts` currently exposes **snapshot semantics** through the run-state CLI (`specflow-run get-field`, `specflow-run show`, etc.) and the canonical-workflow-state contract. Consumers such as server-side runtimes, realtime dashboards, and progress graphs must reconstruct state change by diffing successive snapshots, which is lossy (causal chains disappear), fragile (missed polls produce missing transitions), and expensive (repeated full reads).

Alongside this, `surface-event-contract` defines a command envelope for imperative surface events (approval, reject, clarify, resume) exchanged between specflow and external surfaces. It does **not** cover observation of workflow state change.

This design introduces a third, disjoint contract — **`workflow-observation-events`** — that specifies the event surface the workflow core emits when its state changes. It is transport-agnostic: the contract fixes event identity, envelope, payload, ordering, delivery semantics, and replay guarantees; it does NOT choose a broker, transport protocol, network surface, or UI technology. A minimal local publisher ships alongside the contract, writing events to a per-run append-only JSONL file so the SHALL-level emission requirements are actually satisfied rather than deferred.

Constraints observed while designing:
- No new runtime dependencies — the publisher uses only the existing fs + JSON surfaces already used by the run-state store.
- Must compose with the existing run-state machine (`src/lib/workflow-machine.ts`) and gate records (`workflow-gate-semantics`), without changing their authoritative role.
- Must remain usable from a plain filesystem-backed local runtime and a future server/DB-backed runtime with identical semantics.
- Must be cheap to adopt incrementally — every requirement must be verifiable on a tiny in-memory publisher before any transport is chosen.

Stakeholders:
- Workflow core (`src/lib/workflow-machine.ts`, gate-runtime, artifact store) — obligated publisher.
- Future server runtime and UI clients — consumers that need realtime observation.
- Spec verification (`spec-consistency-verification`) — needs new pairings between run-state transitions and observation events.

## Goals / Non-Goals

**Goals:**
- Define a closed catalog of 15 `event_kind` values covering lifecycle, phase, gate, and progress/artifact observation, with per-event payload schemas fully specified in the spec.
- Provide a single common envelope with `event_id`, `event_kind`, `run_id`, `change_id`, `sequence`, `timestamp`, phase references, `causal_context`, and optional `gate_ref` / `artifact_ref` / `bundle_ref`.
- Fix **per-run monotonic ordering** via strictly increasing `sequence` starting at 1 from `run_started`.
- Fix **at-least-once delivery + consumer-side idempotency via `event_id`**, with **bit-identical re-emission** invariants.
- Fix **cause → effect ordering** among coupled events (gate → phase → lifecycle; bundle → artifacts → bundle_completed).
- Bound the **replay subset** to `current_phase`, `status`, open gate set, and latest artifact pointers; everything else is explicitly outside the replay guarantee.
- Keep `workflow-observation-events` disjoint from `surface-event-contract` and from the run-state CLI's snapshot responsibility.

**Non-Goals:**
- Transport selection: WebSocket, SSE, polling, append-only log, broker.
- Event broker or message bus implementation.
- Persistence backend for events (file-based log, DB table, etc.).
- History-retrieval API for observation events.
- Frontend dashboards or progress-graph rendering.
- Extending the gate record schema, canonical-workflow-state schema, or surface-event-contract envelope.
- Defining how multiple causes are represented (single-cause-only by contract).
- Non-`review_bundle` bundle kinds.

## Decisions

### D1. Flat `event_kind` discriminator (no category/type split)

`event_kind` is a flat string set to the concrete event name (`run_started`, `phase_entered`, `gate_opened`, etc.). No separate `event_category` field is introduced.

- Alternative considered: `event_category ∈ {lifecycle, phase, gate, progress}` + `event_type ∈ {specific name}`. Rejected: doubles the field surface and forces consumers to read two fields to discriminate. The catalog is small enough (15 entries) that consumers can handle a flat `event_kind` easily; if future growth warrants grouping, consumers can derive a category from `event_kind` locally without changing the wire contract.

### D2. Per-run monotonic ordering, not global

Ordering is scoped to a single `run_id`: `sequence` is strictly increasing within a run, starting at 1 for `run_started`. Cross-run ordering is explicitly not guaranteed.

- Alternative considered: global total order across all runs. Rejected: pushes strong constraints onto any transport/broker implementation (requires a single ordering authority) with no corresponding consumer benefit — UIs and server runtimes typically render one run at a time and only need that run's chronology to be coherent.
- Alternative considered: no ordering guarantee, consumers sort by timestamp. Rejected: timestamp resolution is not guaranteed to disambiguate co-emitted events, and consumers would be forced to implement their own graph reconstruction.

### D3. At-least-once delivery + idempotency via `event_id`, with bit-identical re-emission

The publisher may re-emit events after crash/restart; consumers de-duplicate using `event_id`. Re-emitted events must be byte-identical to the original emission in every envelope and payload field, including `timestamp` (which always reflects the original publication time).

- Alternative considered: exactly-once. Rejected: requires coordination between publisher and transport that forces us into transport choices (two-phase commit, message broker with dedup), which is explicitly non-goal. Worse, it pushes downstream cost onto every future transport implementation.
- Alternative considered: at-most-once / best-effort. Rejected: makes observation inherently unreliable and undermines the replay contract — you cannot reconstruct the bounded snapshot subset if arbitrary events may be dropped.
- Alternative considered: allow `timestamp` to be re-generated on re-emission (preserving only `event_id`). Rejected: differentiates re-emitted events from originals in a way that complicates consumer caching, audit logs, and equality checks. Bit-identity is cheaper to reason about.

### D4. Single-cause `causal_context`, never a list

`causal_context` is either `null` or exactly one cause (`kind ∈ {user_event, observation_event}`, `ref = name or event_id`). Root/system events set it to `null`. Multiple antecedents are collapsed to the immediate direct cause; transitive causation is reconstructed by consumers.

- Alternative considered: `causes: Cause[]` array. Rejected: introduces ambiguity about order/priority of multiple causes, forces consumers to build DAGs for every event, and the real-world causal graph is almost always effectively linear (gate → phase → lifecycle). If a future use case ever requires multi-parent causation, we can introduce it as a backward-compatible additive change.
- Alternative considered: drop `causal_context` entirely and rely on `sequence` adjacency. Rejected: coupled events emitted in the same tick would be indistinguishable from unrelated events that happened to arrive adjacently.

### D5. 1 run-state transition : N observation events (not strict 1:1)

Lifecycle, phase, and gate events correspond to run-state transitions; `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed` are progress events that occur without a matching run-state transition. A single transition may emit several coupled events (e.g., `gate_opened` + `phase_blocked` + `run_suspended`).

- Alternative considered: strict 1:1 mapping requires dummy run-state transitions for artifact writes and review completions. Rejected: pollutes the state machine with non-state-changing events and breaks the invariant that transitions correspond to user-visible progress.
- Alternative considered: progress events are separate contract. Rejected: the envelope and ordering concerns are identical; splitting would duplicate the contract surface without benefit.

### D6. Bit-bounded replay subset (phase, status, open gates, latest artifact pointers)

Replay reconstructs exactly four projections of the canonical snapshot: `current_phase`, `status`, the open-gate set, and the latest artifact pointer per `artifact_ref`. Derived metrics, history lists, prior-read timestamps, and local-filesystem cache are explicitly outside the guarantee.

- Alternative considered: reconstruct the full canonical snapshot. Rejected: forces the core to emit events for every derived field read, which explodes the event surface and contradicts the goal of minimal-yet-sufficient observation.
- Alternative considered: no replay guarantee, treat events as hints only. Rejected: makes consumer-side state impossible to validate against canonical snapshots, undermining testability.

### D7. Disjoint from `surface-event-contract`, cross-reference only

The two contracts do not share an envelope schema. Each spec references the other in its Purpose section to disambiguate observation (declarative state change) from command (imperative surface interaction).

- Alternative considered: extend `SurfaceEventEnvelope` to carry observation events too. Rejected: surface events and observation events have different identity semantics (`event_id` in observation is the dedup key; in surface events it identifies a command/response pair) and different audiences (surfaces vs. observers). Unifying them would force changes to `surface-event-contract` and blur responsibilities.

### D8. `bundle` means exactly the Codex review bundle

`bundle_kind` is fixed to `"review_bundle"`. Arbitrary user-defined bundles are out of scope.

- Alternative considered: generic `bundle` concept. Rejected: no concrete need today; generalization would require defining what constitutes a bundle outside review, creating contract surface without a consumer.

### D9. Gate records remain authoritative; events are notifications

Gate state (open / resolved / rejected) is read authoritatively from gate records, not from the event stream. Events are a realtime observation side-channel. This preserves the existing correctness of `workflow-gate-semantics` and makes it safe for event-lossy transports to coexist with authoritative consumers that poll gate records directly.

## Risks / Trade-offs

- **[Risk] Consumers conflate event stream with authoritative state**
  → Mitigation: the spec explicitly marks gate records and canonical snapshots as authoritative; observation events are notifications only. The replay contract is bounded to exactly four projections.

- **[Risk] Coupled-event ordering requirements force awkward publisher implementation**
  → Mitigation: the contract only fixes cause → effect ordering, not fine-grained interleaving. Publishers can emit coupled events synchronously in the required order; they are not required to emit them atomically.

- **[Risk] At-least-once semantics leak duplicate events into naive consumers**
  → Mitigation: `event_id` is mandated as the idempotency key and re-emissions are bit-identical, so de-duplication is a single-line check. The spec states this as a `SHALL` on consumers.

- **[Risk] `sequence` requires publisher-side counter state per run**
  → Mitigation: the counter is a small integer keyed by `run_id`; a local-filesystem publisher persists it alongside the run-state snapshot. The contract already forbids cross-run ordering, so no global counter is needed.

- **[Risk] Single-cause `causal_context` loses information when multiple antecedents exist**
  → Mitigation: only the immediate direct cause is recorded; transitive causation remains reconstructable by following `causal_context` chains. If a concrete use case emerges that requires multi-parent causation, the field can be extended as a backward-compatible addition (e.g., `causal_context.extra_causes`).

- **[Trade-off] Replay cannot reconstruct full canonical snapshot**
  → Acceptance: bounded reconstruction is sufficient for progress observation and real-time UIs; consumers that need the full snapshot read it directly. This preserves contract minimality.

- **[Trade-off] Transport is non-goal, so no reference consumer can be written end-to-end under this change**
  → Acceptance: this change is explicitly contract-only. A future change will pick a transport, at which point the reference publisher/consumer will ride on top of this frozen contract.

## Migration Plan

This change lands contract + minimal local publisher together. There is no data migration.

1. Land the three spec delta files under `openspec/changes/.../specs/`.
2. Land the publisher types (`src/types/observation-events.ts`), the publisher interface + local-FS implementation, and the hook into `src/bin/specflow-run.ts`'s `start`, `advance`, `suspend`, `resume` subcommands.
3. Archive the change after review/approve; the deltas merge into `openspec/specs/workflow-observation-events/spec.md`, `workflow-run-state/spec.md`, and `workflow-gate-semantics/spec.md`.
4. Existing runs created before this change continue to work: their `events.jsonl` file is absent, and readers MUST treat "no log file" as "no events observed yet" (not as an error). The publisher creates the log on first emission.
5. Follow-up change: choose a network transport (SSE/WebSocket/broker) and layer it on top of the local log. At that point the envelope + payload schemas are frozen; only transport wiring needs new code.
6. Second follow-up change: wire progress events (`artifact_written`, `review_completed`, `bundle_started`, `bundle_completed`) into artifact-store and review-orchestration code paths.

Rollback: revert the archive merge + remove the publisher hook. `events.jsonl` files produced pre-revert are harmless leftovers and can be ignored or deleted.

## Open Questions

- None blocking. All seven challenge items from the proposal phase were resolved via reclarify. Downstream follow-ups (transport selection, publisher implementation, persistence) are explicitly non-goal for this change.

## Concerns

- **C-obs-catalog** — Consumers need a stable, closed list of observation event kinds they can subscribe to. Resolves: catalog drift, consumer code forced to handle unknown event kinds.
- **C-envelope** — Consumers need a single common envelope so every event is structurally parseable before dispatching on `event_kind`. Resolves: ad-hoc per-event parsing, inability to build generic observers.
- **C-payload** — Consumers need to interpret every `event_kind`'s payload from the spec alone, without reading core source. Resolves: implementation-bound contracts that drift when the core evolves.
- **C-ordering** — Consumers need a defined ordering they can rely on for realtime UI reconstruction. Resolves: timestamp-based reordering heuristics, missing-event false positives.
- **C-delivery** — Consumers need defined delivery semantics so they can write correct idempotent handlers. Resolves: unsafe retries, duplicate side-effects.
- **C-replay** — Consumers and tests need a defined subset of canonical state that the event stream can reconstruct. Resolves: unverifiable correctness claims about event-based state.
- **C-separation** — Consumers and designers need a clear boundary between observation events (declarative state change) and surface events (imperative commands). Resolves: accidentally routing commands into the observation stream or vice versa.
- **C-coupled-order** — Consumers need deterministic ordering for causally related events so progress UIs don't flicker or misattribute effects. Resolves: race-condition-like render anomalies in realtime views.

## State / Lifecycle

**Canonical state (preserved, not changed):**
- Run-state machine defined in `workflow-run-state` spec: `current_phase`, `status`, history, and allowed-events per phase.
- Gate state defined in `workflow-gate-semantics` spec: gate records keyed by gate id, with open / resolved / rejected lifecycle.

**Derived state introduced by this contract:**
- **Observation event stream** — a per-run ordered sequence of events, identified by `event_id` with `sequence` ordering. The stream is a derived view of canonical state change, not authoritative.
- **Bounded replay projection** — four reconstructed fields (`current_phase`, `status`, open-gate set, latest artifact pointers) that consumers can compute by folding over the event stream.

**Lifecycle boundaries:**
- **Run lifetime** — begins with `run_started` (`sequence = 1`), ends when a `run_terminal` event is emitted. No observation events are emitted outside this window for a given `run_id`.
- **Gate lifetime** — begins with `gate_opened`, ends with exactly one terminal gate event (`gate_resolved` or `gate_rejected`). No additional terminal events for the same `gate_ref`.
- **Bundle lifetime** — begins with `bundle_started`, framed by matching `bundle_ref`, ends with `bundle_completed`.

**Persistence-sensitive state:**
- `sequence` counter per `run_id` — the publisher must persist enough state to regenerate the same `sequence` on re-emission. In the local-filesystem runtime this sits next to the run-state snapshot.
- `event_id` originals — needed to make re-emissions bit-identical. Whether these are stored durably is a publisher implementation concern, not a contract concern.

## Contracts / Interfaces

**New contract surface (this change):**
- `workflow-observation-events` — a pure data contract defining the event catalog, envelope, per-event payloads, ordering, delivery, replay, and re-emission invariants. Consumed by any future observer (server runtime, UI, test harness). Transport-agnostic by design.

**Delta updates to existing contracts:**
- `workflow-run-state` — gains requirements that run-state transitions emit observation events (1:N mapping), that the event stream is consistent with the run-state snapshot, and that the run-state CLI remains snapshot-only (no transport obligation).
- `workflow-gate-semantics` — gains requirements that gate state changes emit gate events, that gate events precede caused phase/lifecycle events, and that gate records remain authoritative over the event stream.

**Boundary between layers:**
- **Core ↔ Observers:** the workflow core is the sole authoritative publisher of observation events. Observers are read-only; they never produce observation events.
- **Core ↔ Surfaces:** unchanged — surfaces interact through `surface-event-contract` only.
- **Observers ↔ Authoritative stores:** observers consult gate records / run-state snapshots for authoritative reads; they never treat the event stream as the source of truth.

**Inputs other bundles depend on:**
- The `event_kind` catalog (15 entries) — fixed list that downstream consumer code branches on.
- The envelope schema (11 fields) — single parseable shape.
- The per-event payload schemas (one per `event_kind`) — enumerates fields, nullability, and allowed outcome/status values.
- Coupled-event ordering rules — observation-graph constructors depend on these.

## Persistence / Ownership

**This change introduces no new persistence** — it is a pure contract.

**Ownership boundaries (unchanged by this change):**
- Run-state snapshots — owned by `workflow-run-state`; authoritative for `current_phase`, `status`, transitions.
- Gate records — owned by `workflow-gate-semantics`; authoritative for gate lifecycle.
- Artifact store — owned by the existing artifact-ownership-model spec; authoritative for artifact pointers.

**Ownership introduced by this change (contract-only):**
- Observation event semantics — owned by `workflow-observation-events`.
- The workflow core is designated the **sole publisher** of observation events; no other layer is permitted to emit.

**Durable persistence of events:**
- Not required by this contract.
- A future transport/persistence change may add an append-only event log; this contract does not constrain that choice beyond the bit-identity / idempotency rules.

## Integration Points

**External systems:**
- None. This change adds no external dependencies.

**Cross-layer dependency points:**
- **Publisher ↔ Run-state machine** — on every transition, the publisher reads the transition metadata (source phase, target phase, triggering event) and emits the matching lifecycle/phase events.
- **Publisher ↔ Gate-runtime** — on every gate state change, the publisher reads the gate record id and emits the matching gate event, ordered before any caused phase/lifecycle event.
- **Publisher ↔ Artifact store** — on every artifact write, the publisher emits `artifact_written` with the artifact path/id.
- **Publisher ↔ Review orchestration** — on bundle boundaries, the publisher emits `bundle_started` / `bundle_completed` framing `artifact_written` / `review_completed` events for artifacts within the bundle.

**Regeneration / retry boundaries:**
- On publisher crash/restart, re-emission produces bit-identical events (same `event_id`, `sequence`, `timestamp`, payload).
- On consumer failure, consumers can restart from any `event_id` they already stored and re-process later events idempotently.

**Save / restore boundaries:**
- Consumers that persist their reconstructed view can discard replay state and rebuild from any durable event log, provided that log starts at `run_started`. The contract does not mandate such a log exists.

## Ordering / Dependency Notes

**Foundational (must be landed together with this contract):**
- `workflow-observation-events` — new capability spec; must define every requirement the other two deltas reference.
- `workflow-run-state` delta — cannot reference event names or ordering rules until the new capability exists.
- `workflow-gate-semantics` delta — same dependency.

These three files form a single atomic spec change; archiving any one without the others leaves dangling references.

**Parallel-safe (non-blocking):**
- None within this contract. The three spec deltas are small and internally coherent; implementation is not part of this change.

**Downstream-blocked (later changes):**
- Transport selection change — blocked until this contract is archived; will reference the frozen envelope and payload schemas.
- Reference publisher implementation in workflow core — blocked on this contract and on transport selection.
- Reference consumer / UI work — blocked on transport selection.
- `spec-consistency-verification` update to verify 1:N transition ↔ event pairings — can be scoped as a follow-up after this archives.

**No dependency on:**
- Existing `surface-event-contract` (disjoint).
- `canonical-workflow-state` schema (unchanged).

## Completion Conditions

A concern is complete when its observable spec-level condition is met:

- **C-obs-catalog** — `workflow-observation-events/spec.md` enumerates exactly the 15 `event_kind` values in the four classes defined in the proposal.
- **C-envelope** — The spec lists exactly the 12 envelope fields with nullability rules, and the scenarios cover lifecycle, phase, gate, and progress event envelopes.
- **C-payload** — Every one of the 15 `event_kind` values has a per-kind payload schema in the spec; every outcome/status value is enumerated.
- **C-ordering** — The spec contains a `Per-run monotonic ordering is guaranteed` requirement with scenarios covering within-run monotonicity and cross-run non-guarantee.
- **C-delivery** — The spec contains an `At-least-once delivery with consumer-side idempotency` requirement and a `Re-emission preserves full envelope and payload bit-identity` requirement, each with scenarios.
- **C-replay** — The spec contains a `Replay reconstructs the bounded snapshot subset` requirement enumerating the four fields, plus an `Event history retrieval is out of scope` requirement.
- **C-separation** — The spec contains an `Observation events are disjoint from surface events` requirement with scenarios.
- **C-coupled-order** — The spec contains a `Coupled events follow cause-to-effect order` requirement with scenarios for gate-induced suspension chain and bundle framing. Delta updates to `workflow-run-state` and `workflow-gate-semantics` reference these rules.
- **Integration completeness** — `workflow-run-state` delta and `workflow-gate-semantics` delta both add requirements binding their transitions/state changes to observation events. Validation passes (`openspec validate --type change`).

Each concern is independently reviewable: an approver can read a single requirement + its scenarios and decide whether it is specified correctly without cross-referencing other concerns.
