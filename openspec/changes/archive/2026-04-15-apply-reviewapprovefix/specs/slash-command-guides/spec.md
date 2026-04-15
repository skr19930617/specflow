## ADDED Requirements

### Requirement: `_with_findings` handoffs SHALL expose Approve as a non-primary option

The generated `specflow.review_apply` and `specflow.review_design` guides SHALL, in every handoff state whose name ends in `_with_findings` (i.e., `review_with_findings` and `loop_with_findings`), expose the binding-approval slash command (`/specflow.approve` for apply review, `/specflow.apply` for design review) as a selectable option. The Approve / Apply option SHALL be placed last in the option list (after fix and reject options), SHALL include a severity-summary suffix derived from `handoff.severity_summary`, and SHALL display a confirmation warning describing accepted-risk responsibilities.

#### Scenario: Apply review with-findings exposes Approve as the last option

- **WHEN** the generated `specflow.review_apply.md` describes the `review_with_findings` or `loop_with_findings` handoff
- **THEN** the option list SHALL include `/specflow.approve` as a selectable choice
- **AND** `/specflow.approve` SHALL be the last entry in the list (after the fix-loop and reject options)
- **AND** the Approve label SHALL include a severity-summary suffix referencing `handoff.severity_summary`
- **AND** the guide SHALL display a confirmation warning before launching `/specflow.approve`, instructing the user to confirm accepted-risk treatment of the unresolved HIGH+ findings

#### Scenario: Design review with-findings exposes Apply as the last option

- **WHEN** the generated `specflow.review_design.md` describes the `review_with_findings` or `loop_with_findings` handoff
- **THEN** the option list SHALL include `/specflow.apply` as a selectable choice
- **AND** `/specflow.apply` SHALL be the last entry in the list
- **AND** the Apply label SHALL include a severity-summary suffix referencing `handoff.severity_summary`
- **AND** the guide SHALL display a confirmation warning before launching `/specflow.apply`, instructing the user to confirm accepted-risk treatment of the unresolved HIGH+ findings

#### Scenario: `_no_findings` handoffs do not require the warning

- **WHEN** the generated `specflow.review_apply.md` or `specflow.review_design.md` describes a `review_no_findings` or `loop_no_findings` handoff
- **THEN** the Approve / Apply option SHALL be the first option (primary handoff)
- **AND** the accepted-risk confirmation warning SHALL NOT be required (LOW/MEDIUM severity-summary suffix MAY still be displayed for transparency)

### Requirement: Approve guide Quality Gate SHALL apply the same HIGH+ threshold

The generated `specflow.approve.md` Quality Gate SHALL evaluate ledger blocking conditions using the same threshold as the apply / design review handoff: an unresolved finding whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}` SHALL trigger a Quality Gate WARNING, while findings whose `severity ∈ {medium, low}` SHALL NOT trigger the WARNING (they remain visible in the Approval Summary's Remaining Risks section). The guide SHALL describe the gate as severity-aware so the contract is consistent with the upstream apply / design review handoff.

#### Scenario: Approve Quality Gate warns on unresolved critical or high findings

- **WHEN** the generated `specflow.approve.md` Quality Gate is evaluated
- **AND** the impl or design ledger contains at least one finding whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **THEN** the gate SHALL display the WARNING block referenced by the existing `has_open_high` semantics
- **AND** the gate description SHALL document that critical findings are included in the same threshold

#### Scenario: Approve Quality Gate passes with only LOW or MEDIUM findings

- **WHEN** the generated `specflow.approve.md` Quality Gate is evaluated
- **AND** every unresolved finding has `severity ∈ {medium, low}`
- **THEN** the gate SHALL pass without the WARNING block
- **AND** the LOW / MEDIUM findings SHALL still appear in the Approval Summary's Remaining Risks section

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

### Requirement: Review-loop guides define handoff targets and revision events

The review and fix-loop slash-command guides SHALL describe the current Codex
review handoffs and the phase-specific revision transitions used by the run
state machine. The Apply / Apply-equivalent handoff exposed by the with-findings
states SHALL be defined per the "non-primary option" requirement above
(severity-summary suffix + accepted-risk warning + last-position placement).

#### Scenario: Design review guide exposes apply and fix handoffs

- **WHEN** the `specflow.review_design` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.apply`,
  `handoff:specflow.reject`, and `handoff:specflow.fix_design`
- **AND** every `_with_findings` state in the generated guide SHALL also expose
  `handoff:specflow.apply` as a non-primary (last-position) option

#### Scenario: Apply review guide exposes approve and fix handoffs

- **WHEN** the `specflow.review_apply` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.approve`,
  `handoff:specflow.fix_apply`, and `handoff:specflow.reject`
- **AND** every `_with_findings` state in the generated guide SHALL also expose
  `handoff:specflow.approve` as a non-primary (last-position) option

#### Scenario: Fix-loop guides record self-transitions

- **WHEN** the generated fix-loop guides are read
- **THEN** `specflow.fix_design` SHALL include `revise_design`
- **AND** `specflow.fix_apply` SHALL include `revise_apply`
