# command-runtime-integration Specification

## Purpose
Keep slash-command flow definitions aligned with the authoritative workflow state machine and run-state CLI.

## Requirements
### Requirement: Proposal flow SHALL initialize and enter the run state machine
The `/specflow` command definition SHALL initialize `specflow-run` for the created change and advance it from `start` to `proposal`.

#### Scenario: Change creation starts a run
- **WHEN** `/specflow` creates `openspec/changes/<CHANGE_ID>/`
- **THEN** the command definition SHALL include `specflow-run start "<CHANGE_ID>"`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" propose`

### Requirement: Phase-entry commands SHALL advance the run state
The phase-entry slash commands SHALL advance the run according to `global/workflow/state-machine.json`.

#### Scenario: Design phase accepts proposal
- **WHEN** `/specflow.design` begins design work for a change in `proposal`
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" accept_proposal`

#### Scenario: Apply phase accepts design
- **WHEN** `/specflow.apply` begins implementation work for a change in `design`
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" accept_design`

### Requirement: Revision commands SHALL record self-transitions
The fix-loop slash commands SHALL record phase-specific self-transitions before re-review.

#### Scenario: Design fix records revise_design
- **WHEN** `/specflow.fix_design` enters the design revision loop
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" revise_design`

#### Scenario: Apply fix records revise_apply
- **WHEN** `/specflow.fix_apply` enters the apply revision loop
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" revise_apply`

### Requirement: Approval flow SHALL persist summary state and close the workflow
The approval slash command SHALL update the summary pointer and advance the run to `approved`.

#### Scenario: Approve updates summary path
- **WHEN** `/specflow.approve` writes `approval-summary.md`
- **THEN** the command definition SHALL include `specflow-run update-field "<CHANGE_ID>" last_summary_path "<FEATURE_DIR>/approval-summary.md"`

#### Scenario: Approve accepts apply
- **WHEN** `/specflow.approve` completes successfully
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" accept_apply`
