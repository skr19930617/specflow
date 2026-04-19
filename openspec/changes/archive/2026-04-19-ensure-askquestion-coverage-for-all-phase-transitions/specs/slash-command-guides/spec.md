## ADDED Requirements

### Requirement: Mainline terminal-handoff phases SHALL present next-step options via AskUserQuestion

Generated slash-command guides for the mainline workflow SHALL, whenever a command's flow leaves the run in a mainline terminal-handoff phase, present the next-step choice to the operator through an `AskUserQuestion` block rather than prose-only text.

The mainline terminal-handoff phases for this requirement are exactly:

- `spec_ready` — terminal phase of `/specflow`
- `design_ready` — terminal phase of `/specflow.design`
- `apply_ready` — terminal phase of `/specflow.apply`

For each of those phases, the `AskUserQuestion` block in the corresponding generated guide SHALL reference the following slash-command targets in its option set (labels and option order are not normative):

- `spec_ready` in `specflow.md` SHALL reference `/specflow.design` and `/specflow.reject`.
- `design_ready` in `specflow.design.md` SHALL reference `/specflow.apply` and `/specflow.reject`.
- `apply_ready` in `specflow.apply.md` SHALL reference `/specflow.approve`, `/specflow.fix_apply`, and `/specflow.reject`.

Explanatory prose MAY coexist with the `AskUserQuestion` block, but prose-only handoffs SHALL NOT satisfy this requirement.

Review-loop guides (`specflow.review_design.md`, `specflow.review_apply.md`, `specflow.fix_design.md`, `specflow.fix_apply.md`) are NOT governed by this requirement; they remain governed by the existing review-loop handoff requirements.

#### Scenario: Proposal guide presents spec_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.md` is read
- **THEN** the section that offers the next step after the run reaches `spec_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference both `/specflow.design` and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text (for example, a bullet list of "recommended handoffs") in place of the `AskUserQuestion` block

#### Scenario: Design guide presents design_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.design.md` is read
- **THEN** the section that offers the next step after the run reaches `design_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference both `/specflow.apply` and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text in place of the `AskUserQuestion` block

#### Scenario: Apply guide presents apply_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.apply.md` is read
- **THEN** the section that offers the next step after the run reaches `apply_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference `/specflow.approve`, `/specflow.fix_apply`, and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text in place of the `AskUserQuestion` block

#### Scenario: Utility and review-loop guides are exempt

- **WHEN** generated `specflow.reject.md`, `specflow.dashboard.md`, `specflow.setup.md`, `specflow.explore.md`, `specflow.spec.md`, `specflow.license.md`, `specflow.readme.md`, `specflow.review_design.md`, `specflow.review_apply.md`, `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** this requirement SHALL NOT be evaluated against them
- **AND** those guides SHALL continue to be governed only by the existing requirements that apply to them

## MODIFIED Requirements

### Requirement: Mainline workflow guides encode strict phase gates

The generated guides for the main slash-command workflow SHALL encode the
current phase order and SHALL not document bypasses around the implemented
gates. Guides SHALL present mainline terminal-handoff options via
`AskUserQuestion` blocks rather than prose-only text per the
"Mainline terminal-handoff phases SHALL present next-step options via
AskUserQuestion" requirement.

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
