## ADDED Requirements

### Requirement: PhaseContract is a single unified type combining routing and execution metadata

The system SHALL define a `PhaseContract` interface in `src/contracts/phase-contract.ts` that merges routing fields (`next_action`, `gated`, `terminal`) with execution fields (`requiredInputs`, `producedOutputs`, `cliCommands`, `agentTask`, `gatedDecision`). All fields on `PhaseContract` SHALL be `readonly`. The type SHALL be the single source of truth for what a phase does and how it routes.

#### Scenario: PhaseContract includes routing fields from the original type
- **WHEN** the `PhaseContract` type is inspected
- **THEN** it SHALL include `phase: string`, `next_action: PhaseNextAction`, `gated: boolean`, `terminal: boolean`, `agent?: string`, `advance_event?: string`, `gated_event_kind?: string`, `gated_event_type?: EventType`, `next_phase?: string`, and `terminal_reason?: string`

#### Scenario: PhaseContract includes execution fields
- **WHEN** the `PhaseContract` type is inspected
- **THEN** it SHALL include `requiredInputs: readonly ArtifactRef[]`, `producedOutputs: readonly ArtifactRef[]`, `cliCommands: readonly CliStep[]`, `agentTask?: AgentTaskSpec`, and `gatedDecision?: GatedDecisionSpec`

#### Scenario: All PhaseContract fields are readonly
- **WHEN** the `PhaseContract` type definition is read
- **THEN** every field SHALL be marked `readonly`

### Requirement: ArtifactRef identifies an artifact by path pattern and role

The system SHALL define an `ArtifactRef` type with at minimum:
- `path`: a relative path pattern (e.g. `openspec/changes/<CHANGE_ID>/proposal.md`)
- `role`: `"input"` or `"output"` indicating whether the artifact is consumed or produced

#### Scenario: ArtifactRef has path and role
- **WHEN** the `ArtifactRef` type is inspected
- **THEN** it SHALL include `readonly path: string` and `readonly role: "input" | "output"`

### Requirement: CliStep describes a CLI command invocation within a phase

The system SHALL define a `CliStep` type with at minimum:
- `command`: the CLI command template string (e.g. `specflow-run advance "<RUN_ID>" review_design`)
- `description`: a human-readable description of what the step does

#### Scenario: CliStep has command and description
- **WHEN** the `CliStep` type is inspected
- **THEN** it SHALL include `readonly command: string` and `readonly description: string`

### Requirement: AgentTaskSpec is a minimal type describing agent-delegated work

The system SHALL define an `AgentTaskSpec` type with:
- `agent`: the agent identifier
- `description`: a description of the delegated task

#### Scenario: AgentTaskSpec has agent and description
- **WHEN** the `AgentTaskSpec` type is inspected
- **THEN** it SHALL include `readonly agent: string` and `readonly description: string`

### Requirement: GatedDecisionSpec describes a user decision point

The system SHALL define a `GatedDecisionSpec` type with:
- `options`: an array of option labels the user can choose
- `advanceEvents`: a mapping from option label to the event name to fire

#### Scenario: GatedDecisionSpec has options and advanceEvents
- **WHEN** the `GatedDecisionSpec` type is inspected
- **THEN** it SHALL include `readonly options: readonly string[]` and `readonly advanceEvents: Readonly<Record<string, string>>`

### Requirement: PhaseContractRegistry provides lookup by phase name

The system SHALL define a `PhaseContractRegistry` interface with:
- `get(phase: string): PhaseContract | undefined` — returns the contract for a phase
- `phases(): readonly string[]` — returns all registered phase names

The production registry SHALL be populated from the structured phase contract data and SHALL cover every phase in the workflow state machine.

#### Scenario: Registry returns contract for a known phase
- **WHEN** `registry.get("design_review")` is called
- **THEN** it SHALL return a `PhaseContract` whose `phase` is `"design_review"`

#### Scenario: Registry returns undefined for unknown phase
- **WHEN** `registry.get("nonexistent_phase")` is called
- **THEN** it SHALL return `undefined`

#### Scenario: Registry lists all workflow phases
- **WHEN** `registry.phases()` is called
- **THEN** it SHALL return an array containing every phase defined in the workflow state machine

### Requirement: All workflow phases are expressed as PhaseContract instances

The system SHALL define a `PhaseContract` for every phase in the specflow workflow state machine. The set of registered phases SHALL match exactly the set of phases accepted by `specflow-run advance`.

#### Scenario: Every workflow phase has a PhaseContract
- **WHEN** the phase contract registry is compared to the workflow state machine phases
- **THEN** every phase that `specflow-run advance` accepts SHALL have a corresponding `PhaseContract` in the registry

#### Scenario: No orphaned PhaseContracts
- **WHEN** the phase contract registry is inspected
- **THEN** every registered `PhaseContract.phase` SHALL be a valid phase in the workflow state machine

### Requirement: PhaseContract → Markdown conversion produces semantically equivalent output

The system SHALL provide a `renderPhaseMarkdown(contract: PhaseContract): string` function (or equivalent) that converts a `PhaseContract` into a Markdown section. The generated Markdown SHALL be semantically equivalent to the current `command-bodies.ts` output for the same phase: section headings, CLI command invocations, and gate conditions SHALL match. Whitespace and formatting differences are permitted.

#### Scenario: Generated Markdown contains the same CLI commands
- **WHEN** `renderPhaseMarkdown` is called for a phase that specifies `cliCommands`
- **THEN** the output SHALL contain each `CliStep.command` as a code block or inline code

#### Scenario: Generated Markdown preserves section headings
- **WHEN** `renderPhaseMarkdown` is called for a phase
- **THEN** the output SHALL include Markdown headings that correspond to the phase's step structure

#### Scenario: Prose templates are preserved alongside structured data
- **WHEN** a phase has both structured data (CLI commands, artifacts) and prose guidance
- **THEN** the output SHALL include both the generated structured sections and the prose template content
