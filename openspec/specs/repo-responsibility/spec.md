# repo-responsibility Specification

## Purpose
TBD - created by archiving change repo-responsibility-nongoals. Update Purpose after archive.
## Requirements
### Requirement: Repository scope definition exists in docs/architecture.md
The existing `docs/architecture.md` SHALL contain a "Repository Scope" section that defines what this repository owns and does not own. The section SHALL be appended to the existing document without modifying existing sections.

#### Scenario: Repository Scope section is present
- **WHEN** a contributor reads `docs/architecture.md`
- **THEN** a "Repository Scope" section exists containing subsections for "This repo owns", "This repo does not own", and "Boundary Decision Rules"

### Requirement: Workflow core ownership is defined
The "This repo owns" subsection SHALL list workflow core as a responsibility, including state machine definition, run-state management, and review orchestration.

#### Scenario: Workflow core listed as owned
- **WHEN** a contributor checks the "This repo owns" subsection
- **THEN** workflow core is listed with state machine definition, run-state management, and review orchestration as constituent parts

### Requirement: Bundled local reference implementation ownership is defined
The "This repo owns" subsection of `docs/architecture.md` SHALL list the bundled local reference implementation as a responsibility, including specflow-* CLI tools, slash command guides, and templates. The section SHALL state that the local implementation is the **canonical reference implementation** of the workflow core contract, and that it is bundled but replaceable by external runtimes (DB-backed, server-backed, etc.) conforming to the workflow core contract.

#### Scenario: Local reference implementation listed as owned
- **WHEN** a contributor checks the "This repo owns" subsection
- **THEN** the bundled local reference implementation is listed, covering specflow-* CLI tools, slash command guides, and templates
- **THEN** the section explicitly labels the bundled local mode as the "canonical reference implementation" of the workflow core contract
- **THEN** the section states the implementation is replaceable by external runtimes conforming to the workflow core contract

### Requirement: Non-goals are explicitly listed
The "This repo does not own" subsection SHALL explicitly list DB-backed runtime, server PoC, and external runtime adapters as out of scope.

#### Scenario: Non-goals are present
- **WHEN** a contributor checks the "This repo does not own" subsection
- **THEN** DB-backed runtime, server PoC, and external runtime adapters are each listed as out of scope

### Requirement: Boundary decision rules with examples
The "Boundary Decision Rules" subsection SHALL provide actionable rules for classifying borderline components, with at least three concrete examples covering shared interfaces, external-runtime-specific artifacts, and contract conformance testing.

#### Scenario: Decision rules include concrete examples
- **WHEN** a contributor evaluates whether a new component belongs in this repo
- **THEN** the boundary decision rules provide at least three examples: one for a component that belongs (shared interface definitions), one that does not belong (DB migration scripts), and one for contract conformance test suites

### Requirement: Workflow core contract surface inventory
The document SHALL include a non-normative inventory of the workflow core contract surface, listing state machine schema, run-state JSON structure, and review protocol interface. CLI entry-points SHALL NOT be listed as part of the core contract.

#### Scenario: Contract inventory is non-normative and excludes CLI
- **WHEN** a contributor reads the contract surface inventory
- **THEN** the inventory lists state machine schema, run-state JSON structure, and review protocol interface
- **THEN** the inventory explicitly states it is a non-normative inventory, not the authoritative specification
- **THEN** CLI entry-point contracts are not listed as core contract surface

### Requirement: Contract normative specification is deferred
The document SHALL state that the authoritative normative specification for each contract surface, including versioning and change management, is deferred to a follow-up proposal.

#### Scenario: Follow-up proposal is referenced
- **WHEN** a contributor reads the contract surface inventory
- **THEN** the section states that normative contract specification, versioning, and change ownership are deferred to a separate future proposal

### Requirement: Reference-implementation framing properties are present in docs/architecture.md
The Repository Scope section of `docs/architecture.md` SHALL document the bundled local mode using three framing properties: (1) conformance target, (2) replaceability, and (3) contract mapping. All three properties SHALL be present and discoverable from the Repository Scope section.

#### Scenario: Conformance target property is present
- **WHEN** a contributor reads the Repository Scope section
- **THEN** the section explicitly states that the bundled local mode is the canonical conformance target for the workflow core contract

#### Scenario: Replaceability property is present
- **WHEN** a contributor reads the Repository Scope section
- **THEN** the section explicitly states that the local mode is replaceable by external runtimes (e.g., DB-backed, server-backed) conforming to the workflow core contract

#### Scenario: Contract mapping property is present
- **WHEN** a contributor reads the Repository Scope section
- **THEN** the section maps each bundled adapter — CLI entrypoints under `src/bin/`, the file-backed RunStore, and the git-backed ArtifactStore — to the workflow core contract surface it implements

### Requirement: README.md positions the bundled local mode as the reference implementation
`README.md` SHALL include a positioning paragraph that labels the bundled local slash-command + file-backed + git-backed mode as the canonical reference implementation of the workflow core contract. The paragraph SHALL include all three framing properties (conformance target, replaceability, contract mapping) at least by reference to `docs/architecture.md`. `README.md` SHALL be treated as the source of truth for external-facing positioning of the bundled local mode.

#### Scenario: README positioning paragraph exists
- **WHEN** a reader opens `README.md`
- **THEN** the README contains a positioning paragraph identifying the bundled local mode as the canonical reference implementation of the workflow core contract

#### Scenario: README references the three framing properties
- **WHEN** a reader reads the README positioning paragraph
- **THEN** the paragraph either states the three framing properties (conformance target, replaceability, contract mapping) directly, or links to the Repository Scope section of `docs/architecture.md` for the details
- **THEN** the README explicitly identifies itself as the source of truth for external-facing positioning of the bundled local mode

### Requirement: Slash-command guide docs reinforce reference-implementation framing
Slash-command guide docs under `.claude/commands/` and `openspec/` guide surfaces SHALL reinforce the reference-implementation framing wherever the framing is relevant. Guide docs SHALL NOT contradict the framing established in `docs/architecture.md` and `README.md`.

#### Scenario: Slash-command guides do not contradict the framing
- **WHEN** a contributor reads any slash-command guide doc that references local execution mode, bundled adapters, or runtime substitution
- **THEN** the guide's wording is consistent with the bundled local mode being the canonical reference implementation of the workflow core contract, and with the local mode being replaceable by conforming external runtimes

### Requirement: Core contract surface and bundled-adapter surface wording are distinguished
The wording of the workflow core contract surface inventory in `docs/architecture.md` SHALL be tightened to clearly distinguish what is part of the core contract surface from what is part of the bundled-adapter surface. CLI entrypoints, file-backed RunStore, and git-backed ArtifactStore SHALL be unambiguously described as bundled-adapter surface, not core contract surface.

#### Scenario: Bundled adapters are not described as core contract surface
- **WHEN** a contributor reads the workflow core contract surface inventory
- **THEN** CLI entrypoints, the file-backed RunStore, and the git-backed ArtifactStore are unambiguously described as bundled-adapter surface
- **THEN** none of those three are listed as part of the core contract surface

### Requirement: Persistence contract status is defined in architecture.md

The Adapter Contract Categories section of `docs/architecture.md` SHALL classify the **Persistence** adapter contract as "defined" rather than "deferred-required". The section SHALL reference the async `RunArtifactStore` and `ChangeArtifactStore` interfaces as the canonical persistence contract, and SHALL reference the `ArtifactStoreError` typed error hierarchy as part of the contract.

#### Scenario: Persistence contract is classified as defined

- **WHEN** a contributor reads the Adapter Contract Categories section
- **THEN** the Persistence entry SHALL be classified as "defined" (not "deferred-required")
- **AND** it SHALL reference the async `RunArtifactStore` interface in `src/lib/artifact-store.ts`
- **AND** it SHALL reference the `ArtifactStoreError` type

#### Scenario: Persistence contract references CoreRunState mapping guidance

- **WHEN** a contributor reads the Persistence adapter contract entry
- **THEN** it SHALL reference the `CoreRunState` → DB mapping guidance as informational documentation for external runtime implementors

### Requirement: Architecture.md documents CoreRunState to DB schema mapping guidance

The `docs/architecture.md` SHALL include a non-normative mapping table from `CoreRunState` fields to vendor-neutral SQL types. The table SHALL cover all `CoreRunState` fields and SHALL explicitly disclaim vendor-specific recommendations.

#### Scenario: Mapping table is present in architecture.md

- **WHEN** a contributor reads `docs/architecture.md`
- **THEN** a CoreRunState DB mapping table SHALL be present in or linked from the Adapter Contract Categories section

#### Scenario: Mapping table includes a non-normative disclaimer

- **WHEN** a contributor reads the mapping table
- **THEN** the table SHALL include a disclaimer stating the mapping is informational guidance for external runtime implementors
- **AND** the table SHALL NOT prescribe a specific database vendor or migration tool

