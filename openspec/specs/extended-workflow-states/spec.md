# extended-workflow-states Specification

## Purpose

TBD - created by archiving change extend-workflow-state-machine. Update Purpose after archive.

## Requirements

### Requirement: Explore branch path states and transitions

The workflow definition SHALL include an `explore` state as an independent branch path. The state machine SHALL define transitions `start` →(explore_start)→ `explore` →(explore_complete)→ `start` that form a loop independent of the mainline flow.

#### Scenario: Explore state exists in the definition

- **WHEN** the `states` array in `state-machine.json` is inspected
- **THEN** it SHALL contain `explore`

#### Scenario: Explore transitions form an independent loop

- **WHEN** the transitions are filtered for explore-related events
- **THEN** there SHALL be a transition `{ from: "start", event: "explore_start", to: "explore" }`
- **THEN** there SHALL be a transition `{ from: "explore", event: "explore_complete", to: "start" }`

#### Scenario: Explore does not connect to mainline phases

- **WHEN** the transitions are filtered where `from` equals `explore`
- **THEN** no transition SHALL have a `to` value of `proposal`, `design`, `apply`, `approved`, or `rejected`

### Requirement: Spec bootstrap branch path states and transitions

The workflow definition SHALL include a `spec_bootstrap` state as an independent branch path. The state machine SHALL define transitions `start` →(spec_bootstrap_start)→ `spec_bootstrap` →(spec_bootstrap_complete)→ `start` that form a loop independent of the mainline flow.

#### Scenario: Spec bootstrap state exists in the definition

- **WHEN** the `states` array in `state-machine.json` is inspected
- **THEN** it SHALL contain `spec_bootstrap`

#### Scenario: Spec bootstrap transitions form an independent loop

- **WHEN** the transitions are filtered for spec_bootstrap-related events
- **THEN** there SHALL be a transition `{ from: "start", event: "spec_bootstrap_start", to: "spec_bootstrap" }`
- **THEN** there SHALL be a transition `{ from: "spec_bootstrap", event: "spec_bootstrap_complete", to: "start" }`

#### Scenario: Spec bootstrap does not connect to mainline phases

- **WHEN** the transitions are filtered where `from` equals `spec_bootstrap`
- **THEN** no transition SHALL have a `to` value of `proposal`, `design`, `apply`, `approved`, or `rejected`

### Requirement: Distinct revision events for proposal, design, and apply

The workflow definition SHALL define `revise_proposal`, `revise_design`, and `revise_apply` as separate events replacing the former generic `revise` event.

#### Scenario: revise_proposal returns to proposal_clarify

- **WHEN** the transitions are filtered for `revise_proposal`
- **THEN** there SHALL be transitions from `proposal_review` and `proposal_validate` to `proposal_clarify`

#### Scenario: revise_design returns to design_draft

- **WHEN** the transitions are filtered for `revise_design`
- **THEN** there SHALL be transitions from `design_validate` and `design_review` to `design_draft`

#### Scenario: revise_apply returns to apply_draft

- **WHEN** the transitions are filtered for `revise_apply`
- **THEN** there SHALL be exactly one transition: `{ from: "apply_review", event: "revise_apply", to: "apply_draft" }`

#### Scenario: Generic revise event does not exist

- **WHEN** the `events` array is inspected
- **THEN** it SHALL NOT contain `revise`

### Requirement: Branch path events are defined

The workflow definition SHALL declare events: `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`.

#### Scenario: All branch path events exist

- **WHEN** the `events` array in `state-machine.json` is inspected
- **THEN** it SHALL contain `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`
