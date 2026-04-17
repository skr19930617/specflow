## MODIFIED Requirements

### Requirement: The workflow machine defines the authoritative phase graph

The system SHALL expose a flat workflow machine with version `4.1` and the
exact states, events, and transitions declared in
`src/lib/workflow-machine.ts`. Version `4.1` introduces the `spec_verify`
phase between `spec_validate` and `spec_ready`, along with the
`spec_verified` and `revise_spec` events that drive it.

#### Scenario: The workflow graph includes the mainline and utility branches

- **WHEN** the workflow exports are inspected
- **THEN** they SHALL include the mainline states from `start` through
  `approved`
- **AND** they SHALL also include `decomposed`, `rejected`, `explore`, and
  `spec_bootstrap`
- **AND** they SHALL include the new state `spec_verify`

#### Scenario: Final states are terminal

- **WHEN** `approved`, `decomposed`, or `rejected` is inspected
- **THEN** the state SHALL expose no allowed events

#### Scenario: Branch-path events are explicit

- **WHEN** the workflow events are inspected
- **THEN** they SHALL include `explore_start`, `explore_complete`,
  `spec_bootstrap_start`, and `spec_bootstrap_complete`
- **AND** they SHALL also include `spec_verified` and `revise_spec`

#### Scenario: Spec verification sits between spec_validate and spec_ready

- **WHEN** the transitions out of `spec_validate` are inspected
- **THEN** the `spec_validated` event SHALL transition to `spec_verify`
  (not directly to `spec_ready`)
- **AND** the `spec_verified` event SHALL transition from `spec_verify`
  to `spec_ready`

#### Scenario: Revise_spec sends the run back to spec_draft

- **WHEN** the transitions out of `spec_verify` are inspected
- **THEN** the `revise_spec` event SHALL transition from `spec_verify`
  to `spec_draft`
- **AND** on the next forward pass the run SHALL traverse
  `spec_draft → spec_validate → spec_verify` again (no fast-path that
  skips `spec_validate`)

## ADDED Requirements

### Requirement: `spec_verify` runs uniformly regardless of Modified Capabilities

The `spec_verify` phase SHALL be entered on every change on the forward
path from `spec_validate`, regardless of whether
`openspec/changes/<change_id>/proposal.md` lists any `Modified
Capabilities`. When the list is empty, the phase SHALL complete
immediately by emitting `spec_verified` with a report stating
`no_modified_capabilities`, without user prompting. This uniformity
keeps the gate presence consistent across pure-addition and
modification changes.

#### Scenario: Empty Modified Capabilities advances without prompting

- **WHEN** a run reaches `spec_verify`
- **AND** `proposal.md` lists zero `Modified Capabilities` entries
- **THEN** the `/specflow` guide SHALL invoke
  `specflow-run advance "<RUN_ID>" spec_verified` without prompting the
  user
- **AND** the run SHALL land in `spec_ready`

#### Scenario: Non-empty Modified Capabilities triggers verification flow

- **WHEN** a run reaches `spec_verify`
- **AND** `proposal.md` lists one or more `Modified Capabilities`
  entries
- **THEN** the `/specflow` guide SHALL invoke `specflow-spec-verify` and
  SHALL NOT advance to `spec_verified` before processing the result

### Requirement: `spec_verify` artifact-phase gate blocks on missing / unparseable baselines

`specflow-run advance <run_id> spec_verified` SHALL, in addition to the
standard transition validation, require that every capability listed
under `Modified Capabilities` in `proposal.md` resolve to a readable and
parseable baseline spec file before the transition is accepted. When a
baseline is missing or unparseable, the core function SHALL return a
typed error and the CLI SHALL map the error to a non-zero exit code.

#### Scenario: Missing baseline blocks spec_verified

- **WHEN** `specflow-run advance <run_id> spec_verified` is invoked
- **AND** a `Modified Capabilities` entry has no corresponding
  `openspec/specs/<name>/spec.md`
- **THEN** the core function SHALL return a typed `missing_baseline`
  error
- **AND** the CLI SHALL exit non-zero without transitioning the run

#### Scenario: Unparseable baseline blocks spec_verified

- **WHEN** `specflow-run advance <run_id> spec_verified` is invoked
- **AND** a baseline spec referenced by `Modified Capabilities` exists
  but cannot be parsed into requirements + scenarios
- **THEN** the core function SHALL return a typed
  `unparseable_baseline` error
- **AND** the CLI SHALL exit non-zero without transitioning the run
