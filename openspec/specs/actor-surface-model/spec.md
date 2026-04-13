# actor-surface-model Specification

## Purpose

Define the actor and surface abstraction model that enables specflow's core to
operate independently of who initiates workflow operations (actor) and through
which interface they interact (surface).

## Requirements

### Requirement: Actor taxonomy defines three actor kinds with distinct capabilities

The system SHALL recognize three actor kinds: `human`, `ai-agent`, and
`automation`. Each actor kind SHALL have a fixed set of workflow capabilities
as defined by the actor-surface capability matrix. Each actor instance SHALL be
identified by both actor kind (`actor`) and a stable actor identity
(`actor_id`) to enable auditability. The value `unknown` is a backward-
compatibility sentinel for legacy history entries that predate provenance. It
is NOT a member of the actor taxonomy and SHALL NOT be used for new
transitions. `unknown` carries no workflow permissions.

#### Scenario: Human actor has full workflow capabilities

- **WHEN** a `human` actor interacts with the workflow
- **THEN** the actor SHALL be permitted to execute all workflow operations including propose, clarify, approve, reject, review, and advance

#### Scenario: AI-agent actor has delegatable gated capabilities

- **WHEN** an `ai-agent` actor interacts with the workflow
- **THEN** the actor SHALL be permitted to execute propose, clarify, review, and non-gated advance
- **AND** the actor SHALL be permitted to execute approve only when delegation has been granted by a human actor
- **AND** the actor SHALL NOT be permitted to execute reject

#### Scenario: Automation actor is limited to non-interactive non-gated operations

- **WHEN** an `automation` actor interacts with the workflow
- **THEN** the actor SHALL be permitted to execute propose and non-gated advance
- **AND** the actor SHALL NOT be permitted to execute clarify, approve, reject, or review

### Requirement: Surface taxonomy defines interaction mediation layers

The system SHALL recognize surfaces as the mediation layer between actors and the workflow. Surfaces SHALL include at minimum `local-cli`, `remote-api`, `agent-native`, and `batch`. Surfaces SHALL control presentation and operation visibility but SHALL NOT alter workflow semantics.

#### Scenario: Surface controls presentation without altering permissions

- **WHEN** an actor operates through any surface
- **THEN** the surface SHALL determine which permitted operations are presented and how they are displayed
- **AND** the surface SHALL NOT grant or revoke any operation that the actor's kind does not permit

#### Scenario: All actors can operate through all surfaces

- **WHEN** an actor of any kind connects through any surface
- **THEN** the system SHALL permit the connection
- **AND** the actor's capabilities SHALL be determined solely by actor kind, not by surface

### Requirement: Capability matrix defines allowed workflow operations

The actor-surface capability matrix SHALL be the normative source of workflow
operation permissions across all surfaces.

| Operation | `human` | `ai-agent` | `automation` |
|-----------|---------|------------|--------------|
| `propose` | yes | yes | yes |
| `clarify` (interactive) | yes | yes | no |
| `approve` | yes | yes (delegated only) | no |
| `reject` | yes | no | no |
| `review` | yes | yes | no |
| `advance` (non-gated) | yes | yes | yes |

#### Scenario: Capability matrix applies consistently across surfaces

- **WHEN** the system evaluates whether an actor may perform a workflow operation
- **THEN** it SHALL apply the capability matrix
- **AND** the result SHALL be the same regardless of surface

#### Scenario: Automation cannot perform interactive clarify

- **WHEN** an `automation` actor attempts to issue `clarify`
- **THEN** the system SHALL reject the operation
- **AND** the rejection rationale SHALL be that clarify is interactive and automation is non-interactive

### Requirement: Concrete workflow events map exhaustively to abstract operations

Implementations SHALL resolve actor permissions, delegation, and review
handoff from the authoritative `(from_state, event)` mapping below before
executing a workflow transition. Every concrete event exposed by
`workflow-run-state` SHALL map to exactly one abstract operation or review
outcome classification. Event name alone is insufficient because the same event
name MAY classify differently depending on the source phase.

| From state | Event | To state | Abstract operation or outcome | Permission rule |
|------------|-------|----------|-------------------------------|-----------------|
| `start` | `propose` | `proposal_draft` | `propose` | Use capability matrix `propose` permissions |
| `proposal_draft` | `check_scope` | `proposal_scope` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `proposal_scope` | `continue_proposal` | `proposal_clarify` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `proposal_scope` | `decompose` | `decomposed` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `proposal_clarify` | `challenge_proposal` | `proposal_challenge` | `challenge` (enter challenge phase) | Use capability matrix `challenge` permissions |
| `proposal_challenge` | `reclarify` | `proposal_reclarify` | `challenge` outcome `reclarify` | Challenge-phase outcome; always proceeds to reclarification |
| `proposal_reclarify` | `accept_proposal` | `spec_draft` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_draft` | `reclarify` | `proposal_reclarify` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_draft` | `validate_spec` | `spec_validate` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_validate` | `revise_spec` | `spec_draft` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_validate` | `spec_validated` | `spec_ready` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_ready` | `accept_spec` | `design_draft` | `approve` | Gated approval semantics and delegation rules apply |
| `design_draft` | `review_design` | `design_review` | `review` (enter review phase) | Use capability matrix `review` permissions |
| `design_review` | `revise_design` | `design_draft` | `review` outcome `request_changes` | Review-phase outcome semantics apply; this transition is not gated `approve` |
| `design_review` | `design_review_approved` | `design_ready` | `review` outcome `review_approved` | Permit only when the reviewer may produce a binding `review_approved` outcome under `review-orchestration` |
| `design_ready` | `accept_design` | `apply_draft` | `approve` | Gated approval semantics and delegation rules apply |
| `apply_draft` | `review_apply` | `apply_review` | `review` (enter review phase) | Use capability matrix `review` permissions |
| `apply_review` | `revise_apply` | `apply_draft` | `review` outcome `request_changes` | Review-phase outcome semantics apply; this transition is not gated `approve` |
| `apply_review` | `apply_review_approved` | `apply_ready` | `review` outcome `review_approved` | Permit only when the reviewer may produce a binding `review_approved` outcome under `review-orchestration` |
| `apply_ready` | `accept_apply` | `approved` | `approve` | Gated approval semantics and delegation rules apply |
| `start` | `explore_start` | `explore` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `explore` | `explore_complete` | `start` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `start` | `spec_bootstrap_start` | `spec_bootstrap` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `spec_bootstrap` | `spec_bootstrap_complete` | `start` | `advance` (non-gated) | Use capability matrix `advance` permissions |
| `proposal_draft`, `proposal_scope`, `proposal_clarify`, `proposal_challenge`, `proposal_reclarify`, `spec_draft`, `spec_validate`, `spec_ready`, `design_draft`, `design_review`, `design_ready`, `apply_draft`, `apply_review`, `apply_ready` | `reject` | `rejected` | `reject` | Use human-only `reject` semantics |

Interactive `clarify` has no standalone workflow event. Clarify permissions
apply to the interactive exchange within clarify-capable phases, not to the
phase-entry transitions that move the workflow into or out of those phases.

#### Scenario: Permission engines use the phase and event mapping

- **WHEN** an implementation evaluates whether a concrete workflow event is permitted
- **THEN** it SHALL first resolve the event through the authoritative `(from_state, event)` mapping
- **AND** it SHALL apply permissions, delegation, and review handoff rules based on the mapped abstract operation or review outcome

#### Scenario: Gated accept transitions reuse approve permissions

- **WHEN** permission or delegation is evaluated for `accept_spec`,
  `accept_design`, or `accept_apply`
- **THEN** the system SHALL treat the transition as abstract `approve`
- **AND** the gated approval delegation rules SHALL apply
- **AND** an `automation` actor SHALL NOT be permitted to issue the transition

#### Scenario: Review-approved transitions require a binding review outcome

- **WHEN** `design_review_approved` or `apply_review_approved` is evaluated
- **THEN** the system SHALL treat the transition as the concrete manifestation
  of a `review_approved` review outcome
- **AND** it SHALL permit the transition only when the reviewer may produce a
  binding review approval under `review-orchestration`
- **AND** an undelegated `ai-agent` review approval SHALL remain advisory and
  SHALL NOT emit the transition

#### Scenario: The `reclarify` event classifies as non-gated advance

- **WHEN** `reclarify` is evaluated from `proposal_challenge` or `spec_draft`
- **THEN** the system SHALL classify it as non-gated `advance`
- **AND** gated approval delegation rules SHALL NOT apply

#### Scenario: Clarify permissions do not attach to phase-entry transitions

- **WHEN** `continue_proposal` or `reclarify` is evaluated
- **THEN** the system SHALL NOT treat either transition as abstract `clarify`
- **AND** interactive clarify permissions SHALL apply to the clarify exchange
  within the phase, not to those transitions

### Requirement: Actor-surface governing rules preserve a surface-neutral core

Actor kind SHALL determine workflow permissions. Surface SHALL determine
presentation only. Core workflow logic SHALL remain surface-neutral, and any
constraint on a specific actor-surface pair SHALL be explicit in spec text
rather than implied by the surface itself.

#### Scenario: Permission check uses actor kind only

- **WHEN** the system evaluates whether an operation is permitted
- **THEN** it SHALL check the actor kind against the actor-surface capability matrix
- **AND** it SHALL NOT factor in the surface type

#### Scenario: Surface adapters do not add core transitions

- **WHEN** a surface adapter presents or routes workflow operations
- **THEN** it SHALL map to existing core workflow events
- **AND** it SHALL NOT introduce new workflow transitions based on surface alone

#### Scenario: Actor-surface constraints must be explicit

- **WHEN** an implementation needs to constrain a specific actor-surface pair
- **THEN** the constraint SHALL be documented explicitly in normative spec text
- **AND** the constraint SHALL NOT be inferred implicitly from the surface taxonomy

### Requirement: Slash commands are surface constructs, not core workflow operations

Slash commands SHALL be classified as surface-layer constructs that map to core workflow operations. The core workflow state machine SHALL NOT reference or depend on slash command names.

#### Scenario: Core workflow operates without slash command knowledge

- **WHEN** a workflow transition is triggered
- **THEN** the core state machine SHALL process only the event name and actor identity
- **AND** it SHALL NOT reference the slash command or surface adapter that initiated the event

#### Scenario: Slash command routing is an adapter concern

- **WHEN** a surface adapter receives a slash command
- **THEN** the adapter SHALL translate the command into the corresponding core workflow event
- **AND** the translation logic SHALL reside in the adapter layer, not in the core workflow module

### Requirement: Clarify is limited to interactive actors

The `clarify` operation SHALL be treated as an interactive workflow operation.
Only actors capable of participating in an interactive clarification exchange
SHALL be permitted to issue it.

#### Scenario: Human and ai-agent actors may clarify

- **WHEN** a `human` actor or an `ai-agent` actor issues `clarify`
- **THEN** the system SHALL permit the operation
- **AND** the clarify exchange SHALL remain within the current workflow phase

#### Scenario: Automation cannot clarify

- **WHEN** an `automation` actor attempts to issue `clarify`
- **THEN** the system SHALL deny the operation

### Requirement: Gated decisions follow actor-specific semantics

The gated workflow decisions are `approve` and `reject`. A `human` actor SHALL
be permitted to issue both decisions. An `ai-agent` actor SHALL be permitted to
issue `approve` only when delegation has been granted for the current run. An
`automation` actor SHALL NOT be permitted to issue either gated decision.

#### Scenario: Human approval is binding

- **WHEN** a `human` actor issues `approve`
- **THEN** the workflow SHALL treat the decision as a binding gated approval

#### Scenario: Automation cannot issue gated decisions

- **WHEN** an `automation` actor attempts to issue `approve` or `reject`
- **THEN** the system SHALL reject the operation

### Requirement: Delegation enables ai-agent to execute gated approval

The `approve` operation is a gated decision. A `human` actor SHALL be able to
delegate that operation to an `ai-agent` actor. Delegation SHALL be scoped to a
single run, established at run-start time only, and SHALL be auditable.

#### Scenario: Only human actors can grant delegation

- **WHEN** an `ai-agent` actor or an `automation` actor attempts to grant
  delegation for `approve`
- **THEN** the system SHALL reject the delegation grant
- **AND** only a `human` actor SHALL be recognized as the delegating authority

#### Scenario: Delegation is granted per-run by a human actor

- **WHEN** a `human` actor grants delegation for a run
- **THEN** the delegation scope SHALL be limited to that specific run
- **AND** the delegation SHALL NOT propagate to other runs

#### Scenario: Human can approve without delegation

- **WHEN** a `human` actor issues `approve`
- **THEN** the system SHALL permit the operation
- **AND** no delegation record SHALL be required

#### Scenario: Delegation is established at run-start time only

- **WHEN** a run is created
- **THEN** delegation SHALL be declared via run metadata at creation time or via an explicit declaration in the proposal artifact
- **AND** mid-run delegation (granting after the run has started) SHALL NOT be permitted

#### Scenario: Delegation is immutable after run start

- **WHEN** a run has started with a delegation status (present or absent)
- **THEN** the delegation status SHALL NOT change for the duration of that run

#### Scenario: Delegated approval is recorded in provenance with actor identities

- **WHEN** an `ai-agent` actor exercises a delegated approve
- **THEN** the provenance record defined by `workflow-run-state` SHALL capture
  `actor` and `actor_id` for the executing ai-agent actor
- **AND** it SHALL capture `delegated_by: "human"` and `delegated_by_id` for
  the delegating human actor

#### Scenario: Undelegated ai-agent cannot approve

- **WHEN** an `ai-agent` actor attempts to execute approve without delegation
- **THEN** the system SHALL reject the operation
- **AND** the ai-agent MAY issue an advisory recommendation instead

#### Scenario: Automation cannot approve

- **WHEN** an `automation` actor attempts to execute approve
- **THEN** the system SHALL reject the operation

#### Scenario: Default is no delegation

- **WHEN** a run is created without explicit delegation
- **THEN** no ai-agent SHALL be permitted to execute approve for that run

### Requirement: Review outcomes are distinct from workflow approvals

Review outcomes (`review_approved`, `request_changes`, `block`) SHALL be review-phase judgments distinct from gated workflow approvals. Review outcomes SHALL NOT directly trigger gated workflow transitions.

#### Scenario: AI review outcome does not auto-advance the workflow

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **THEN** the review phase SHALL record the outcome
- **AND** the workflow SHALL NOT automatically advance to the next gated phase unless the review-orchestration mapping permits it

#### Scenario: AI reviewer block is overridable by human

- **WHEN** an `ai-agent` reviewer issues `block`
- **THEN** a `human` actor SHALL be able to override the block
- **AND** the override SHALL be recorded in provenance

#### Scenario: Human reviewer block is not overridable

- **WHEN** a `human` reviewer issues `block`
- **THEN** no actor SHALL override the block
- **AND** the system SHALL reject any attempt to change the status of a human-issued block

#### Scenario: Automation cannot issue review outcomes

- **WHEN** an `automation` actor attempts to issue `review_approved`,
  `request_changes`, or `block`
- **THEN** the system SHALL deny the operation

### Requirement: Reject is a human-only irreversible operation

The `reject` operation SHALL be executable only by a `human` actor. Reject transitions the run to a terminal state.

#### Scenario: Human can reject a run

- **WHEN** a `human` actor issues reject on a non-terminal run
- **THEN** the run SHALL transition to `rejected`

#### Scenario: AI-agent cannot reject

- **WHEN** an `ai-agent` actor attempts to reject
- **THEN** the system SHALL deny the operation

#### Scenario: Automation cannot reject

- **WHEN** an `automation` actor attempts to reject
- **THEN** the system SHALL deny the operation

### Requirement: Compatibility with agent-context-template surface separation

The actor/surface model SHALL encompass the existing surface separation defined in `openspec/specs/agent-context-template/spec.md`. The agent-context-template spec's distinction between surface-neutral core profile schema and surface-specific adapters (e.g., Claude.md renderer) SHALL be recognized as a valid instance of the surface taxonomy defined here. No change to the agent-context-template spec is required in this proposal. Future term unification between the two specs is deferred to a separate proposal.

#### Scenario: Agent-context-template surface adapters conform to the surface taxonomy

- **WHEN** an agent-context-template surface adapter renders context for a specific surface
- **THEN** the adapter SHALL be classified as a surface-layer construct under this model
- **AND** the core profile schema SHALL remain surface-neutral as required by both this spec and the agent-context-template spec
