# artifact-ownership-model Specification

## Purpose
TBD - created by archiving change decide-artifact-ownership-and-storage-abstraction. Update Purpose after archive.
## Requirements
### Requirement: The canonical artifact model enumerates two storage domains

The system SHALL define a canonical artifact model with two storage domains:
- **Change-domain** (durable, committed): artifacts that belong to a change and are portable across runtimes
- **Run-domain** (ephemeral, gitignored): artifacts that belong to a run and are local-only

Change-domain artifact types SHALL be: `proposal`, `design`, `tasks`, `spec-delta`, `review-ledger`, `current-phase`, `approval-summary`.

Run-domain artifact types SHALL be: `run-state`.

The set of valid artifact types SHALL be a closed enum per domain. Adapters MUST reject unknown types.

#### Scenario: All change-domain artifact types are enumerated

- **WHEN** the artifact type registry is inspected
- **THEN** it SHALL contain exactly the types `proposal`, `design`, `tasks`, `spec-delta`, `review-ledger`, `current-phase`, `approval-summary` in the change domain

#### Scenario: All run-domain artifact types are enumerated

- **WHEN** the artifact type registry is inspected
- **THEN** it SHALL contain exactly the type `run-state` in the run domain

#### Scenario: Unknown artifact types are rejected

- **WHEN** an adapter receives a request for an unrecognized artifact type
- **THEN** it SHALL reject the request with a typed error

### Requirement: Artifact identity uses domain-specific composite keys

Change-domain artifacts SHALL be identified by `(changeId, artifactType, qualifier?)`:
- Singleton artifacts (no qualifier): `proposal`, `design`, `tasks`, `current-phase`, `approval-summary`
- Qualified artifacts: `spec-delta` requires a spec name qualifier; `review-ledger` requires a review kind qualifier (`proposal`, `design`, or `apply`)

Run-domain artifacts SHALL be identified by `(runId, artifactType)`:
- `run-state` is a singleton per run — one document containing state, metadata, and embedded history

#### Scenario: Singleton change artifacts resolve without qualifier

- **WHEN** the artifact `(my-change, proposal)` is requested
- **THEN** the store SHALL resolve to the proposal document for `my-change`

#### Scenario: Qualified spec-delta artifacts resolve with spec name

- **WHEN** the artifact `(my-change, spec-delta, run-identity-model)` is requested
- **THEN** the store SHALL resolve to the spec delta for `run-identity-model` under `my-change`

#### Scenario: Qualified review-ledger artifacts resolve with review kind

- **WHEN** the artifact `(my-change, review-ledger, design)` is requested
- **THEN** the store SHALL resolve to the design review ledger for `my-change`

#### Scenario: Run-state artifacts resolve by runId

- **WHEN** the artifact `(my-run-1, run-state)` is requested
- **THEN** the store SHALL resolve to the run state document for `my-run-1`

### Requirement: Each artifact type has defined ownership

The canonical model SHALL specify which module creates, reads, and updates each artifact type. No artifact SHALL be written by more than one module unless explicitly documented as shared-write.

#### Scenario: Ownership is defined for every artifact type

- **WHEN** the ownership table is inspected
- **THEN** every artifact type SHALL have a defined creator module and zero or more reader/updater modules

#### Scenario: No undocumented shared-write exists

- **WHEN** two modules write the same artifact type
- **THEN** the ownership table SHALL explicitly document both as shared-write with justification

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

### Requirement: RunArtifactStore interface defines run-domain operations

The system SHALL define a `RunArtifactStore` interface with the following operations:
- `read(runId, artifactType)`: returns artifact content or a typed not-found error
- `write(runId, artifactType, content)`: writes artifact content atomically
- `exists(runId, artifactType)`: returns boolean
- `list(changeId?)`: returns all runIds, optionally filtered by changeId

Run-domain writes SHALL be atomic but do not require backup-before-overwrite.

#### Scenario: Read returns run state for existing run

- **WHEN** `read(my-run-1, run-state)` is called and the run exists
- **THEN** it SHALL return the run state JSON content

#### Scenario: List returns all runs for a change

- **WHEN** `list(my-change)` is called and two runs exist for `my-change`
- **THEN** it SHALL return both runIds

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

### Requirement: Backend-agnostic invariants constrain all adapter implementations

Any adapter implementing `ChangeArtifactStore` or `RunArtifactStore` SHALL satisfy these invariants:
- **Payload expectations**: markdown artifacts (`proposal`, `design`, `tasks`, `spec-delta`, `current-phase`, `approval-summary`) are UTF-8 text; `review-ledger` and `run-state` are JSON validated against their respective schemas
- **Atomic update**: all writes MUST be atomic — no partial reads are possible during a write operation
- **Single-writer assumption**: adapters are not required to handle concurrent writes to the same artifact

#### Scenario: Markdown artifacts are UTF-8 text

- **WHEN** a markdown artifact is written and then read
- **THEN** the content SHALL be identical UTF-8 text

#### Scenario: JSON artifacts are schema-validated

- **WHEN** a `review-ledger` or `run-state` artifact is written
- **THEN** the content SHALL be valid JSON conforming to its respective schema

#### Scenario: Writes are atomic

- **WHEN** a write is in progress and a concurrent read occurs
- **THEN** the read SHALL return either the previous complete content or the new complete content — never partial content

### Requirement: The artifact-phase gate matrix formalizes transition requirements

The system SHALL define an explicit gate matrix that maps each workflow phase transition to its required input artifacts and produced output artifacts.

If a required artifact is missing at transition time, the transition SHALL fail with a typed error identifying the missing artifact. There SHALL be no silent fallback.

The gate matrix SHALL preserve current implicit behavior — it codifies existing ad-hoc checks, not new restrictions.

Existing changes and runs created before this change SHALL remain valid without migration.

#### Scenario: Proposal-draft to proposal-review requires proposal

- **WHEN** a transition from `proposal_draft` to `proposal_review` is attempted
- **AND** `(changeId, proposal)` does not exist
- **THEN** the transition SHALL fail with a typed error identifying the missing proposal artifact

#### Scenario: Design-review requires design and tasks

- **WHEN** a transition from `design_draft` to `design_review` is attempted
- **AND** `(changeId, design)` or `(changeId, tasks)` does not exist
- **THEN** the transition SHALL fail with a typed error identifying the missing artifact(s)

#### Scenario: Gate matrix preserves existing behavior

- **WHEN** the gate matrix is compared against current ad-hoc checks in bins
- **THEN** every existing implicit artifact requirement SHALL have a corresponding gate matrix entry

#### Scenario: Existing changes remain valid

- **WHEN** a change created before this change is loaded
- **THEN** it SHALL pass gate matrix validation for its current phase without migration

