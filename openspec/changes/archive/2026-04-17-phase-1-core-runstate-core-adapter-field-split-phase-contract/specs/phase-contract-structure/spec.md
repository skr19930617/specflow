## ADDED Requirements

### Requirement: PhaseContract includes typed input and output descriptors

The existing `PhaseContract` interface SHALL be extended with optional `input` and `output` fields. Each field SHALL be a `PhaseIODescriptor` — a pure TypeScript interface describing the expected shape of data flowing into or out of a phase. These are compile-time type descriptors only; no runtime validation is provided in this phase.

#### Scenario: PhaseContract with input and output descriptors compiles

- **WHEN** a `PhaseContract` is defined with `input: { artifacts: ['proposal'] }` and `output: { artifacts: ['spec'] }`
- **THEN** the contract SHALL compile without errors
- **AND** `input` and `output` SHALL conform to the `PhaseIODescriptor` interface

#### Scenario: PhaseContract without input/output remains valid

- **WHEN** an existing `PhaseContract` definition omits `input` and `output` fields
- **THEN** the contract SHALL remain valid
- **AND** existing phase-router consumers SHALL compile without modification

#### Scenario: PhaseIODescriptor declares expected artifact names

- **WHEN** a `PhaseIODescriptor` is inspected
- **THEN** it SHALL include a `readonly artifacts: readonly string[]` field listing the artifact identifiers relevant to the phase
- **AND** it MAY include additional descriptor fields for future extension

### Requirement: PhaseContract includes declarative gate conditions

The `PhaseContract` interface SHALL be extended with an optional `gate_conditions` field of type `readonly GateCondition[]`. Gate conditions are declarative descriptors that describe what must be true before a phase transition is allowed. Evaluation logic is deferred to Phase 2 (server adapter).

#### Scenario: GateCondition with artifact_exists kind

- **WHEN** a `GateCondition` is defined with `{ kind: 'artifact_exists', target: 'proposal' }`
- **THEN** it SHALL describe the requirement that the artifact named `proposal` must exist
- **AND** the type SHALL compile without errors

#### Scenario: GateCondition with approval_required kind

- **WHEN** a `GateCondition` is defined with `{ kind: 'approval_required' }`
- **THEN** it SHALL describe the requirement that human or delegated approval is needed
- **AND** `target` SHALL be optional for this kind

#### Scenario: GateCondition with validation_passed kind

- **WHEN** a `GateCondition` is defined with `{ kind: 'validation_passed', target: 'spec' }`
- **THEN** it SHALL describe the requirement that validation of the named artifact has passed

#### Scenario: PhaseContract without gate_conditions remains valid

- **WHEN** an existing `PhaseContract` omits the `gate_conditions` field
- **THEN** the contract SHALL remain valid
- **AND** existing phase-router code SHALL not require changes

### Requirement: GateCondition is a discriminated union of declarative descriptor kinds

The `GateCondition` type SHALL be a discriminated union on the `kind` field. The initial set of kinds SHALL be `'artifact_exists'`, `'approval_required'`, and `'validation_passed'`. Each kind SHALL have a `readonly kind` discriminant and an optional `readonly target?: string` field.

#### Scenario: GateCondition kind is a closed set

- **WHEN** the `GateCondition` type is inspected
- **THEN** the `kind` field SHALL accept exactly `'artifact_exists'`, `'approval_required'`, or `'validation_passed'`
- **AND** any other string value SHALL cause a compile-time error

#### Scenario: GateCondition is serializable as plain JSON

- **WHEN** a `GateCondition` value is passed through `JSON.stringify` and `JSON.parse`
- **THEN** the result SHALL be structurally identical to the original
- **AND** no function references or class instances SHALL be required

### Requirement: Gate condition evaluation is not provided in this phase

The system SHALL NOT include any gate condition evaluation logic in this phase. The `GateCondition` type is a data-only descriptor. Evaluation functions that interpret `GateCondition` values against run state SHALL be implemented in Phase 2 (server adapter layer).

#### Scenario: No evaluation function is exported

- **WHEN** the exports of the phase-contract-structure module are inspected
- **THEN** no function named `evaluateGateCondition`, `checkGate`, or similar SHALL exist
- **AND** only type definitions and type guard utilities (if any) SHALL be exported
