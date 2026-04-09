## MODIFIED Requirements

### Requirement: Top-level phase states
The workflow definition SHALL define the following top-level states: `start`, `proposal`, `design`, `apply`, `approved`, `rejected`, `explore`, `spec_bootstrap`.

#### Scenario: All states are present
- **WHEN** the `states` array in the definition is inspected
- **THEN** it SHALL contain exactly: `start`, `proposal`, `design`, `apply`, `approved`, `rejected`, `explore`, `spec_bootstrap`

#### Scenario: No sub-phase states exist
- **WHEN** the `states` array is inspected
- **THEN** it SHALL NOT contain sub-phase entries such as `proposal.clarify`, `proposal.validate`, `design.review`, or similar dotted names

### Requirement: Event definitions
The workflow definition SHALL declare named events that trigger transitions between states. Events SHALL include: `propose`, `accept_proposal`, `accept_design`, `accept_apply`, `reject`, `revise_design`, `revise_apply`, `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`.

#### Scenario: Mainline forward events are defined
- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `propose`, `accept_proposal`, `accept_design`, and `accept_apply`

#### Scenario: Reject event is defined
- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `reject`

#### Scenario: Phase-specific revise events are defined
- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `revise_design` and `revise_apply`
- **THEN** it SHALL NOT contain `revise`

#### Scenario: Branch path events are defined
- **WHEN** the `events` array is inspected
- **THEN** it SHALL contain `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete`

### Requirement: Transition rules
Each transition SHALL specify a `from` state, an `event`, and a `to` state. Only transitions declared in the definition SHALL be considered valid.

#### Scenario: Forward flow transitions
- **WHEN** the mainline flow is followed from `start` to `approved`
- **THEN** the transitions SHALL form the path: `start` →(propose)→ `proposal` →(accept_proposal)→ `design` →(accept_design)→ `apply` →(accept_apply)→ `approved`

#### Scenario: Reject transition from any active phase
- **WHEN** the `reject` event is applied to any of `proposal`, `design`, `apply`
- **THEN** the transition SHALL lead to the `rejected` state

#### Scenario: Phase-specific revise self-transitions
- **WHEN** the `revise_design` event is applied to `design`
- **THEN** the `to` state SHALL equal `design`
- **WHEN** the `revise_apply` event is applied to `apply`
- **THEN** the `to` state SHALL equal `apply`

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

## ADDED Requirements

### Requirement: Workflow definition version
The workflow definition SHALL include a `version` field. The version SHALL be `"2.0"` to reflect the breaking change of removing the `revise` event.

#### Scenario: Version is 2.0
- **WHEN** the `version` field in `state-machine.json` is inspected
- **THEN** it SHALL be `"2.0"`
