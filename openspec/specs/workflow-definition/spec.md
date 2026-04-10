# workflow-definition Specification

## Purpose

TBD - created by archiving change workflow-state-machine. Update Purpose after archive.

## Requirements

### Requirement: Static workflow definition file

The system SHALL maintain a machine-readable workflow definition asset at logical path `global/workflow/state-machine.json`, emitted in repo builds at `dist/package/global/workflow/state-machine.json`, that declares all valid states, events, and transitions for the specflow mainline flow.

#### Scenario: Definition file exists and is valid JSON

- **WHEN** the file `dist/package/global/workflow/state-machine.json` is read
- **THEN** it SHALL parse as valid JSON containing `states`, `events`, and `transitions` keys

#### Scenario: Definition file is consumable by jq

- **WHEN** the file is piped to `jq '.'`
- **THEN** the command SHALL exit with code 0 and produce valid output

### Requirement: Detailed flat workflow states

The workflow definition SHALL define the following flat states: `start`, `proposal_draft`, `proposal_scope`, `proposal_clarify`, `proposal_review`, `proposal_validate`, `proposal_ready`, `design_draft`, `design_validate`, `design_review`, `design_ready`, `apply_draft`, `apply_review`, `apply_ready`, `approved`, `decomposed`, `rejected`, `explore`, `spec_bootstrap`.

#### Scenario: All detailed states are present

- **WHEN** the `states` array in the definition is inspected
- **THEN** it SHALL contain exactly: `start`, `proposal_draft`, `proposal_scope`, `proposal_clarify`, `proposal_review`, `proposal_validate`, `proposal_ready`, `design_draft`, `design_validate`, `design_review`, `design_ready`, `apply_draft`, `apply_review`, `apply_ready`, `approved`, `decomposed`, `rejected`, `explore`, `spec_bootstrap`

#### Scenario: No dotted state names exist

- **WHEN** the `states` array is inspected
- **THEN** it SHALL NOT contain dotted names such as `proposal.clarify`, `design.review`, or `apply.ready`

### Requirement: Event definitions

The workflow definition SHALL declare named events that trigger transitions between detailed states. Events SHALL include: `propose`, `check_scope`, `continue_proposal`, `decompose`, `review_proposal`, `proposal_review_approved`, `revise_proposal`, `proposal_validated`, `accept_proposal`, `validate_design`, `design_validated`, `revise_design`, `design_review_approved`, `accept_design`, `review_apply`, `revise_apply`, `apply_review_approved`, `accept_apply`, `reject`, `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`.

#### Scenario: Proposal, design, and apply gate events are defined

- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `propose`, `check_scope`, `continue_proposal`, `review_proposal`, `proposal_review_approved`, `proposal_validated`, `accept_proposal`, `validate_design`, `design_validated`, `design_review_approved`, `accept_design`, `review_apply`, `apply_review_approved`, and `accept_apply`

#### Scenario: Reject event is defined

- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `reject`

#### Scenario: Phase-specific revise events are defined

- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `revise_proposal`, `revise_design`, and `revise_apply`
- **THEN** it SHALL NOT contain a generic `revise`

#### Scenario: Branch path events are defined

- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`

### Requirement: Transition rules

Each transition SHALL specify a `from` state, an `event`, and a `to` state. Only transitions declared in the definition SHALL be considered valid.

#### Scenario: Forward flow transitions

- **WHEN** the mainline flow is followed from `start` to `approved`
- **THEN** the transitions SHALL form the path: `start` →(propose)→ `proposal_draft` →(check_scope)→ `proposal_scope` →(continue_proposal)→ `proposal_clarify` →(review_proposal)→ `proposal_review` →(proposal_review_approved)→ `proposal_validate` →(proposal_validated)→ `proposal_ready` →(accept_proposal)→ `design_draft` →(validate_design)→ `design_validate` →(design_validated)→ `design_review` →(design_review_approved)→ `design_ready` →(accept_design)→ `apply_draft` →(review_apply)→ `apply_review` →(apply_review_approved)→ `apply_ready` →(accept_apply)→ `approved`

#### Scenario: Decomposition is a terminal scope path

- **WHEN** the `decompose` event is applied to `proposal_scope`
- **THEN** the transition SHALL lead to `decomposed`

#### Scenario: Reject transition from every active non-terminal mainline state

- **WHEN** the `reject` event is applied to any of `proposal_draft`, `proposal_scope`, `proposal_clarify`, `proposal_review`, `proposal_validate`, `proposal_ready`, `design_draft`, `design_validate`, `design_review`, `design_ready`, `apply_draft`, `apply_review`, or `apply_ready`
- **THEN** the transition SHALL lead to `rejected`

#### Scenario: Revision events loop to the appropriate draft state

- **WHEN** `revise_proposal` is applied to `proposal_review` or `proposal_validate`
- **THEN** the `to` state SHALL equal `proposal_clarify`
- **WHEN** `revise_design` is applied to `design_validate` or `design_review`
- **THEN** the `to` state SHALL equal `design_draft`
- **WHEN** `revise_apply` is applied to `apply_review`
- **THEN** the `to` state SHALL equal `apply_draft`

#### Scenario: Explore branch path transitions

- **WHEN** the `explore_start` event is applied to `start`
- **THEN** the `to` state SHALL be `explore`
- **WHEN** the `explore_complete` event is applied to `explore`
- **THEN** the `to` state SHALL be `start`

#### Scenario: Spec bootstrap branch path transitions

- **WHEN** the `spec_bootstrap_start` event is applied to `start`
- **THEN** the `to` state SHALL be `spec_bootstrap`
- **WHEN** the `spec_bootstrap_complete` event is applied to `spec_bootstrap`
- **THEN** the `to` state SHALL be `start`

### Requirement: Allowed events per state

The workflow definition SHALL provide a way to derive which events are valid for a given state by filtering transitions by `from` state.

#### Scenario: Query allowed events for a detailed state

- **WHEN** a consumer queries transitions where `from` equals `proposal_validate`
- **THEN** the result SHALL include events `revise_proposal`, `proposal_validated`, and `reject`
- **THEN** the result SHALL NOT include unrelated events such as `accept_design` or `accept_apply`

### Requirement: Workflow definition version

The workflow definition SHALL include a `version` field. The version SHALL be `"3.0"` to reflect the breaking change of introducing explicit proposal/design/apply gate states.

#### Scenario: Version is 3.0

- **WHEN** the `version` field in `state-machine.json` is inspected
- **THEN** it SHALL be `"3.0"`
