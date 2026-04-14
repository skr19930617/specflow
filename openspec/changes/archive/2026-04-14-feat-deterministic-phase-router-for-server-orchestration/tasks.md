## 1. Module scaffolding

- [x] 1.1 Create `src/lib/phase-router/` directory with empty `index.ts`, `router.ts`, `derive-action.ts`, `errors.ts`, `types.ts`
- [x] 1.2 Wire `src/lib/phase-router/index.ts` into the server orchestration surface's public exports (no consumer yet — dormant by design per D9 / proposal)
- [x] 1.3 Confirm no existing CLI command imports the new module (grep gate enforced by test in 4.7)

## 2. Types and errors

- [x] 2.1 Define `PhaseAction` discriminated union in `types.ts` with kinds `invoke_agent | await_user | advance | terminal` and the per-kind payload (agent, event_kind, event, reason)
- [x] 2.2 Define typed error classes in `errors.ts`: `MissingContractError`, `MalformedContractError`, `RunReadError`, `InconsistentRunStateError` — each carrying enough metadata to render an actionable orchestrator error (phase name, missing field, underlying cause)
- [x] 2.3 Re-export `PhaseAction`, `PhaseRouter`, and the error classes from `index.ts`

## 3. Pure decision core (`derive-action.ts`)

- [x] 3.1 Implement `deriveAction(contract: PhaseContract): PhaseAction` covering the contract→action table from design D2 (terminal → terminal; gated → await_user; invoke_agent → invoke_agent; advance → advance)
- [x] 3.2 Make `deriveAction` throw `MalformedContractError` when required metadata (`next_action`, `gated`, `terminal`) is missing or `next_action` is unrecognized
- [x] 3.3 Implement `isGated(contract): boolean` and `isTerminal(contract): boolean` helpers used by the router shell
- [x] 3.4 Use an exhaustive `switch` so TypeScript flags any new `next_action` kind at compile time (per D6 / R6)

## 4. Router shell (`router.ts`)

- [x] 4.1 Implement `PhaseRouter` class with constructor `({ store, eventSink, contracts })` taking `RunArtifactStore`, `SurfaceEventSink`, and `PhaseContractRegistry` via injection (D1)
- [x] 4.2 Implement `currentPhase(runId)`: read `run.json` via `store`, look up the contract in `contracts`, throw `MissingContractError` / `RunReadError` / `InconsistentRunStateError` per D6
- [x] 4.3 Implement `nextAction(runId)`: load run + contract, call `deriveAction`, and for gated phases run the synchronous emit-then-return sequence from D3 step list
- [x] 4.4 Implement the in-memory dedup map keyed by `(runId, currentPhaseEntryAt, event_kind)` per D5; derive `currentPhaseEntryAt` from the latest matching entry in `run.history`
- [x] 4.5 Ensure `nextAction` and `currentPhase` never call `store.advance` or any other write method (the router's only side effect is event emission)
- [x] 4.6 Throw all four error types from D6 from both `currentPhase` and `nextAction`; never emit when throwing
- [x] 4.7 Add a unit test that grep-asserts no file under the existing CLI command path imports `PhaseRouter` or `PhaseAction` (proves dormant per spec scenario)

## 5. Test doubles and fixtures

- [x] 5.1 Implement an in-memory `RunArtifactStore` test double with controllable snapshots and `history` entries
- [x] 5.2 Implement an `AssertNoWriteStore` double that throws if any write method is invoked (used to prove D4 / spec "advance does not mutate the store")
- [x] 5.3 Implement an in-memory `SurfaceEventSink` test double that records every emission with timestamps
- [x] 5.4 Build a `PhaseContractRegistry` fixture covering one example per kind (mainline invoke_agent, mainline advance, gated, terminal) plus malformed/missing variants for error tests

## 6. Spec-driven unit tests

- [x] 6.1 Test: `currentPhase` returns the contract for the run's phase (spec scenario)
- [x] 6.2 Test: `nextAction` returns a value whose `kind` is in the `PhaseAction` union for every contract in the registry (registry-driven, per D8)
- [x] 6.3 Test: determinism — two back-to-back `nextAction` calls with an unchanged store snapshot return deeply-equal values for every phase
- [x] 6.4 Test: gated phase emits the event synchronously before `await_user` returns (assert sink call order using the recording sink)
- [x] 6.5 Test: repeated `nextAction` in the same gated entry emits exactly once (dedup within entry)
- [x] 6.6 Test: re-entering the same gated phase (new `history` entry) emits again (dedup resets per entry)
- [x] 6.7 Test: caller does not need to emit — sink receives the event from the router only (no double-source)
- [x] 6.8 Test: `advance` action does not invoke any write on `RunArtifactStore` (use `AssertNoWriteStore`)
- [x] 6.9 Test: `advance` action carries the event name from `contract.next_action`
- [x] 6.10 Test: terminal phase returns `{ kind: "terminal", reason }` (registry-driven over all terminal contracts)
- [x] 6.11 Test: `MissingContractError` is thrown when `current_phase` has no registered contract — and no event is emitted
- [x] 6.12 Test: `MalformedContractError` is thrown when contract lacks `next_action` (and per other required fields) — and no event is emitted
- [x] 6.13 Test: `RunReadError` is thrown when the store's read fails or returns unparseable data
- [x] 6.14 Test: `InconsistentRunStateError` is thrown when terminal contract pairs with pending gated metadata
- [x] 6.15 Test: router does not acquire any lock and does not import `node:fs` or any filesystem module (static import check)
- [x] 6.16 Test: every phase in the production `PhaseContractRegistry` is reachable in the registry-driven test loop (catches accidental skips)

## 7. Verification

- [x] 7.1 Run repository formatter and linter on the new module and tests
- [x] 7.2 Run repository type checker; fix any violations in the new module
- [x] 7.3 Run the full test suite; confirm only the new tests are added and existing tests still pass
- [x] 7.4 Run repository build; confirm the new module is included in the built output and no consumer pulls it in
