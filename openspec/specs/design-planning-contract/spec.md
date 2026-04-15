# design-planning-contract Specification

## Purpose
TBD - created by archiving change define-design-contract-required-for-specflow-task-planning-and-apply-windowing. Update Purpose after archive.
## Requirements
### Requirement: Design artifact SHALL contain planning-oriented sections

Every newly generated `design.md` SHALL include the following mandatory sections as markdown headings. Each section SHALL contain at least one line of non-empty content. When a section is not applicable to the change, the content SHALL be "N/A" with a brief justification.

The mandatory planning sections are:

1. **Concerns** — user-facing concerns or vertical slices, and the problem each concern resolves
2. **State / Lifecycle** — canonical state, derived state, lifecycle boundaries, and persistence-sensitive state
3. **Contracts / Interfaces** — interfaces between layers (UI / API / persistence / renderer / external services), and inputs/outputs that other bundles depend on
4. **Persistence / Ownership** — data ownership boundaries, storage mechanisms, and artifact ownership
5. **Integration Points** — external systems, cross-layer dependency points, and regeneration / retry / save / restore boundaries
6. **Ordering / Dependency Notes** — which concerns are foundational, which depend on prior artifacts or contracts, and what can be implemented in parallel
7. **Completion Conditions** — what artifact or observable condition means a concern is complete, and what should be reviewable independently

#### Scenario: Design with all planning sections passes structural validation

- **WHEN** a `design.md` is validated and all 7 mandatory planning section headings are present with non-empty content
- **THEN** the structural validation SHALL pass

#### Scenario: Design missing a planning section heading fails structural validation

- **WHEN** a `design.md` is validated and one or more of the 7 mandatory planning section headings is absent
- **THEN** the structural validation SHALL fail
- **AND** the validation error SHALL list the missing heading names

#### Scenario: Design with an empty planning section fails structural validation

- **WHEN** a `design.md` is validated and a mandatory planning section heading exists but has no content below it (or only whitespace)
- **THEN** the structural validation SHALL fail
- **AND** the validation error SHALL identify the empty section by name

#### Scenario: N/A is valid content for a non-applicable section

- **WHEN** a mandatory planning section contains "N/A" followed by a brief justification
- **THEN** the structural validation SHALL treat the section as non-empty and pass

### Requirement: Planning sections SHALL enable bundle boundary derivation

The Concerns section SHALL describe each concern at a granularity that allows a task planner to map one or more concerns to a bundle. The Ordering / Dependency Notes section SHALL describe inter-concern dependencies at a granularity that allows a task planner to derive `depends_on` relationships between bundles.

#### Scenario: Each concern maps to at least one identifiable unit of work

- **WHEN** a task planner reads the Concerns section
- **THEN** each listed concern SHALL be identifiable as a distinct unit of work suitable for bundle extraction

#### Scenario: Ordering notes express dependency direction between concerns

- **WHEN** a task planner reads the Ordering / Dependency Notes section
- **THEN** for each dependency between concerns, the section SHALL express which concern depends on which (i.e., direction), not just that a relationship exists

### Requirement: Planning sections SHALL enable completion semantics derivation

The Completion Conditions section SHALL describe, for each concern or group of concerns, what artifact or observable condition indicates completion. The Contracts / Interfaces section SHALL describe inputs and outputs that other bundles depend on, enabling output-artifact-based completion checks.

#### Scenario: Completion condition maps to an observable artifact or state

- **WHEN** a task planner reads the Completion Conditions section
- **THEN** each completion condition SHALL reference a specific artifact (e.g., file, endpoint, schema) or observable state change

#### Scenario: Contract outputs enable bundle completion checks

- **WHEN** a task planner reads the Contracts / Interfaces section
- **THEN** the listed outputs SHALL be specific enough to check existence (e.g., file paths, exported symbols, API endpoint paths)

### Requirement: Planning sections apply only to newly generated designs

The planning-section requirements SHALL apply only to changes where `design.md` does not yet exist at the time of design generation. Changes that already have a `design.md` SHALL NOT be required to retroactively add planning sections.

#### Scenario: New design generation includes planning sections

- **WHEN** design generation runs for a change where `design.md` does not yet exist
- **THEN** the generated `design.md` SHALL include all 7 mandatory planning section headings

#### Scenario: Existing design is not retroactively validated

- **WHEN** a structural validation or design review runs on a change where `design.md` already existed before this contract was deployed
- **THEN** the validation SHALL NOT fail due to missing planning sections

