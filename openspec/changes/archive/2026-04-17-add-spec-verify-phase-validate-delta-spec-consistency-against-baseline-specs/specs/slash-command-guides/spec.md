## MODIFIED Requirements

### Requirement: Mainline workflow guides encode strict phase gates

The generated guides for the main slash-command workflow SHALL encode the
current phase order and SHALL not document bypasses around the implemented
gates.

#### Scenario: Proposal guide materializes local proposal artifacts before run start

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL include
  `specflow-prepare-change [<CHANGE_ID>] <raw-input>`
- **AND** it SHALL NOT require the caller to write a temp file before invoking
  `specflow-prepare-change`
- **AND** it SHALL document writing `openspec/changes/<CHANGE_ID>/proposal.md`
  before `specflow-run start`
- **AND** it SHALL include `specflow-run advance "<RUN_ID>" propose`

#### Scenario: Proposal guide drafts and validates spec deltas before design

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL place `openspec instructions specs --change "<CHANGE_ID>" --json`
  before `openspec validate "<CHANGE_ID>" --type change --json`
- **AND** it SHALL include `specflow-run advance "<RUN_ID>" validate_spec`
- **AND** it SHALL include a distinct step that runs after `spec_validated`
  and before `spec_ready`, driven by `specflow-spec-verify` and advanced via
  `specflow-run advance "<RUN_ID>" spec_verified`
- **AND** it SHALL not offer `/specflow.design` before the run reaches
  `spec_ready`

#### Scenario: Design starts from spec_ready and enters review directly

- **WHEN** generated `specflow.design.md` is read
- **THEN** it SHALL describe `spec_ready` as the entry phase
- **AND** it SHALL enter the design review gate with
  `specflow-run advance "<RUN_ID>" review_design`
- **AND** it SHALL not document `openspec validate "<CHANGE_ID>" --type change --json`

#### Scenario: Apply gates approval behind apply_ready

- **WHEN** generated `specflow.apply.md` is read
- **THEN** it SHALL enter the apply review gate with
  `specflow-run advance "<RUN_ID>" review_apply`
- **AND** it SHALL only offer `/specflow.approve` after
  `specflow-run advance "<RUN_ID>" apply_review_approved`
- **AND** the gate to issue `apply_review_approved` SHALL depend solely on the
  HIGH+ severity gate (i.e., zero findings whose `severity ∈ {critical, high}`
  and `status ∈ {new, open}`); LOW / MEDIUM findings alone SHALL NOT block
  `apply_review_approved`

#### Scenario: Approve keeps archive before commit

- **WHEN** generated `specflow.approve.md` is read
- **THEN** it SHALL order the `Archive`, `Commit`, and `Push & Pull Request`
  sections in that sequence

## ADDED Requirements

### Requirement: `/specflow` guide drives the `spec_verify` phase with hybrid CLI + agent flow

The generated `specflow.md` SHALL include a dedicated verify step that is
invoked only when the run is in `spec_verify`. The step SHALL:

- invoke `specflow-spec-verify "<CHANGE_ID>" --json` to obtain the
  machine-readable pairing + ripple report,
- interpret the JSON and surface every candidate conflict to the user
  via `AskUserQuestion` (one at a time), offering the four outcomes
  `fix delta / fix baseline / fix both / accept-as-is`,
- advance with `specflow-run advance "<RUN_ID>" revise_spec` on any
  fix choice, and with `specflow-run advance "<RUN_ID>" spec_verified`
  only when zero candidate conflicts remain unaccepted,
- when the user selects `accept-as-is`, append a row to the
  `## Accepted Spec Conflicts` markdown table in
  `openspec/changes/<CHANGE_ID>/design.md` (creating the file if it
  does not exist) before advancing.

The step SHALL NOT embed full baseline spec file contents inline in the
guide; only the CLI invocation and the conflict-processing prose SHALL
appear.

#### Scenario: Proposal guide contains the hybrid verify step

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain the literal CLI invocation shape
  `specflow-spec-verify "<CHANGE_ID>" --json`
- **AND** it SHALL contain prose describing the four outcome options
  `fix delta`, `fix baseline`, `fix both`, and `accept-as-is`
- **AND** it SHALL contain the literal advance call
  `specflow-run advance "<RUN_ID>" spec_verified`
- **AND** it SHALL contain the literal advance call
  `specflow-run advance "<RUN_ID>" revise_spec`

#### Scenario: Proposal guide describes accept-as-is record writing

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain prose instructing the agent to append a row
  to `## Accepted Spec Conflicts` inside
  `openspec/changes/<CHANGE_ID>/design.md` when the user selects
  `accept-as-is`
- **AND** it SHALL document the six-column schema
  `id | capability | delta_clause | baseline_clause | rationale | accepted_at`

#### Scenario: Empty Modified Capabilities short-circuits

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain prose stating that when
  `specflow-spec-verify` reports `reason: "no_modified_capabilities"`
  the guide advances with `spec_verified` immediately and without
  prompting the user
