# slash-command-guides Specification

## Purpose

Describe the slash-command guides generated from the current command contract
registry.

## Requirements

### Requirement: Contract-defined slash-command assets

The system SHALL define slash-command assets from `commandContracts`. Each
command SHALL have an id, slash-command name, output path under
`global/commands/`, accepted argument placeholder, references, and a markdown
body.

#### Scenario: Mainline commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow`, `specflow.design`, `specflow.apply`,
  and `specflow.approve`
- **AND** each of those commands SHALL render to `global/commands/<id>.md`

#### Scenario: Support commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL also include `specflow.reject`, `specflow.review_design`,
  `specflow.review_apply`, `specflow.fix_design`, `specflow.fix_apply`,
  `specflow.explore`, `specflow.spec`, `specflow.decompose`,
  `specflow.dashboard`, `specflow.setup`, `specflow.license`, and
  `specflow.readme`

### Requirement: Generated markdown preserves body sections and hook sections

Generated command markdown SHALL render command body sections in order and SHALL
append a `Run State Hooks` section whenever the contract defines run hooks.

#### Scenario: Hooked commands render run-state hook sections

- **WHEN** generated `specflow.md`, `specflow.design.md`, `specflow.apply.md`,
  `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** the file SHALL contain a `## Run State Hooks` section

#### Scenario: Commands without hooks omit the hook section

- **WHEN** generated command markdown is read for a command with no run hooks
- **THEN** the file SHALL render the command body without a `Run State Hooks`
  section

### Requirement: Mainline workflow guides encode strict phase gates

The generated guides for the main slash-command workflow SHALL encode the
current phase order and SHALL not document bypasses around the implemented
gates.

#### Scenario: Proposal guide initializes run state and enters proposal flow

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL include `specflow-run start "<CHANGE_ID>"`
- **AND** it SHALL include `specflow-run advance "<CHANGE_ID>" propose`

#### Scenario: Design validates before review

- **WHEN** generated `specflow.design.md` is read
- **THEN** it SHALL place `openspec validate "<CHANGE_ID>" --type change --json`
  before the design review gate
- **AND** it SHALL not document a continue-on-validation-error path

#### Scenario: Apply gates approval behind apply_ready

- **WHEN** generated `specflow.apply.md` is read
- **THEN** it SHALL enter the apply review gate with
  `specflow-run advance "<CHANGE_ID>" review_apply`
- **AND** it SHALL only offer `/specflow.approve` after
  `specflow-run advance "<CHANGE_ID>" apply_review_approved`

#### Scenario: Approve keeps archive before commit

- **WHEN** generated `specflow.approve.md` is read
- **THEN** it SHALL order the `Archive`, `Commit`, and `Push & Pull Request`
  sections in that sequence

### Requirement: Review-loop guides define handoff targets and revision events

The review and fix-loop slash-command guides SHALL describe the current Codex
review handoffs and the phase-specific revision transitions used by the run
state machine.

#### Scenario: Design review guide exposes apply and fix handoffs

- **WHEN** the `specflow.review_design` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.apply`,
  `handoff:specflow.reject`, and `handoff:specflow.fix_design`

#### Scenario: Apply review guide exposes approve and fix handoffs

- **WHEN** the `specflow.review_apply` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.approve`,
  `handoff:specflow.fix_apply`, and `handoff:specflow.reject`

#### Scenario: Fix-loop guides record self-transitions

- **WHEN** the generated fix-loop guides are read
- **THEN** `specflow.fix_design` SHALL include `revise_design`
- **AND** `specflow.fix_apply` SHALL include `revise_apply`

### Requirement: Utility slash-command guides use synthetic branches where implemented

The exploration and baseline-spec bootstrap guides SHALL document the synthetic
run-state branch behavior implemented in their hooks.

#### Scenario: Explore guide uses a synthetic run

- **WHEN** generated `specflow.explore.md` is read
- **THEN** it SHALL start a synthetic run id and record `explore_start` and
  `explore_complete`

#### Scenario: Spec bootstrap guide uses a synthetic run

- **WHEN** generated `specflow.spec.md` is read
- **THEN** it SHALL start a synthetic run id and record
  `spec_bootstrap_start` and `spec_bootstrap_complete`
