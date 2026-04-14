## Why

Workflow orchestration today is driven by Claude reading slash-command guides
and deciding autonomously what to do next at each phase. For a server-side
specflow runtime that must be reproducible, auditable, and AI-independent,
this control flow needs to be moved into deterministic program code.

A `PhaseRouter` provides that deterministic decision layer: given a run's
current phase, it returns the single next action the runtime should take —
with no model calls, and identical output for identical input.

Source: Issue [skr19930617/specflow#132](https://github.com/skr19930617/specflow/issues/132)
(Epic #127; related #100, #101).

## What Changes

- **NEW**: `PhaseRouter` interface exposing:
  - `currentPhase(runId)` → returns the `PhaseContract` for the run's current
    workflow state.
  - `nextAction(runId)` → returns a `PhaseAction` discriminated union:
    `invoke_agent` | `await_user` | `advance` | `terminal`.
- **NEW**: `PhaseAction` is **derived from `PhaseContract`**. The contract
  for each phase carries the metadata (e.g. `next_action`, `gated`,
  `terminal`) the router needs; the router does not maintain its own
  parallel mapping table. This keeps the routing decision a pure function
  of the contract, so adding a phase or changing its semantics is a
  contract change, not a router change.
- **NEW**: `PhaseRouter` takes the `RunArtifactStore` interface via
  constructor injection to read `run.json` and resolve `current_phase`.
  Tests inject in-memory mocks; production wires the real store.
- **NEW**: A single `PhaseRouter` covers **every phase** in the workflow
  machine, including:
  - mainline phases (`proposal_draft` → `approved`),
  - terminal phases (`approved`, `rejected`, `decomposed`) → `terminal`,
  - utility branches (`explore`, `spec_bootstrap`) — same router, same
    contract-derived rules.
- **NEW**: `PhaseAction.advance` is a **pure intent** — it names the
  next event to fire but the router never mutates `RunArtifactStore`
  itself. The orchestrator (caller) is responsible for calling
  `store.advance(...)`. The router's only side effect is event emission
  for gated decisions.
- **NEW**: Error-path policy — when the `PhaseContract` for a phase is
  missing, malformed, or omits required metadata (`next_action`,
  `gated`, `terminal`); when `run.json` cannot be parsed; or when the
  run is in an inconsistent state (e.g. terminal phase with a pending
  gated decision), the router **fails fast by throwing**. There is no
  silent fallback. The orchestrator is expected to mark the run as
  `errored` and escalate. This applies uniformly to `currentPhase` and
  `nextAction`.
- **NEW**: Concurrency model — the router assumes **single-writer per
  `runId`** as an invariant of the calling orchestrator. The router
  itself holds no per-`runId` locks; serialization is the orchestrator's
  responsibility. Emission deduplication is keyed by
  `(runId, phase, event_kind)` so that even under unintended repeated
  calls within the same gated state, no duplicate event is emitted.
- **NEW**: For gated decisions (approve / reject / clarify waits) the
  router returns `await_user` and **emits the corresponding surface event
  internally** to the injected event sink, so the caller simply observes
  `await_user` and goes idle. Event emission is not the caller's
  responsibility. Emission happens **synchronously before** `await_user`
  is returned, guaranteeing that whenever a caller observes the event,
  the matching `await_user` return has either already happened or is
  about to. Emission is **deduplicated** by `(runId, phase, event_kind)`
  so repeated `nextAction` calls in the same gated state never re-emit.
- **NEW**: Event emission aligned with the Surface event contract (#100)
  so that surfaces (CLI, server, future UIs) can observe and drive the
  run.
- **NEW**: Exhaustive transition-path tests covering every phase in the
  workflow machine, asserting the returned `PhaseAction` and the events
  emitted at gated decisions. Determinism is asserted explicitly:
  identical `(runId, store snapshot)` input produces identical output
  across repeated calls.

## Capabilities

### New Capabilities

- `phase-router`: Deterministic phase-to-action router for server-side
  workflow orchestration. Owns the `PhaseRouter` interface, the routing
  rules from `PhaseContract` to `PhaseAction`, and the emission of
  surface events at gated decisions (approve/reject/clarify). Contains
  no AI calls and is fully reproducible.

### Modified Capabilities

- None. This change depends on but does not modify:
  - `workflow-run-state` — consumed as the authoritative phase graph.
  - `actor-surface-model` — consumed for actor/surface taxonomy and event
    surface semantics (linked to #100).
  - Phase Contract (#129) — separate change; this router assumes a
    structured `PhaseContract` is available to read phase metadata from.

## Impact

- **Code**: New module (e.g. `src/lib/phase-router/`) implementing
  `PhaseRouter`, the contract-derivation logic (no parallel routing table),
  and event emission. Pure-function core with a thin adapter over the
  injected `RunArtifactStore` and surface event sink.
- **APIs**: New `PhaseRouter` and `PhaseAction` types exported from the
  server orchestration surface. No changes to existing CLI contracts in
  this change; the CLI continues to work as-is until a subsequent change
  rewires it on top of the router. The router ships **dormant** — it is
  exported and fully tested in isolation but is **not wired into any
  CLI command path** in this change. CLI rewiring is deferred to a
  follow-up change so that this change's blast radius is limited to
  new code only.
- **Dependencies**:
  - #129 (Phase Contract) — router reads structured phase metadata.
  - #100 (Surface event contract) — event schema the router emits against.
  - #101 (Approval / clarify semantics) — defines which decisions are
    gated and therefore suspend the run.
- **Systems**: Prepares for a server orchestration mode where Claude's
  slash-command-guide-driven flow is replaced by deterministic routing.
  Local CLI mode remains the reference implementation and is not
  disrupted by this change.
- **Testing**: New unit tests per phase and per transition path; no
  existing suites need to change in this scope. Tests must cover:
  - the fail-fast error path for missing/malformed contracts and
    corrupt/inconsistent run state,
  - that gated events are emitted exactly once per
    `(runId, phase, event_kind)` even across repeated `nextAction`
    calls,
  - that emission completes synchronously before `await_user` returns,
  - that the router never mutates `RunArtifactStore` (verified with a
    read-only / assert-no-write store double),
  - determinism under identical `(runId, store snapshot)` input.

## Clarifications

Decisions captured during proposal challenge + reclarify (Step 6):

- **Missing/malformed `PhaseContract`** → router **throws (fail-fast)**.
  No silent default. The orchestrator marks the run `errored` and
  escalates. Same policy for unknown phases, corrupt `run.json`, and
  inconsistent run state.
- **Gated event emission timing** → **synchronous before** `await_user`
  is returned. When a caller observes the event, the matching
  `await_user` return is guaranteed to follow (or have already
  occurred).
- **Repeated `nextAction` in the same gated state** → events are
  **deduplicated** by `(runId, phase, event_kind)`. The router behaves
  as a pure function from the caller's point of view; no double emit.
- **`PhaseAction.advance` semantics** → the router is **read-only with
  respect to `RunArtifactStore`**. `advance` is a pure intent value
  naming the next event; the orchestrator (caller) is responsible for
  invoking `store.advance(...)`.
- **CLI integration scope** → the router ships **dormant** in this
  change. No CLI command is rewired onto it. A follow-up change will
  perform the CLI rewire.
- **Concurrency model** → **single-writer per `runId`** is an invariant
  the orchestrator must enforce. The router holds no per-`runId`
  locks; emission dedup keying provides defense-in-depth against
  unintended repeated calls in the same state.
