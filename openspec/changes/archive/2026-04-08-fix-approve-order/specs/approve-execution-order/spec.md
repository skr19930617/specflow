## ADDED Requirements

### Requirement: Approve command execution order
The `/specflow.approve` command SHALL execute Archive before Commit. The execution order SHALL be: Quality Gate → Approval Summary → Archive → Commit → Push → PR.

#### Scenario: Archive executes before commit
- **WHEN** the user runs `/specflow.approve`
- **THEN** the system SHALL run `openspec archive` before `git add -A` and `git commit`

#### Scenario: Archive failure does not block commit
- **WHEN** the user runs `/specflow.approve` and `openspec archive` fails
- **THEN** the system SHALL display a warning message and continue with Commit → Push → PR creation

#### Scenario: Commit diff includes archived state
- **WHEN** archive succeeds and the system proceeds to commit
- **THEN** the `git add -A` SHALL stage the archive-moved artifacts so the commit diff reflects the archived state
