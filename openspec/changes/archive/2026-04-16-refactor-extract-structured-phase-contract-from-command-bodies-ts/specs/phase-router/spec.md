## ADDED Requirements

### Requirement: PhaseRouter imports PhaseContract from the canonical contract module

The `PhaseRouter` SHALL import `PhaseContract`, `PhaseContractRegistry`,
`PhaseNextAction`, and all sub-types from `src/contracts/phase-contract.ts`
(the canonical location). `src/lib/phase-router/types.ts` SHALL re-export
these types for backward compatibility but SHALL NOT define them locally.

#### Scenario: PhaseContract is imported from src/contracts/phase-contract.ts
- **WHEN** the `PhaseRouter` module's import statements are inspected
- **THEN** `PhaseContract` and `PhaseContractRegistry` SHALL be imported
  from `src/contracts/phase-contract.ts` (directly or via re-export)
- **AND** `src/lib/phase-router/types.ts` SHALL NOT contain a local
  `interface PhaseContract` definition

#### Scenario: Re-exports preserve backward compatibility
- **WHEN** external code imports `PhaseContract` from
  `src/lib/phase-router/types.ts`
- **THEN** it SHALL resolve to the same type defined in
  `src/contracts/phase-contract.ts`

## MODIFIED Requirements

### Requirement: PhaseRouter ships dormant in this change

The `PhaseRouter` and `PhaseAction` types MUST be exported from the
server orchestration surface in this change. No existing CLI command
or runtime code path MUST be rewired onto the router in this change.
CLI rewiring is deferred to a follow-up change.

The router MAY now read execution fields (`requiredInputs`,
`producedOutputs`, `cliCommands`) from `PhaseContract` for validation
or introspection purposes, but SHALL NOT alter its action-derivation
logic based on these fields in this change.

#### Scenario: No CLI command imports PhaseRouter
- **WHEN** the change lands
- **THEN** no file under the existing CLI command path imports
  `PhaseRouter` or `PhaseAction`

#### Scenario: Router is exported and unit-tested
- **WHEN** the change lands
- **THEN** `PhaseRouter` is reachable from the server orchestration
  surface's public exports and is covered by unit tests for every
  phase in the workflow machine

#### Scenario: Router action-derivation logic is unchanged
- **WHEN** `nextAction(runId)` is called for any phase
- **THEN** the returned `PhaseAction` SHALL be identical to what the
  router returned before the type unification
- **AND** the router SHALL NOT use `requiredInputs`, `producedOutputs`,
  or `cliCommands` to alter the derived action

### Requirement: Router fails fast on missing/malformed contract or inconsistent state

The router MUST throw an error (no silent fallback) when:

- the `PhaseContract` for the run's current phase is missing,
- the contract omits any required metadata field (`next_action`,
  `gated`, `terminal`) needed to derive a `PhaseAction`,
- `run.json` cannot be read or parsed,
- the run is in an inconsistent state (e.g. a phase whose contract is
  `terminal` but the run also carries a pending gated decision).

The router SHALL additionally validate that the new execution fields
(`requiredInputs`, `producedOutputs`) are present (even if empty arrays)
on every `PhaseContract` it processes, and SHALL throw if they are missing.

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

#### Scenario: Missing execution fields throws
- **WHEN** the `PhaseContract` for the run's current phase lacks
  `requiredInputs` or `producedOutputs`
- **THEN** the call throws an error identifying the missing field

#### Scenario: Inconsistent run state throws
- **WHEN** the run's current phase contract is `terminal` but the run
  also carries pending gated-decision metadata
- **THEN** the call throws an error and emits no event
