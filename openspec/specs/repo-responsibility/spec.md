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
The "This repo owns" subsection SHALL list the bundled local reference implementation as a responsibility, including specflow-* CLI tools, slash command guides, and templates. The section SHALL state that the local implementation is bundled but replaceable.

#### Scenario: Local reference implementation listed as owned
- **WHEN** a contributor checks the "This repo owns" subsection
- **THEN** bundled local reference implementation is listed, covering specflow-* CLI tools, slash command guides, and templates
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

