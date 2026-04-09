# design-artifact-loop Specification

## Purpose
TBD - created by archiving change design-orchestrator-extraction. Update Purpose after archive.
## Requirements
### Requirement: Artifact loop script entry point
The system SHALL provide `bin/specflow-design-artifacts` as a Node-based CLI with two subcommands: `next` and `validate`. The script SHALL exit with code 0 on success and non-zero on error.

#### Scenario: Next subcommand invocation
- **WHEN** `specflow-design-artifacts next <CHANGE_ID>` is executed
- **THEN** the script SHALL poll `openspec status`, find the next ready artifact, fetch its instructions, and output a single JSON object to stdout

#### Scenario: Validate subcommand invocation
- **WHEN** `specflow-design-artifacts validate <CHANGE_ID>` is executed
- **THEN** the script SHALL run `openspec validate` and output the validation result JSON to stdout

#### Scenario: Missing CHANGE_ID argument
- **WHEN** `specflow-design-artifacts next` is executed without a CHANGE_ID
- **THEN** the script SHALL exit with code 1 and print usage to stderr

### Requirement: One-artifact-at-a-time dependency resolution
The `next` subcommand SHALL be stateless: each invocation polls `openspec status` fresh, identifies the next ready artifact, fetches its instructions, and returns. The calling slash command drives the loop by invoking `next` repeatedly.

#### Scenario: Ready artifact found
- **WHEN** `openspec status --change <CHANGE_ID> --json` reports one or more artifacts with `status: "ready"`
- **THEN** the script SHALL select the first ready artifact, run `openspec instructions <artifact-id> --change <CHANGE_ID> --json`, and output: `{"status": "ready", "artifactId": "<id>", "outputPath": "<path>", "template": "<template>", "instruction": "<instruction>", "dependencies": [...]}`

#### Scenario: All artifacts complete
- **WHEN** all artifacts in `applyRequires` have `status: "done"`
- **THEN** the script SHALL output `{"status": "complete"}` and exit with code 0

#### Scenario: Blocked — no ready artifacts remain
- **WHEN** no artifacts have `status: "ready"` and blocked artifacts remain
- **THEN** the script SHALL output `{"status": "blocked", "blocked": ["<artifact-ids>"]}` and exit with code 1

### Requirement: Structural validation wrapper
The `validate` subcommand SHALL wrap `openspec validate` with consistent output formatting.

#### Scenario: Validation pass
- **WHEN** `openspec validate <CHANGE_ID> --type change --json` returns `valid: true`
- **THEN** the script SHALL output `{"status": "valid"}` and exit with code 0

#### Scenario: Validation failure
- **WHEN** `openspec validate <CHANGE_ID> --type change --json` returns `valid: false`
- **THEN** the script SHALL output the full validation JSON (including issues) and exit with code 1
