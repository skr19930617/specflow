## MODIFIED Requirements

### Requirement: ChangeArtifactStore interface defines change-domain operations

The system SHALL define a `ChangeArtifactStore` interface with the following operations:
- `read(changeId, artifactType, qualifier?)`: returns artifact content or a typed not-found error
- `write(changeId, artifactType, content, qualifier?)`: writes artifact content atomically
- `exists(changeId, artifactType, qualifier?)`: returns boolean
- `list(changeId, artifactType)`: returns all qualifiers for a qualified artifact type, or confirms singleton existence
- `listChanges()`: returns all change identifiers known to the store
- `changeExists(changeId)`: returns boolean indicating whether the change container (directory or equivalent) exists

For `review-ledger` artifacts, `write` SHALL create a backup of the existing content before overwriting.

Core modules SHALL depend on this interface, never on filesystem paths or I/O primitives directly. This includes bin-layer commands (`specflow-review-proposal`, `specflow-review-design`, `specflow-review-apply`, `specflow-prepare-change`, `specflow-analyze`).

#### Scenario: Read returns content for existing artifact

- **WHEN** `read(my-change, proposal)` is called and the proposal exists
- **THEN** it SHALL return the proposal content as a UTF-8 string

#### Scenario: Read returns typed error for missing artifact

- **WHEN** `read(my-change, design)` is called and no design exists
- **THEN** it SHALL return a typed not-found error identifying `(my-change, design)`

#### Scenario: Write is atomic

- **WHEN** `write(my-change, proposal, content)` is called
- **THEN** the content SHALL be written atomically — no partial reads are possible during the write

#### Scenario: Write creates backup for review-ledger artifacts

- **WHEN** `write(my-change, review-ledger, content, design)` is called and a design ledger already exists
- **THEN** the existing content SHALL be backed up before the new content is written

#### Scenario: List returns qualifiers for spec-delta

- **WHEN** `list(my-change, spec-delta)` is called and two spec deltas exist
- **THEN** it SHALL return the spec name qualifiers for both

#### Scenario: listChanges returns all known change identifiers

- **WHEN** `listChanges()` is called and two changes exist
- **THEN** it SHALL return an array containing both change identifiers

#### Scenario: listChanges returns empty when no changes exist

- **WHEN** `listChanges()` is called and no changes exist
- **THEN** it SHALL return an empty array

#### Scenario: changeExists returns true for an existing change container

- **WHEN** `changeExists(my-change)` is called and the change directory exists
- **THEN** it SHALL return `true`

#### Scenario: changeExists returns false for a non-existent change

- **WHEN** `changeExists(unknown-change)` is called and no such change exists
- **THEN** it SHALL return `false`

#### Scenario: changeExists is independent of artifact existence

- **WHEN** `changeExists(my-change)` is called and the change directory exists but contains no artifacts
- **THEN** it SHALL return `true` (container existence is sufficient)

### Requirement: LocalFs adapters implement store interfaces using the existing directory layout

`LocalFsChangeArtifactStore` SHALL implement `ChangeArtifactStore` using the directory layout `openspec/changes/<changeId>/` for change artifacts.

`LocalFsRunArtifactStore` SHALL implement `RunArtifactStore` using the directory layout `.specflow/runs/<runId>/` for run artifacts.

The local filesystem layout SHALL be documented as an adapter-specific concern, not a core contract.

`LocalFsChangeArtifactStore.listChanges()` SHALL enumerate subdirectories of `openspec/changes/` and return their names as change identifiers.

`LocalFsChangeArtifactStore.changeExists(changeId)` SHALL return `true` if and only if the directory `openspec/changes/<changeId>/` exists.

#### Scenario: LocalFs change adapter resolves proposal path

- **WHEN** `read(my-change, proposal)` is called on `LocalFsChangeArtifactStore`
- **THEN** it SHALL read from `openspec/changes/my-change/proposal.md`

#### Scenario: LocalFs change adapter resolves spec-delta path

- **WHEN** `read(my-change, spec-delta, run-identity-model)` is called on `LocalFsChangeArtifactStore`
- **THEN** it SHALL read from `openspec/changes/my-change/specs/run-identity-model/spec.md`

#### Scenario: LocalFs change adapter resolves review-ledger path

- **WHEN** `read(my-change, review-ledger, proposal)` is called on `LocalFsChangeArtifactStore`
- **THEN** it SHALL read from `openspec/changes/my-change/review-ledger-proposal.json`

#### Scenario: LocalFs run adapter resolves run-state path

- **WHEN** `read(my-run-1, run-state)` is called on `LocalFsRunArtifactStore`
- **THEN** it SHALL read from `.specflow/runs/my-run-1/run.json`

#### Scenario: LocalFs listChanges enumerates change directories

- **WHEN** `listChanges()` is called and `openspec/changes/` contains `foo/` and `bar/`
- **THEN** it SHALL return `["bar", "foo"]` (or equivalent unordered)

#### Scenario: LocalFs changeExists checks directory presence

- **WHEN** `changeExists(my-change)` is called and `openspec/changes/my-change/` exists
- **THEN** it SHALL return `true`
