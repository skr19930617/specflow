## Context

Workflow orchestration today is driven by Claude reading slash-command
guides and deciding autonomously what to do next at each phase. For a
server-side specflow runtime to be reproducible, auditable, and
AI-independent, the per-phase routing decision must move into
deterministic program code.

The `workflow-run-state` capability already owns the authoritative
phase graph and transitions. The forthcoming Phase Contract (#129) will
attach structured metadata (`next_action`, `gated`, `terminal`, …) to
each phase. The Surface event contract (#100) defines the event schema
that surfaces (CLI, server, future UIs) observe.

What is missing is a **pure decision layer** that, given a run's
current phase, returns the next action the runtime should take, and
emits the gated surface event at decision points. That layer is the
`PhaseRouter` introduced by this change.

This change ships the router **dormant** — it is exported and
exhaustively unit-tested but is not wired into any CLI command path.
Local CLI mode remains the reference implementation, untouched.

## Goals / Non-Goals

**Goals:**

- Provide a `PhaseRouter` interface with `currentPhase` and
  `nextAction` operations that are deterministic for identical
  `(runId, store snapshot)` input and AI-free.
- Derive every routing decision from `PhaseContract` metadata; do not
  maintain a parallel phase→action mapping table.
- Emit gated surface events synchronously **before** returning
  `await_user`, with deduplication keyed by
  `(runId, phase-entry, event_kind)`.
- Treat the router as **read-only with respect to `RunArtifactStore`**;
  the only permitted side effect is gated event emission.
- Fail fast on any contract gap, parse error, or inconsistent run
  state — no silent fallbacks.
- Cover every phase (mainline, terminal, utility) and every transition
  path with unit tests, including the determinism, dedup, and
  fail-fast properties.

**Non-Goals:**

- Wiring the router into any CLI command. CLI rewiring is a separate,
  follow-up change.
- Defining the `PhaseContract` itself. That is owned by #129; this
  change consumes the contract type.
- Defining the Surface event schema. That is owned by #100; this
  change emits events conforming to it.
- Cross-process or cross-restart durable dedup. Single-writer per
  `runId` is the orchestrator's invariant; persistent dedup is out of
  scope.
- Concurrency control. The router holds no per-`runId` locks.

## Decisions

### D1. Pure-function core, thin adapter shell

Implement `PhaseRouter` as a small class whose constructor takes
`{ store: RunArtifactStore, eventSink: SurfaceEventSink, contracts:
PhaseContractRegistry }`. All decision logic lives in pure helper
functions (`deriveAction(contract): PhaseAction`,
`isGated(contract): boolean`, …) that take only the inputs they need
and return values; the class methods are thin adapters that load
`run.json`, look up the contract, call the helpers, and (for gated
phases) emit before returning.

**Why:** Pure functions make determinism trivial to assert in tests
and decouple the routing rules from I/O. The adapter shell isolates
the only side effects (store reads, event emission) into testable
seams.

**Alternative considered:** Putting all logic on the class. Rejected
because it would require constructing the class to test routing rules
and would tangle I/O with logic.

### D2. Action derivation from contract metadata, no parallel table

`deriveAction(contract)` reads `contract.next_action`,
`contract.gated`, and `contract.terminal` to produce a `PhaseAction`.
There is no `phaseName → action` switch statement anywhere in the
router. The full mapping is:

| Contract state                            | PhaseAction          |
|-------------------------------------------|----------------------|
| `terminal == true`                        | `{ kind: "terminal", reason }` |
| `gated == true`                           | `{ kind: "await_user", event_kind }` (after sync emit) |
| `next_action == "invoke_agent"`           | `{ kind: "invoke_agent", agent }` |
| `next_action == "advance"`                | `{ kind: "advance", event }` |
| anything else                             | **throws** `MalformedContractError` |

**Why:** Adding a phase or changing its semantics becomes a contract
change (and a contract test), not a router change. This is the core
reason the router is "deterministic by construction" — it has no
hidden state to drift from the contract.

**Alternative considered:** Keep an explicit table inside the router.
Rejected because it duplicates the contract and creates two sources of
truth.

### D3. Gated emit happens synchronously before `await_user` returns

For a gated phase, `nextAction` performs the following sequence
in order:

1. Compute `event_kind` from the contract.
2. Check the dedup cache (D5). If already emitted for this entry,
   skip step 3.
3. `await eventSink.emit({ run_id, phase, event_kind, … })` — and
   only proceed once the sink call resolves.
4. Record the emission in the dedup cache.
5. Return `{ kind: "await_user", event_kind }`.

**Why:** Callers must be able to assume that observing `await_user`
implies the corresponding event has already been published. Reversing
the order or making emission concurrent would force every caller to
write its own synchronization.

**Alternative considered:** Fire-and-forget emit. Rejected because it
breaks the observability guarantee and complicates testing.

### D4. `advance` is a pure intent; the orchestrator writes

When a phase's contract says `next_action == "advance"`, the router
returns `{ kind: "advance", event }` without touching the store. The
caller (orchestrator) is responsible for invoking
`store.advance(runId, event)` to materialize the transition.

**Why:** Keeping the router's only side effect to event emission makes
its behavior trivial to reason about and to test (a "no-write" store
double can assert this). It also lets the orchestrator interleave
other concerns (logging, metrics, transactional boundaries) around the
store write.

**Alternative considered:** Have the router perform `store.advance`
itself when returning `advance`. Rejected because it spreads
write responsibility, complicates the read-only invariant, and tangles
two concerns (deciding the next event vs. committing it).

### D5. Dedup keyed by `(runId, currentPhaseEntryAt, event_kind)`

The router maintains an in-memory `Map<runId, { entryAt: string,
emitted: Set<string> }>`. `entryAt` is the ISO timestamp of the
**most recent transition into the current phase**, taken from
`run.history`. On each `nextAction` call:

- Look up the entry. If `entryAt` differs from the run's current
  entry timestamp, replace the record (the run has re-entered or
  moved to a new phase).
- Check `emitted.has(event_kind)`. If true, skip emission.
- Otherwise emit, then `emitted.add(event_kind)`.

**Why:** Using the phase-entry timestamp as the dedup key naturally
resets when the run re-enters the same gated phase (a distinct entry
in `history`), satisfying the "re-entry emits again" scenario in the
spec, while still dedup'ing repeated `nextAction` calls within the
same entry. Pure in-memory keeps the router free of store writes.

**Alternative considered:** Persisting a `lastEmitted` field in
`run.json`. Rejected because it would require the router to write to
the store, violating D4's invariant. **Alternative considered:** Sink-
side dedup. Rejected because it would push semantic responsibility
out of the router and require every sink implementation to repeat the
same logic.

**Restart implication:** Dedup is per-process. If the server restarts
while a run sits in a gated state, the next `nextAction` call will
re-emit. This is the orchestrator's problem to handle (sinks should
be idempotent, or the orchestrator should not re-call `nextAction`
without an external trigger). Captured as a risk (R2).

### D6. Fail-fast error model

The router throws typed errors for every off-happy-path situation:

- `MissingContractError` — no `PhaseContract` registered for the run's
  current phase.
- `MalformedContractError` — contract present but missing required
  metadata (`next_action`, `gated`, `terminal`) or carrying an
  unrecognized `next_action`.
- `RunReadError` — `run.json` cannot be read or parsed (wraps the
  underlying store error).
- `InconsistentRunStateError` — e.g. terminal contract paired with a
  pending gated marker, or a `current_phase` not present in the
  registered contract set during a sanity check.

These apply uniformly to `currentPhase` and `nextAction`. The router
**does not emit any event** when throwing.

**Why:** Silent fallbacks (defaulting to `await_user`, swallowing,
returning `terminal('errored')`) hide real bugs and make the
deterministic guarantee meaningless. Letting the orchestrator catch
and mark `errored` keeps the failure surface visible.

### D7. Single-writer per `runId`; no internal locking

The router documents — and tests assert — that callers must serialize
`nextAction` calls per `runId`. The router itself does not acquire
mutexes, locks, or use atomics. The dedup cache from D5 provides
defense-in-depth: even if two calls slip through within the same
entry, the second one will see the cache populated and skip emission.

**Why:** In a server orchestrator there is already a per-run executor
(one task at a time per run). Pushing locking into the router would
either duplicate that mechanism or pretend to handle a contention
case the router cannot actually serialize across processes.

### D8. Exhaustive transition tests driven by the contract registry

Tests iterate the `PhaseContractRegistry` and assert, per phase:

- `nextAction` returns the contract-derived action shape.
- For gated phases: emission happens once, before `await_user` returns,
  and is deduped on the second call within the same entry.
- For terminal phases: returns `{ kind: "terminal", reason }`.
- For mainline `invoke_agent`/`advance`: store is never written
  (verified with an `AssertNoWriteStore` double).
- Determinism: two back-to-back calls with the same store snapshot
  produce deeply-equal results.

Plus dedicated tests for D6 errors (each thrown type) and D7
(single-writer documentation/contract).

**Why:** Iterating the registry — rather than hard-coding a phase
list — guarantees that adding a phase to the contract set
automatically expands test coverage. Forgetting to test a new phase
becomes structurally impossible.

### D9. Module location and exports

New module at `src/lib/phase-router/`:

- `index.ts` — re-exports `PhaseRouter`, `PhaseAction`, error classes.
- `router.ts` — the `PhaseRouter` class.
- `derive-action.ts` — pure helpers (`deriveAction`, `isGated`, …).
- `errors.ts` — typed error classes.
- `types.ts` — `PhaseAction` discriminated union and supporting types.

The module imports type-only from `workflow-run-state` (for
`RunArtifactStore`), `actor-surface-model` (for `SurfaceEventSink`),
and the `PhaseContract` types (provided by #129). It does not import
any CLI code.

## Risks / Trade-offs

- **R1. Hard dependency on Phase Contract (#129).** If #129's contract
  shape changes, the router's `deriveAction` must be updated.
  → **Mitigation:** Keep `deriveAction` small and table-shaped; depend
  on the contract types from #129 directly so type checking flags any
  shape drift.

- **R2. In-memory dedup does not survive restart.** A server restart
  while a run is in a gated state can cause the next `nextAction` call
  to re-emit the gated event. → **Mitigation:** Document this as an
  orchestrator concern in the README of the new module; recommend
  idempotent sinks. A future change can add persisted dedup if the
  operational pain materializes.

- **R3. Single-writer-per-runId is an unenforced precondition.** If
  violated, the dedup cache provides only a best-effort safety net.
  → **Mitigation:** Document the invariant on the `PhaseRouter` type;
  add a test that demonstrates dedup works under repeated calls but
  also a comment explaining it is not a concurrency primitive.

- **R4. Test growth scales with the workflow machine.** As phases are
  added, the registry-driven tests automatically run more cases.
  → **Trade-off:** Accepted. This is the desired safety net; the
  alternative (forgetting to test new phases) is worse. Tests are
  pure-function unit tests, so wall-clock cost is negligible.

- **R5. Dormant-by-design code ships unused.** Unused code can rot.
  → **Mitigation:** The follow-up CLI/server-orchestrator wiring
  change is the intended consumer; tracking is via Epic #127. Tests
  give the module continuous exercise even while dormant.

- **R6. `PhaseAction` discriminated union grows over time.** Adding a
  new kind requires updating both the contract and consumers.
  → **Trade-off:** Accepted; the union is the API contract surface
  and changes there should be deliberate. Use exhaustive `switch` in
  the router so TypeScript flags missed kinds at compile time.

## Migration Plan

This change introduces a new module that no existing code calls. There
is no runtime migration. Steps to deploy:

1. Land this change with the new `src/lib/phase-router/` module and
   tests.
2. Verify CI is green (existing CLI behavior unchanged because nothing
   imports the new module).
3. The follow-up CLI/server-orchestrator change consumes the router.

**Rollback:** Revert this change. No data, runtime state, or external
contract is touched, so rollback is a code-only revert.

## Open Questions

- **OQ1.** Should `MissingContractError` and `MalformedContractError`
  carry enough metadata for the orchestrator to render an actionable
  error to the user (e.g. phase name + missing field name)? Likely
  yes; resolve during implementation by examining what the
  orchestrator's error UI needs.
- **OQ2.** Should `PhaseAction.advance` carry the `PhaseContract`
  itself, or just the event name? Lean toward just the event name for
  minimal coupling, but defer until the consumer (follow-up change)
  exercises the API.
