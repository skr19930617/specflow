# command-runtime-integration Specification

## Purpose

Keep slash-command flow definitions aligned with the authoritative workflow state machine and run-state CLI.

## Requirements

### Requirement: Proposal flow SHALL initialize and enter the detailed proposal states

The `/specflow` command definition SHALL initialize `specflow-run` for the created change and advance it from `start` to `proposal_draft`.

#### Scenario: Change creation starts a run

- **WHEN** `/specflow` creates `openspec/changes/<CHANGE_ID>/`
- **THEN** the command definition SHALL include `specflow-run start "<CHANGE_ID>"`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" propose`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" check_scope`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" continue_proposal`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" review_proposal`
- **THEN** it SHALL include `specflow-review-proposal review <CHANGE_ID>`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" proposal_review_approved`
- **THEN** it SHALL include `specflow-run advance "<CHANGE_ID>" proposal_validated`

### Requirement: Proposal and design validation SHALL be strict blocking gates

The `/specflow` and `/specflow.design` command definitions SHALL block progression when validation fails.

#### Scenario: Proposal validation cannot be bypassed

- **WHEN** `/specflow` documents the proposal validation step
- **THEN** it SHALL say `Do **not** continue despite validation errors`
- **THEN** it SHALL NOT offer a continue-on-error option

#### Scenario: Design validation cannot be bypassed

- **WHEN** `/specflow.design` documents the design validation step
- **THEN** it SHALL say `Do **not** continue despite validation errors`
- **THEN** it SHALL NOT offer a continue-on-error option

### Requirement: Phase-entry commands SHALL advance the run state

The phase-entry slash commands SHALL advance the run according to the generated workflow definition asset (`dist/package/global/workflow/state-machine.json` in a repo build).

#### Scenario: Design phase accepts proposal

- **WHEN** `/specflow.design` begins design work for a change in `proposal_ready`
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" accept_proposal`
- **THEN** `/specflow.design` SHALL start only from `proposal_ready`

#### Scenario: Apply phase accepts design

- **WHEN** `/specflow.apply` begins implementation work for a change in `design_ready`
- **THEN** the command definition SHALL include `specflow-run advance "<CHANGE_ID>" accept_design`
- **THEN** `/specflow.apply` SHALL start only from `design_ready`

#### Scenario: Approve phase requires apply_ready

- **WHEN** `/specflow.approve` begins
- **THEN** it SHALL require the run phase to be `apply_ready`
- **THEN** it SHALL NOT be offered while apply review findings remain

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

### Requirement: Branch-path commands SHALL use synthetic runs

The branch-path slash commands SHALL initialize synthetic runs before emitting `explore_*` and `spec_bootstrap_*` events.

#### Scenario: Explore command records branch transitions

- **WHEN** `/specflow.explore` enters the explore branch path
- **THEN** the command definition SHALL include `specflow-run start "<RUN_ID>" --run-kind synthetic`
- **THEN** it SHALL include `specflow-run advance "<RUN_ID>" explore_start`
- **THEN** it SHALL include `specflow-run advance "<RUN_ID>" explore_complete`

#### Scenario: Spec bootstrap command records branch transitions

- **WHEN** `/specflow.spec` enters the spec bootstrap branch path
- **THEN** the command definition SHALL include `specflow-run start "<RUN_ID>" --run-kind synthetic`
- **THEN** it SHALL include `specflow-run advance "<RUN_ID>" spec_bootstrap_start`
- **THEN** it SHALL include `specflow-run advance "<RUN_ID>" spec_bootstrap_complete`
