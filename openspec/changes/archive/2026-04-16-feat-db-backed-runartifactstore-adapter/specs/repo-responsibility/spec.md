## MODIFIED Requirements

### Requirement: Repository scope definition exists in docs/architecture.md
The existing `docs/architecture.md` SHALL contain a "Repository Scope" section that defines what this repository owns and does not own. The section SHALL be appended to the existing document without modifying existing sections.

#### Scenario: Repository Scope section is present
- **WHEN** a contributor reads `docs/architecture.md`
- **THEN** a "Repository Scope" section exists containing subsections for "This repo owns", "This repo does not own", and "Boundary Decision Rules"

## ADDED Requirements

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
