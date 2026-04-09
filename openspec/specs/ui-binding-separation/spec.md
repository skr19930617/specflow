# ui-binding-separation Specification

## Purpose
TBD - created by archiving change extend-workflow-state-machine. Update Purpose after archive.
## Requirements
### Requirement: UI binding metadata lives outside run.json
Delivery-specific metadata (e.g., Slack channel, thread ID, message routing) SHALL NOT be stored in `run.json`. Such metadata SHALL be stored in separate files within the run directory following the naming convention `.specflow/runs/<run_id>/<ui>.json`.

#### Scenario: run.json does not contain UI-specific fields
- **WHEN** the `run.json` schema is inspected
- **THEN** it SHALL NOT contain fields named `slack_channel`, `slack_thread`, `slack_message_ts`, or any delivery-routing metadata

#### Scenario: UI metadata file naming convention
- **WHEN** a future UI integration stores metadata for a run
- **THEN** the file SHALL be named `.specflow/runs/<run_id>/<ui>.json` where `<ui>` identifies the delivery platform (e.g., `slack.json`)

### Requirement: UI metadata files are gitignored
UI binding metadata files SHALL be excluded from version control alongside the run state.

#### Scenario: Gitignore covers UI metadata files
- **WHEN** `.specflow/runs/` is matched by `.gitignore`
- **THEN** all files within run directories including `<ui>.json` files SHALL be excluded from version control

