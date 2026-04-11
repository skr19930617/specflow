# agent-context-template Specification

## Purpose
TBD - created by archiving change define-reusable-agent-context-template-and-repo-setup-generator. Update Purpose after archive.
## Requirements
### Requirement: Context layering model defines five distinct layers with ownership and conflict resolution

The system SHALL define a context layering model with five layers, each with a designated owner, persistence location, and editability constraint.

#### Scenario: Layer definitions are complete and non-overlapping

- **WHEN** the context layering model is evaluated
- **THEN** the following layers SHALL be defined:
  - Layer 1: Global Invariants (owned by specflow core, immutable, embedded in template)
  - Layer 2: Project Profile (owned by `setup`, persisted in `.specflow/profile.json`, manually editable)
  - Layer 3: Phase/Workflow Contract (owned by command prompt, embedded in command body, immutable source)
  - Layer 4: Runtime Task Instance (owned by workflow runtime, volatile)
  - Layer 5: Evidence Context (owned by review/apply runtime, volatile)

#### Scenario: Conflict resolution follows defined priority

- **WHEN** two layers provide conflicting values for the same key
- **THEN** the system SHALL resolve conflicts using priority: Layer 1 > Layer 3 > Layer 2 > Layer 4 > Layer 5

#### Scenario: Layers use independent namespaces to minimize conflicts

- **WHEN** layers are composed into effective context
- **THEN** each layer SHALL use its own namespace and Layer 4-5 SHALL add data rather than override existing layers

### Requirement: Profile schema defines a closed, versioned JSON contract

The system SHALL define a `.specflow/profile.json` schema with required and optional fields, closed nested objects, and monotonic version tracking.

#### Scenario: Required fields are always present and non-null

- **WHEN** a valid profile is evaluated
- **THEN** `schemaVersion` (string), `languages` (string[], exactly 1 in v1), and `toolchain` (string) SHALL be non-null and present

#### Scenario: Optional nested objects are always present with nullable children

- **WHEN** a valid profile is evaluated
- **THEN** `commands` and `directories` objects SHALL always be present (never null)
- **AND** their child fields SHALL individually be `string | null` or `string[] | null`

#### Scenario: Optional array fields use null for undetected and empty array for none-applicable

- **WHEN** an optional array field (e.g., `forbiddenEditZones`) was not detected
- **THEN** its value SHALL be `null`
- **WHEN** the field was detected but no items apply
- **THEN** its value SHALL be `[]`

#### Scenario: Schema objects reject unknown keys

- **WHEN** a profile contains a key not defined in the schema (within `commands` or `directories`)
- **THEN** schema validation SHALL report an error
- **AND** the profile SHALL be considered invalid

#### Scenario: Schema version uses monotonic integer strings

- **WHEN** a non-backwards-compatible schema change is introduced
- **THEN** `schemaVersion` SHALL be incremented (e.g., "1" to "2")
- **AND** all profile readers SHALL validate the version before processing

### Requirement: Surface architecture separates core model from surface-specific adapters

The system SHALL separate the context layering model and profile schema (core) from surface-specific rendering (adapter), with a clear boundary.

#### Scenario: Core components are surface-neutral

- **WHEN** the context layering model, profile schema, or setup analyzer is evaluated
- **THEN** it SHALL contain no references to specific agent surfaces (Claude, Cursor, etc.)

#### Scenario: Claude adapter renders CLAUDE.md from profile and template

- **WHEN** the Claude adapter renders output
- **THEN** it SHALL read `.specflow/profile.json` and compose a CLAUDE.md file using managed/unmanaged markers

#### Scenario: Future adapters can be added without modifying core

- **WHEN** a new surface adapter is introduced (e.g., Cursor `.cursorrules` renderer)
- **THEN** it SHALL only depend on the core profile schema and layering model
- **AND** no changes to core SHALL be required

### Requirement: CLAUDE.md uses marker-based managed/unmanaged boundary

The Claude adapter SHALL use HTML comment markers to distinguish managed content (rendered from profile) from unmanaged content (user-authored).

#### Scenario: Managed content is enclosed in markers

- **WHEN** the adapter renders CLAUDE.md
- **THEN** rendered content SHALL be enclosed between `<!-- specflow:managed:start -->` and `<!-- specflow:managed:end -->` markers

#### Scenario: Unmanaged content is never modified by the adapter

- **WHEN** the adapter renders CLAUDE.md
- **THEN** content outside the managed markers SHALL not be modified

#### Scenario: Legacy CLAUDE.md without markers preserves all existing content

- **WHEN** the adapter encounters a CLAUDE.md without managed markers
- **THEN** it SHALL insert the managed block at the top of the file
- **AND** it SHALL preserve the entire existing file content as unmanaged content after the managed block
- **AND** it SHALL display a warning about potential duplicates and require user confirmation

#### Scenario: Marker anomalies trigger safe abort

- **WHEN** the adapter encounters malformed markers (missing start/end, duplicates, wrong order)
- **THEN** it SHALL abort rendering without modifying CLAUDE.md
- **AND** it SHALL display an error describing the anomaly

### Requirement: Profile validation is enforced at every read entry point

Every component that reads `.specflow/profile.json` SHALL validate the schema before processing.

#### Scenario: Valid profile passes and processing continues

- **WHEN** a component reads a profile that passes schema validation
- **THEN** processing SHALL continue normally

#### Scenario: Invalid profile causes processing to abort

- **WHEN** a component reads a profile that fails schema validation
- **THEN** the component SHALL abort processing
- **AND** it SHALL display the validation errors and suggest running `setup`

#### Scenario: Version mismatch between profile and template stops rendering

- **WHEN** profile `schemaVersion` is less than the template's expected version
- **THEN** rendering SHALL stop and the system SHALL prompt the user to run `setup`
- **WHEN** profile `schemaVersion` is greater than the template's expected version
- **THEN** rendering SHALL stop and the system SHALL prompt the user to run `specflow-init --update`

