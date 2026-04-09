## ADDED Requirements

### Requirement: Manifest SHALL be generated from the validated registry
The system SHALL generate a `dist/manifest.json` file from the typed registry after all validation checks pass.

#### Scenario: Manifest generation on successful validation
- **WHEN** `npm run validate:registry` completes with all checks passing
- **THEN** `dist/manifest.json` SHALL be written with the full asset inventory

#### Scenario: Manifest is NOT generated on validation failure
- **WHEN** `npm run validate:registry` detects validation errors
- **THEN** `dist/manifest.json` SHALL NOT be written (or an existing file SHALL NOT be updated)

### Requirement: Manifest SHALL contain the complete asset inventory
The manifest SHALL include an entry for every asset in the registry, grouped by asset type (commands, prompts, orchestrators, handoffTargets, agentRoles).

#### Scenario: Manifest includes all asset types
- **WHEN** the manifest is generated
- **THEN** the JSON SHALL contain top-level keys: `commands`, `prompts`, `orchestrators`, `handoffTargets`, `agentRoles`, and `metadata`

#### Scenario: Each asset entry includes required fields
- **WHEN** an asset entry is written to the manifest
- **THEN** it SHALL include at minimum: `id`, `type`, `filePath`, and `references`

### Requirement: Manifest SHALL include generation metadata
The manifest SHALL include metadata for traceability: generation timestamp, registry version, and the git commit hash at generation time.

#### Scenario: Metadata is present
- **WHEN** the manifest is generated
- **THEN** the `metadata` object SHALL contain `generatedAt` (ISO 8601 timestamp), `registryVersion` (string), and `gitCommit` (short SHA)

### Requirement: Manifest output SHALL be deterministic
Given the same registry input and git state, the manifest output SHALL be byte-identical across runs (no random ordering, no varying timestamps beyond the generation metadata).

#### Scenario: Deterministic ordering
- **WHEN** the manifest is generated twice from the same registry without changes
- **THEN** the output SHALL be identical except for the `generatedAt` timestamp in metadata

### Requirement: Manifest SHALL be valid JSON
The generated manifest SHALL be parseable by any standard JSON parser and SHALL use 2-space indentation for readability.

#### Scenario: JSON validity
- **WHEN** `dist/manifest.json` is generated
- **THEN** `JSON.parse(fs.readFileSync("dist/manifest.json", "utf-8"))` SHALL succeed without errors
