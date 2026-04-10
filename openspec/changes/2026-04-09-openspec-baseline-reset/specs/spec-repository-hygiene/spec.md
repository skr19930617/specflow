## ADDED Requirements

### Requirement: Stable OpenSpec truth SHALL live under `openspec/specs/`

The repository SHALL treat `openspec/specs/` as the canonical description of current behavior. Active changes MAY carry spec deltas under `openspec/changes/<change-id>/specs/`, but historical change records do not need to remain committed once current truth is reflected in the stable specs.

#### Scenario: Reading the current product behavior

- **WHEN** a maintainer needs the stable specification for an implemented capability
- **THEN** the source of truth SHALL be the corresponding file under `openspec/specs/`

#### Scenario: Working on an active change

- **WHEN** a new change is in progress
- **THEN** that change MAY define temporary spec deltas under `openspec/changes/<change-id>/specs/`

### Requirement: Historical change records MAY be discarded from the working tree

Once a change has been merged or superseded, the repository MAY delete its proposal, design, tasks, review ledgers, phase summaries, and archive copies from `openspec/changes/`. Git history SHALL be the long-term historical record.

#### Scenario: Completed work no longer needs an in-tree archive

- **WHEN** a previously completed or superseded change is no longer needed for active editing
- **THEN** its change-record files MAY be absent from `openspec/changes/`

#### Scenario: Recovering old change context

- **WHEN** a maintainer needs to inspect a discarded historical change record
- **THEN** the recovery path SHALL be Git history rather than a committed `openspec/changes/archive/` tree

### Requirement: Coverage artifacts SHALL NOT be tracked

Coverage output under `coverage/` SHALL be treated as a locally generated artifact and SHALL NOT be committed as canonical repository state.

#### Scenario: Coverage is generated locally

- **WHEN** a contributor generates coverage output during local verification
- **THEN** the files MAY exist under `coverage/` locally
- **THEN** they SHALL NOT be required for repository correctness

#### Scenario: Verifying tracked coverage artifacts are absent

- **WHEN** `git ls-files coverage` is executed
- **THEN** it SHALL return no tracked files
