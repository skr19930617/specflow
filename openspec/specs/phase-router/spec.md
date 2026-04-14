# phase-router Specification

## Purpose
TBD - created by archiving change feat-deterministic-phase-router-for-server-orchestration. Update Purpose after archive.
## Requirements
### Requirement: PhaseRouter exposes deterministic phase introspection and next-action selection

The system SHALL provide a `PhaseRouter` interface with two operations:

- `currentPhase(runId)` MUST return the `PhaseContract` corresponding to
  the run's current workflow phase, read from the injected
  `RunArtifactStore`.
- `nextAction(runId)` MUST return a `PhaseAction` value drawn from the
  discriminated union `invoke_agent | await_user | advance | terminal`.

Both operations MUST be deterministic: for an identical
`(runId, store snapshot)`, repeated invocations MUST return values that
are deeply equal. Neither operation MUST invoke any AI/LLM call.

#### Scenario: currentPhase returns the run's phase contract
- **WHEN** the store reports `current_phase = "design_review"` for `runId`
- **THEN** `currentPhase(runId)` returns the `PhaseContract` for
  `design_review`

#### Scenario: nextAction returns a PhaseAction discriminated union
- **WHEN** `nextAction(runId)` is invoked for any valid phase
- **THEN** the returned value's `kind` is one of `invoke_agent`,
  `await_user`, `advance`, or `terminal`

#### Scenario: Determinism across repeated calls
- **WHEN** `nextAction(runId)` is called twice with no change to the
  store snapshot in between
- **THEN** the two returned values are deeply equal

### Requirement: PhaseAction is derived purely from PhaseContract

The router MUST derive each `PhaseAction` from metadata carried by the
`PhaseContract` for the relevant phase (e.g. `next_action`, `gated`,
`terminal`). The router MUST NOT maintain a parallel mapping table from
phase name to action. Adding a phase or changing a phase's semantics
MUST be expressible as a contract change alone, with no edit to the
router.

#### Scenario: Adding a phase requires no router code change
- **WHEN** a new `PhaseContract` is registered with `next_action =
  "invoke_agent"` and the run's `current_phase` matches
- **THEN** `nextAction(runId)` returns an `invoke_agent` action without
  any modification to router code

#### Scenario: Terminal phases derive terminal action from contract
- **WHEN** the `PhaseContract.terminal` flag is true for the run's
  current phase
- **THEN** `nextAction(runId)` returns a `terminal` action

### Requirement: Gated decisions emit a surface event before returning await_user

For phases whose `PhaseContract.gated` is true, the router MUST:

1. Synchronously emit the corresponding surface event to the injected
   event sink **before** returning.
2. Return `await_user` from `nextAction(runId)`.

Emission MUST complete (the sink call MUST return) prior to
`nextAction` returning. The event schema MUST conform to the Surface
event contract (#100).

#### Scenario: Event emitted synchronously before await_user
- **WHEN** the run is in a gated phase and `nextAction(runId)` is
  invoked
- **THEN** the event sink receives the gated event, AND `nextAction`
  returns `await_user` only after the sink call has completed

#### Scenario: Caller does not emit the event itself
- **WHEN** a caller observes `await_user` returned by `nextAction`
- **THEN** no additional event emission by the caller is required for
  surfaces (CLI, server, future UIs) to observe the gated decision

### Requirement: Gated event emission is deduplicated per (runId, phase, event_kind)

The router MUST emit each gated surface event at most once per
`(runId, phase, event_kind)` tuple. Repeated invocations of
`nextAction(runId)` while the run remains in the same gated phase MUST
NOT re-emit the event. From the caller's perspective the router MUST
behave as a pure function of the store snapshot, even though emission
is a side effect.

#### Scenario: Repeated nextAction in same gated state emits once
- **WHEN** `nextAction(runId)` is called twice with no change to the
  store snapshot for a gated phase
- **THEN** the event sink receives the gated event exactly once across
  the two calls

#### Scenario: Re-entering a gated phase emits again
- **WHEN** the run leaves and later re-enters the same gated phase
  (distinct entries) and `nextAction` is called in each entry
- **THEN** the event sink receives the gated event once per entry

### Requirement: PhaseAction.advance is a read-only intent

The router MUST NOT mutate `RunArtifactStore` when returning an
`advance` action. The action MUST carry the name of the next event to
fire as a pure value, and the orchestrator (caller) is responsible for
invoking `store.advance(runId, event)` to materialize the transition.

The router's only permitted side effect across the entire `PhaseRouter`
surface is emission of gated surface events.

#### Scenario: advance does not mutate the store
- **WHEN** `nextAction(runId)` returns an `advance` action
- **THEN** `RunArtifactStore.advance` is not invoked by the router and
  the store snapshot is unchanged

#### Scenario: advance carries the next event name
- **WHEN** an `advance` action is returned for a phase whose
  `PhaseContract.next_action` names event `E`
- **THEN** the returned action exposes `E` as the event the caller
  should fire

### Requirement: Router fails fast on missing/malformed contract or inconsistent state

The router MUST throw an error (no silent fallback) when:

- the `PhaseContract` for the run's current phase is missing,
- the contract omits any required metadata field (`next_action`,
  `gated`, `terminal`) needed to derive a `PhaseAction`,
- `run.json` cannot be read or parsed,
- the run is in an inconsistent state (e.g. a phase whose contract is
  `terminal` but the run also carries a pending gated decision).

This policy MUST apply uniformly to `currentPhase` and `nextAction`.
The orchestrator is responsible for catching the error, marking the
run as `errored`, and escalating.

#### Scenario: Missing PhaseContract throws
- **WHEN** `nextAction(runId)` is invoked for a run whose current phase
  has no registered `PhaseContract`
- **THEN** the call throws an error and emits no event

#### Scenario: Malformed contract throws
- **WHEN** the `PhaseContract` for the run's current phase lacks
  `next_action`
- **THEN** the call throws an error identifying the missing field and
  emits no event

#### Scenario: Inconsistent run state throws
- **WHEN** the run's current phase contract is `terminal` but the run
  also carries pending gated-decision metadata
- **THEN** the call throws an error and emits no event

### Requirement: PhaseRouter assumes single-writer per runId

The router MUST be safe to use under the precondition that **at most
one writer per `runId`** invokes its operations at any time. The router
itself MUST NOT acquire per-`runId` locks; serialization is the
orchestrator's responsibility. Emission deduplication
(`(runId, phase, event_kind)`) provides defense-in-depth so that
unintended repeated calls within the same gated state do not produce
duplicate events.

#### Scenario: No locking inside router
- **WHEN** `nextAction(runId)` is invoked
- **THEN** the router does not acquire or hold any per-`runId` lock
  for the duration of the call

### Requirement: PhaseRouter uses constructor-injected RunArtifactStore and event sink

The `PhaseRouter` MUST receive its `RunArtifactStore` and surface event
sink via constructor injection. Tests MUST be able to inject in-memory
mocks (including a read-only / assert-no-write store double) without
touching the filesystem. Production wiring uses the real store and the
real event sink.

#### Scenario: Router constructed with injected dependencies
- **WHEN** `new PhaseRouter({ store, eventSink })` is called
- **THEN** subsequent `currentPhase` / `nextAction` calls read from
  `store` and emit through `eventSink` exclusively

#### Scenario: Router does not import filesystem APIs directly
- **WHEN** the `PhaseRouter` module is loaded
- **THEN** it does not depend on `node:fs` or any other filesystem
  module; all I/O flows through injected interfaces

### Requirement: PhaseRouter ships dormant in this change

The `PhaseRouter` and `PhaseAction` types MUST be exported from the
server orchestration surface in this change. No existing CLI command
or runtime code path MUST be rewired onto the router in this change.
CLI rewiring is deferred to a follow-up change.

#### Scenario: No CLI command imports PhaseRouter
- **WHEN** the change lands
- **THEN** no file under the existing CLI command path imports
  `PhaseRouter` or `PhaseAction`

#### Scenario: Router is exported and unit-tested
- **WHEN** the change lands
- **THEN** `PhaseRouter` is reachable from the server orchestration
  surface's public exports and is covered by unit tests for every
  phase in the workflow machine

