## ADDED Requirements

### Requirement: Typed registry SHALL declare all asset types
The system SHALL provide a TypeScript typed registry that declares all specflow assets: commands, prompts, orchestrator scripts, handoff targets, and agent roles. Each asset entry SHALL include an id, asset type, file path, and a list of references to other assets.

#### Scenario: Registry declares all command files
- **WHEN** the registry is loaded
- **THEN** every `.md` file in `dist/package/global/commands/` SHALL have a corresponding entry with type `command`

#### Scenario: Registry declares all prompt files
- **WHEN** the registry is loaded
- **THEN** every `.md` file in `dist/package/global/prompts/` SHALL have a corresponding entry with type `prompt`

#### Scenario: Registry declares all orchestrator scripts
- **WHEN** the registry is loaded
- **THEN** every executable file in `bin/` SHALL have a corresponding entry with type `orchestrator`

#### Scenario: Registry entries include cross-references
- **WHEN** a command references a prompt template (e.g., `review_design_prompt.md`)
- **THEN** the command's registry entry SHALL list that prompt in its `references` array

### Requirement: Command IDs SHALL be unique
The system SHALL reject a registry where two or more command entries share the same `id`.

#### Scenario: Duplicate command ID detection
- **WHEN** two commands have the same `id` value
- **THEN** validation SHALL fail with an error identifying both entries and the duplicated ID

### Requirement: Slash command names SHALL be unique
The system SHALL reject a registry where two or more commands declare the same slash command name.

#### Scenario: Duplicate slash command name detection
- **WHEN** two commands declare the same slash command name (e.g., both use `/specflow.apply`)
- **THEN** validation SHALL fail with an error identifying both entries and the duplicated name

### Requirement: Referenced prompt templates SHALL exist
The system SHALL verify that every prompt template referenced by a command or orchestrator script exists in the registry.

#### Scenario: Missing prompt reference detection
- **WHEN** a command references `review_missing_prompt.md` that does not exist in the registry
- **THEN** validation SHALL fail with an error identifying the referencing command and the missing prompt

### Requirement: Referenced handoff targets SHALL exist
The system SHALL verify that every handoff target referenced in a command exists as a registered command.

#### Scenario: Missing handoff target detection
- **WHEN** command `specflow.design` references handoff target `specflow.nonexistent`
- **THEN** validation SHALL fail with an error identifying the source command and the missing target

### Requirement: Agent roles SHALL be valid
The system SHALL verify that every agent role referenced in asset entries is a recognized role defined in the registry's role enumeration.

#### Scenario: Invalid agent role detection
- **WHEN** an asset entry references an agent role `unknown-role` that is not in the valid role set
- **THEN** validation SHALL fail with an error identifying the asset and the invalid role

### Requirement: Validation SHALL run via npm script
The system SHALL provide an `npm run validate:registry` command that executes the full registry validation pipeline.

#### Scenario: Successful validation run
- **WHEN** the user runs `npm run validate:registry` with a valid registry
- **THEN** the command SHALL exit with code 0 and print a summary of validated assets

#### Scenario: Failed validation run
- **WHEN** the user runs `npm run validate:registry` with a registry containing errors
- **THEN** the command SHALL exit with a non-zero code and print all validation errors with file paths and error descriptions

### Requirement: Validation errors SHALL include actionable context
Each validation error SHALL include the asset id, asset type, file path, the specific check that failed, and a human-readable description of how to fix the issue.

#### Scenario: Error message format
- **WHEN** validation detects a missing prompt reference in command `specflow.design`
- **THEN** the error message SHALL include at minimum: `{ id: "specflow.design", type: "command", check: "prompt-ref-exists", message: "..." }`
