## MODIFIED Requirements

### Requirement: PhaseContract is a single unified type combining routing and execution metadata

The system SHALL define a `PhaseContract` interface in `src/contracts/phase-contract.ts` that merges routing fields (`next_action`, `gated`, `terminal`) with execution fields (`requiredInputs`, `producedOutputs`, `cliCommands`, `agentTask`, `gatedDecision`). All fields on `PhaseContract` SHALL be `readonly`. The type SHALL be the single source of truth for what a phase does and how it routes **as encoded in the TypeScript layer**; it SHALL be a conforming encoding of the `phase-semantics` capability, not an independent authority for phase meaning. Each `PhaseContract` field SHALL be identified with the `phase-semantics` role it encodes:

- `phase` encodes **phase identity**.
- `requiredInputs` encodes **required inputs**.
- `producedOutputs` encodes **expected outputs**.
- `next_action`, `gated`, `terminal`, `next_phase`, `gated_event_kind`, `gated_event_type`, `terminal_reason`, `advance_event`, and `gatedDecision` together encode **branching / gate condition**.
- `agent`, `agentTask`, and `cliCommands` together encode **delegation boundary** (see the dedicated normative-encoding requirement below).
- The **completion condition** role is encoded implicitly by the combination of `producedOutputs` (which must exist for the phase to be complete), `gatedDecision` / `advance_event` (which selects the completing transition), and the agent / CLI behaviour referenced by `agentTask` / `cliCommands`.

#### Scenario: PhaseContract includes routing fields from the original type
- **WHEN** the `PhaseContract` type is inspected
- **THEN** it SHALL include `phase: string`, `next_action: PhaseNextAction`, `gated: boolean`, `terminal: boolean`, `agent?: string`, `advance_event?: string`, `gated_event_kind?: string`, `gated_event_type?: EventType`, `next_phase?: string`, and `terminal_reason?: string`

#### Scenario: PhaseContract includes execution fields
- **WHEN** the `PhaseContract` type is inspected
- **THEN** it SHALL include `requiredInputs: readonly ArtifactRef[]`, `producedOutputs: readonly ArtifactRef[]`, `cliCommands: readonly CliStep[]`, `agentTask?: AgentTaskSpec`, and `gatedDecision?: GatedDecisionSpec`

#### Scenario: All PhaseContract fields are readonly
- **WHEN** the `PhaseContract` type definition is read
- **THEN** every field SHALL be marked `readonly`

#### Scenario: PhaseContract fields map to phase-semantics roles
- **WHEN** the `PhaseContract` type is read against `phase-semantics`
- **THEN** every field SHALL be identified with the `phase-semantics` role
  (or combination of roles) it encodes
- **AND** no field SHALL be present without being identified with at least
  one `phase-semantics` role

## ADDED Requirements

### Requirement: PhaseContract is a lossless encoding of phase-semantics

The `PhaseContract` value for every phase defined by `phase-semantics` SHALL, together with the sibling workflow state machine that maps events to destination phases, express all six `phase-semantics` roles (identity, required inputs, expected outputs, completion condition, branching / gate condition, delegation boundary) without loss of information. Reading the `PhaseContract` for a phase (and, for transitions, resolving event names against the workflow state machine in the same encoding layer) SHALL yield the same role values as reading the per-phase definition in `phase-semantics`. No new fields SHALL be added by this requirement; losslessness SHALL be achieved by populating existing fields with concrete values that cover every role for every phase, including terminal phases.

#### Scenario: Every phase's PhaseContract covers all six roles
- **WHEN** the `PhaseContract` for any registered phase is read together with the sibling workflow state machine
- **THEN** every `phase-semantics` role (identity, required inputs, expected outputs, completion condition, branching / gate condition, delegation boundary) SHALL be recoverable from the combination of `PhaseContract` fields and the workflow state machine's event-to-phase mapping

#### Scenario: Terminal phases populate all role encodings
- **WHEN** the `PhaseContract` for a terminal phase (`approved`, `decomposed`, `rejected`) is inspected
- **THEN** `terminal` SHALL be `true`, `terminal_reason` SHALL equal the terminal reason defined by `phase-semantics`, and `next_action` SHALL be `terminal`
- **AND** `requiredInputs`, `producedOutputs`, and `cliCommands` SHALL be populated with the explicit empty-set encoding required by `phase-semantics` for that phase (not absent)

#### Scenario: Non-gated advance phases encode successor via advance_event
- **WHEN** the `PhaseContract` for a non-gated, non-terminal phase has `next_action: "advance"`
- **THEN** `advance_event` SHALL be present and SHALL match the event name enumerated by `phase-semantics` as the single successor transition
- **AND** resolving `advance_event` through the workflow state machine SHALL yield the successor phase enumerated by `phase-semantics`

#### Scenario: Non-gated invoke_agent phases encode successor transitions via cliCommands
- **WHEN** the `PhaseContract` for a non-gated, non-terminal phase has `next_action: "invoke_agent"`
- **THEN** every non-universal successor-transition event enumerated by `phase-semantics` for that phase SHALL appear in at least one `cliCommands[].command` as the event argument to `specflow-run advance`
- **AND** resolving each such event through the workflow state machine SHALL yield the corresponding successor phase enumerated by `phase-semantics`
- **AND** the universal `reject` event MAY be omitted from `cliCommands` because it is available from every non-terminal phase per the `phase-semantics` universal-rejection rule

#### Scenario: Gated phases encode every allowed outcome
- **WHEN** the `PhaseContract` for a gated phase is inspected
- **THEN** `gatedDecision.advanceEvents` SHALL list exactly the event names enumerated by `phase-semantics` as allowed outcomes of the gate
- **AND** no event name SHALL appear in `gatedDecision.advanceEvents` that is not enumerated by `phase-semantics`
- **AND** `next_phase` SHALL equal the approval outcome's successor phase enumerated by `phase-semantics`

### Requirement: cliCommands is a normative encoding of deterministic-side work

`cliCommands` on `PhaseContract` SHALL be treated as part of the normative encoding of the phase's deterministic CLI steps, not as a local-adapter detail. `cliCommands` SHALL contain three categories of steps: (1) **transition steps** that advance the run between phases (e.g., `specflow-run advance "<RUN_ID>" <event>`); (2) **helper steps** that support agent work without producing the phase's expected outputs themselves (e.g., `openspec instructions specs --json`, `specflow-design-artifacts next`, `specflow-advance-bundle`); and (3) **output-producing deterministic work** — steps that directly produce the phase's expected outputs without agent judgement (e.g., `openspec validate`, `specflow-spec-verify`). All three categories are deterministic. A consumer targeting semantic portability (server runtime, alternate UI) SHALL honour the same deterministic command semantics as the local reference implementation for every step across all three categories.

#### Scenario: cliCommands for deterministic or mixed phases include output-producing work
- **WHEN** a phase is classified `deterministic` or `mixed` by `phase-semantics`
- **THEN** `cliCommands` on the corresponding `PhaseContract` SHALL include every output-producing deterministic step identified by `phase-semantics` for that phase, in addition to any transition and helper steps the phase uses

#### Scenario: cliCommands for agent-delegated phases exclude output-producing work
- **WHEN** a phase is classified `agent-delegated` by `phase-semantics`
- **THEN** the corresponding `PhaseContract.cliCommands` MAY contain transition and helper steps
- **AND** it SHALL NOT contain any step that directly produces the phase's expected outputs without agent judgement

#### Scenario: Non-local consumers rely on cliCommands semantics
- **WHEN** a non-local runtime encodes workflow execution for the same phase
- **THEN** it SHALL honour the same deterministic command semantics as those expressed in `cliCommands`, though it MAY encode them in a different transport or format
