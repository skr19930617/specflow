## ADDED Requirements

### Requirement: Design review SHALL include task-plannable quality gate

Design review SHALL verify that `design.md` contains the mandatory planning sections defined by `design-planning-contract`. The quality gate SHALL perform structural validation only (heading existence and non-empty content). Content quality assessment SHALL remain the responsibility of the review agent's existing evaluation logic.

When the structural validation fails, the review agent SHALL report missing or empty planning sections as findings with severity `high` and category `task-plannable`. The existing design review flow (request_changes → author fix → re-review) SHALL handle remediation; no new review phase or remediation path is introduced.

#### Scenario: Design with all planning sections passes task-plannable gate

- **WHEN** design review runs on a `design.md` that contains all 7 mandatory planning section headings with non-empty content
- **THEN** the task-plannable quality gate SHALL pass
- **AND** no `task-plannable` category findings SHALL be added

#### Scenario: Design missing planning sections triggers request_changes

- **WHEN** design review runs on a `design.md` that is missing one or more mandatory planning section headings or has empty planning sections
- **THEN** the review agent SHALL add a `high` severity finding for each missing or empty section with category `task-plannable`
- **AND** the review outcome SHALL be `request_changes` (unless other critical findings also exist)

#### Scenario: Task-plannable gate uses existing remediation flow

- **WHEN** design review returns `request_changes` due to task-plannable findings
- **THEN** the author SHALL fix the design via the existing `revise_design` transition
- **AND** the next review round SHALL re-evaluate the task-plannable gate

#### Scenario: Task-plannable gate is skipped for pre-existing designs

- **WHEN** design review runs on a change where `design.md` existed before the `design-planning-contract` was deployed
- **THEN** the task-plannable quality gate SHALL be skipped
- **AND** no `task-plannable` category findings SHALL be generated
