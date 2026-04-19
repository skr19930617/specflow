## Why

The workflow core today exposes **snapshot semantics** — a run's current phase, gates, and artifacts can be read at any point — but it does not expose **change semantics**. Consumers such as server-side runtimes, realtime dashboards, progress graphs, and live workflow views need more than polling: they need to observe *what happened* as a meaningful, typed event stream.

Without a first-class event contract, every downstream surface has to reconstruct change from snapshot diffing, which loses causal context (which gate was resolved, which artifact was written, which phase reopening triggered which event) and makes realtime observation fragile. This change defines the **minimal, transport-agnostic event semantics** that the workflow core publishes, so that any runtime or UI can subscribe to workflow progression as a stream of meaningful events.

This change delivers both the contract AND a minimal publisher that satisfies the SHALL-level emission requirements for lifecycle, phase, and gate events. Transport selection (WebSocket, SSE, polling, broker), server-side consumer infrastructure, UI graph rendering, and progress/artifact/bundle event emission are explicitly out of scope — the publisher writes to a per-run append-only JSONL log on the local filesystem, with no network surface.

## What Changes

- Introduce a new capability **`workflow-observation-events`** that defines the authoritative catalog of observation events emitted by the workflow core:
  - **Lifecycle events**: `run_started`, `run_suspended`, `run_resumed`, `run_terminal`
  - **Phase events**: `phase_entered`, `phase_completed`, `phase_blocked`, `phase_reopened`
  - **Gate events**: `gate_opened`, `gate_resolved`, `gate_rejected`
  - **Progress / artifact events**: `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed`
- Define a **common event envelope** for observation events, carrying at minimum:
  - `event_id` — unique per observation event; consumers use it as the idempotency key.
  - `event_kind` — the discriminator, set directly to the concrete event name (e.g., `run_started`, `phase_entered`, `gate_opened`). No separate `category` field; `event_kind` is flat.
  - `run_id` and `change_id` — run identity.
  - `sequence` — a monotonically increasing integer within a single run (see ordering below).
  - `timestamp` — ISO 8601 UTC.
  - `source_phase` / `target_phase` — when the event represents a phase transition.
  - `causal_context` — the triggering user event name or prior observation `event_id` that caused this event.
  - optional references to the related `gate` (gate record id), `artifact` (path or id), or `bundle` (review bundle id).
- Define **event-to-transition mapping**: the relationship is **one run-state transition may emit one or more observation events** (1:N). Lifecycle, phase, and gate events correspond to run-state transitions; `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed` are progress events that do NOT require a matching run-state transition.
- Define **coupled event order**: when one underlying change produces multiple events, the contract fixes the **cause → effect order**. Specifically:
  - `gate_opened` precedes any `phase_blocked` it causes, which precedes any `run_suspended` it causes.
  - `gate_resolved` or `gate_rejected` precedes any `phase_reopened` or `phase_completed` it causes, which precedes any `run_resumed` it causes.
  - `bundle_started` precedes every `artifact_written` and `review_completed` belonging to that bundle, which precede the matching `bundle_completed`.
- Define **per-event payload schemas**: the `workflow-observation-events` spec SHALL enumerate, for every `event_kind`, the concrete payload fields, which common envelope fields are required vs. omitted-or-null for that kind, and the allowed `outcome` / `status` values (e.g., `review_completed.outcome ∈ {approved, changes_requested, rejected}`, `gate_resolved.resolution`, `run_terminal.status`). Consumers SHALL be able to interpret every event purely from the spec without reading core implementation.
- Define **ordering guarantees**: consumers SHALL be able to rely on **per-run monotonic ordering** — within a single `run_id`, observation events SHALL be observable in publication order as given by `sequence`. Ordering across different runs is explicitly not guaranteed.
- Define **delivery semantics**: the contract SHALL be **at-least-once with consumer-side idempotency** — the core MAY re-emit an event after a crash or restart, and consumers SHALL de-duplicate using `event_id`. Exactly-once and at-most-once are explicitly rejected.
- Define **replay invariants**: on re-emission of an already-published event, **every envelope and payload field SHALL be bit-identical to the original emission**, including `event_id`, `sequence`, `timestamp`, `event_kind`, `run_id`, `change_id`, `causal_context`, phase references, and payload. Re-emitted events differ from new events only in being observed more than once; `event_id` is the idempotency key.
- Define **causal_context semantics**: `causal_context` carries **0 or 1 cause**, never a list. Root or system-generated events (notably `run_started`) SHALL have `causal_context = null`. For events with multiple logical antecedents, only the immediate direct cause is recorded; reconstructing transitive causation is a consumer responsibility.
- Define the **relationship between snapshot state and event stream**: every observation event SHALL correspond to a state transition observable in the canonical workflow snapshot (for lifecycle/phase/gate events) or to a progress side-effect (for artifact/review/bundle events). **Replay scope is bounded**: replaying the event stream from `run_started` SHALL reconstruct the fields `current_phase`, `status`, the set of open gates, and the latest artifact pointers; other snapshot fields (derived metrics, history lists, timestamps of prior reads, etc.) are explicitly outside the replay guarantee.
- Define **history scope**: the contract defines **replay semantics only**. Whether full event history from `run_started` is retrievable is the responsibility of a separate persistence/transport layer, which is explicitly non-goal.
- Define the **publisher contract**: the minimum conditions under which the workflow core SHALL emit each event class, including the ordering, delivery, and replay-invariant guarantees above.
- Clarify how `workflow-observation-events` relates to the existing **`surface-event-contract`** (command envelope for approval/reject/clarify/resume) — the two are **disjoint contracts with cross-references only**: surface events are imperative commands to/from external surfaces; observation events are declarative notifications of state change emitted by the core. They do NOT share an envelope schema; each spec cross-references the other to disambiguate.
- Fix the meaning of `bundle_started` / `bundle_completed` to the **Codex review bundle** boundary (the grouped artifact payload sent for design/apply review). No arbitrary user-defined bundles.

Explicitly **non-goals** (do not specify):
- Transport selection (WebSocket, SSE, polling, append-only log).
- Event broker or message bus implementation.
- Frontend progress graph rendering.
- Persistence backend for events.
- Logging system architecture.

## Capabilities

### New Capabilities

- `workflow-observation-events`: The authoritative contract for observation events emitted by the workflow core — event classes (lifecycle, phase, gate, progress/artifact), the common envelope fields, publisher obligations, ordering guarantees, and the relationship between the event stream and the snapshot state.

### Modified Capabilities

- `workflow-run-state`: Add requirements stating that every workflow transition defined by the run-state machine SHALL correspond to an observation event emitted under the `workflow-observation-events` contract, and that the observation event stream SHALL be consistent with the snapshot readable via the run-state CLI.
- `workflow-gate-semantics`: Add requirements stating that gate opening, resolution, and rejection SHALL be observable as the `gate_opened`, `gate_resolved`, `gate_rejected` events defined in `workflow-observation-events`, with a reference to the gate record id.

## Impact

- **Contract surface:** adds a new observation-event contract alongside the existing snapshot and command-event contracts. Existing `surface-event-contract` is unchanged.
- **Core runtime:** a new observation-event publisher lives under `src/lib/` and is invoked from `src/bin/specflow-run.ts` on every `start`, `advance`, `suspend`, and `resume` command. Events are appended atomically to `.specflow/runs/<run_id>/events.jsonl` as a local file transport; this satisfies the at-least-once + bit-identical-re-emission requirements for a single-process local runtime without committing to any network transport.
- **Consumers:** server-side runtimes and UIs gain a stable event vocabulary to build realtime progress observation against. The local JSONL log is a minimum reference consumer target; server transport follow-ups layer on top without re-negotiating envelope/payload.
- **Progress events deferred:** `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed` are defined in the catalog but not yet emitted by the publisher; the spec marks them as progress events that SHALL NOT require a matching run-state transition, so deferring emission does not create a spec-vs-code gap. A follow-up change will wire them into the artifact store and review orchestration.
- **Testing:** new unit tests for the publisher (sequence monotonicity, idempotent re-emission, envelope shape) and integration tests verifying that `specflow-run start|advance|suspend|resume` + gate lifecycle transitions produce the expected event sequences.
