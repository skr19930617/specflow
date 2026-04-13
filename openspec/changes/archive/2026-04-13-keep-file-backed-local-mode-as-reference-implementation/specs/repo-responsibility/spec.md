## MODIFIED Requirements

### Requirement: Bundled local reference implementation ownership is defined
The "This repo owns" subsection of `docs/architecture.md` SHALL list the bundled local reference implementation as a responsibility, including specflow-* CLI tools, slash command guides, and templates. The section SHALL state that the local implementation is the **canonical reference implementation** of the workflow core contract, and that it is bundled but replaceable by external runtimes (DB-backed, server-backed, etc.) conforming to the workflow core contract.

#### Scenario: Local reference implementation listed as owned
- **WHEN** a contributor checks the "This repo owns" subsection
- **THEN** the bundled local reference implementation is listed, covering specflow-* CLI tools, slash command guides, and templates
- **THEN** the section explicitly labels the bundled local mode as the "canonical reference implementation" of the workflow core contract
- **THEN** the section states the implementation is replaceable by external runtimes conforming to the workflow core contract

## ADDED Requirements

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
