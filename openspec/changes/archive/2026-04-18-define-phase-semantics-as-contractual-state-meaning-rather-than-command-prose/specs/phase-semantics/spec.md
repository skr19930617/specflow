## ADDED Requirements

### Requirement: phase-semantics is the meaning authority for workflow phases

The system SHALL treat the `phase-semantics` capability as the spec-level
authority for what every workflow phase **means**. Any consumer — server-side
runtime, alternate UI, local reference implementation, or slash command — that
needs to reason about a phase's purpose, inputs, outputs, completion, branching,
or delegation SHALL be able to do so from `phase-semantics` alone, without
reading `/specflow.*` command prose, `assets/commands/*.md.tmpl` templates, or
any adapter-private source. Other capabilities (notably `phase-contract-types`
and `phase-contract-structure`) describe encodings or structural expressions
of this meaning; they are not themselves the meaning authority.

#### Scenario: A consumer derives phase meaning without command prose

- **WHEN** a server runtime, UI, or other consumer reads the `phase-semantics`
  definition for a phase
- **THEN** it SHALL obtain a complete description of that phase's identity,
  required inputs, expected outputs, completion condition, branching / gate
  condition, and delegation boundary
- **AND** it SHALL NOT need to inspect slash command templates or any
  adapter-private source to answer those questions

#### Scenario: Disagreement between phase-semantics and other artifacts is resolved in favour of phase-semantics

- **WHEN** `phase-semantics` and an existing artifact (slash command prose,
  structured phase-contract data, UI copy) describe the same phase but
  disagree on any of the six mandatory roles
- **THEN** the description in `phase-semantics` SHALL be considered
  authoritative
- **AND** the disagreeing artifact SHALL be corrected in the same change that
  introduces or revises the `phase-semantics` definition, or the divergence
  SHALL be recorded in the owning change's `design.md` under `## Accepted
  Spec Conflicts` with a documented rationale and follow-up reference

### Requirement: Every phase SHALL carry all six mandatory semantic roles

Every per-phase definition in `phase-semantics` SHALL include all six of the
following roles. No role is optional; for phases where a role's value is the
empty set or a defined terminal sentinel, the role SHALL still be declared
explicitly rather than omitted.

1. **phase identity** — the stable phase name as it appears in the canonical
   workflow state machine.
2. **required inputs** — the set of artifacts and run-state references
   consumed by the phase before work begins. Expressed using vocabulary from
   existing capabilities (`artifact-ownership-model`, `canonical-workflow-state`,
   etc.).
3. **expected outputs** — the set of artifacts and run-state references
   produced by the phase before it may complete.
4. **completion condition** — the observable condition that makes the phase
   considered done, stated in terms of the artifacts, events, or gate
   outcomes defined by existing capabilities.
5. **branching / gate condition** — the fully enumerated set of allowed next
   phases and/or terminal reasons reachable from this phase, plus the
   condition that selects among them.
6. **delegation boundary** — a phase-level classification drawn from the set
   `agent-delegated`, `deterministic`, or `mixed`. For `mixed`, the
   definition SHALL additionally enumerate which outputs or decisions are
   agent-delegated.

#### Scenario: All six roles are present in every definition

- **WHEN** a per-phase definition in `phase-semantics` is inspected for any
  phase — non-terminal or terminal
- **THEN** it SHALL express each of the six mandatory roles explicitly

#### Scenario: Absent values use defined empty or sentinel forms

- **WHEN** a phase's role has no content (e.g., a phase consumes no inputs,
  or a terminal phase has no next phase)
- **THEN** the role SHALL use a defined empty set or the terminal sentinel
  rather than being omitted
- **AND** the sentinel / empty-set form SHALL be the same across all phases
  that share the condition

### Requirement: The phase set is drawn from canonical-workflow-state

The set of phases covered by `phase-semantics` SHALL equal the set of phase
names carried by the "current phase" canonical role defined in
`canonical-workflow-state`. `phase-semantics` SHALL NOT define semantics for
a name that is not a valid phase under that role, and every such phase name
SHALL have a corresponding per-phase definition.

#### Scenario: Every canonical phase has a semantic definition

- **WHEN** the set of phase names representable by the "current phase"
  canonical role is enumerated
- **THEN** every name in that set SHALL have exactly one per-phase definition
  in `phase-semantics`

#### Scenario: No orphan semantic definitions

- **WHEN** the phases defined in `phase-semantics` are compared to the
  canonical phase set
- **THEN** no per-phase definition SHALL exist for a name that is not a
  valid canonical phase
- **AND** adding or removing a phase from `phase-semantics` SHALL be possible
  only as a consequence of a `canonical-workflow-state` change to the phase
  set

### Requirement: Branching SHALL be fully enumerated for every phase, including terminal phases

The branching / gate condition role for every phase SHALL enumerate the full
set of reachable outcomes. Non-gated phases SHALL list their deterministic
or gate-like successors. Gated phases SHALL list every allowed outcome,
along with the event, user decision, or condition that selects it.
Terminal phases SHALL use the terminal sentinel `no transition / terminal`
as their branching value, paired with the defined `terminal_reason` for that
phase.

The `reject` event, transitioning to the terminal `rejected` phase, SHALL
be treated as a **universal transition** that is implicitly available from
every non-terminal phase. Per-phase scenarios MAY either enumerate the
reject outcome explicitly or omit it; when omitted, the reader SHALL
understand that `reject → rejected` remains a valid outcome for that phase.
This universal rule SHALL NOT extend to any event other than `reject`.

#### Scenario: Gated phase enumerates all outcomes

- **WHEN** a gated phase's branching role is inspected
- **THEN** it SHALL list every allowed outcome the gate can produce, paired
  with the event or decision label that selects that outcome

#### Scenario: Non-gated phase enumerates its non-universal successors

- **WHEN** a non-gated, non-terminal phase's branching role is inspected
- **THEN** it SHALL list every non-universal successor phase, paired with
  the event name that triggers each transition
- **AND** the universal `reject → rejected` transition MAY be listed or
  omitted per the universal-rejection rule

#### Scenario: Universal reject transition is available from every non-terminal phase

- **WHEN** the branching of any non-terminal phase is inspected
- **THEN** the phase SHALL accept the `reject` event as a transition to
  the terminal `rejected` phase regardless of whether that outcome is
  enumerated in the per-phase branching description

#### Scenario: Terminal phase uses the terminal sentinel

- **WHEN** a terminal phase's branching role is inspected
- **THEN** its value SHALL be the sentinel `no transition / terminal`
- **AND** it SHALL cite the `terminal_reason` defined for that phase

### Requirement: Delegation boundary is classified at the phase level

The delegation boundary role SHALL classify each phase using the closed set
`agent-delegated`, `deterministic`, or `mixed`. For `mixed` phases, the
definition SHALL enumerate the individual outputs or decisions that are
agent-delegated; for `agent-delegated` and `deterministic` phases, no
per-step enumeration is required. For purposes of this role:

- an output or decision is **agent-delegated** iff it is produced by an
  actor whose provenance is a main agent, review agent, or other AI/human
  actor authorized to drive the run (per `actor-surface-model`);
- an output is **deterministic** iff it is produced by a canonical CLI
  operation or deterministic transformation independent of agent judgement.

#### Scenario: Phase-level classification is one of the three values

- **WHEN** a per-phase definition's delegation boundary is inspected
- **THEN** its value SHALL be exactly one of `agent-delegated`,
  `deterministic`, or `mixed`

#### Scenario: Mixed phases enumerate delegated outputs

- **WHEN** a phase is classified as `mixed`
- **THEN** its definition SHALL list each output or decision that is
  agent-delegated, using vocabulary from `artifact-ownership-model` and
  `surface-event-contract`

### Requirement: Vocabulary is constrained to existing capabilities

Every artifact path, run-state reference, event name, gate-condition label, or completion-condition term cited inside a `phase-semantics` definition SHALL be a term already defined by an existing specflow capability (such as `canonical-workflow-state`, `artifact-ownership-model`, `surface-event-contract`, `workflow-run-state`, `review-orchestration`, or `actor-surface-model`). `phase-semantics` SHALL NOT introduce new semantic labels of its own. When a needed label is missing, the owning capability SHALL be extended first (in a separate change) before `phase-semantics` references it.

#### Scenario: Referenced terms resolve to existing capabilities

- **WHEN** an artifact, event, or run-state term is cited in a per-phase
  definition
- **THEN** the term SHALL be defined (by name, path, or role) in at least
  one existing specflow capability

#### Scenario: New labels require upstream capability changes

- **WHEN** a proposed update to `phase-semantics` requires a term not
  defined by any existing capability
- **THEN** `phase-semantics` SHALL NOT introduce the term itself
- **AND** the owning capability SHALL be updated in a separate change to
  define the term before `phase-semantics` references it

### Requirement: phase-semantics is runtime-agnostic and does not prescribe encoding

`phase-semantics` SHALL describe the contract surface of phase meaning only.
It SHALL NOT prescribe TypeScript interface shapes, Markdown rendering
formats, JSON schemas, storage layouts, or gate-evaluation algorithms. Such
concerns SHALL be owned by other capabilities (e.g., `phase-contract-types`
for in-memory type encoding, `phase-contract-structure` for
descriptor-level structural types) that conform to `phase-semantics`.

#### Scenario: phase-semantics does not dictate TypeScript field names

- **WHEN** the `phase-semantics` spec is read
- **THEN** it SHALL describe roles by semantic purpose (identity, required
  inputs, etc.) without fixing specific TypeScript field names or
  Markdown headings

#### Scenario: Multiple conforming encodings are permitted

- **WHEN** two independent runtimes encode `phase-semantics` (e.g., a local
  TypeScript registry and a server-side JSON document)
- **THEN** both SHALL be admissible provided each expresses all six roles
  for every canonical phase with values consistent with
  `phase-semantics`

### Requirement: Per-phase semantic definitions

`phase-semantics` SHALL provide a per-phase definition for every phase in
the canonical workflow state machine. Each definition SHALL use the six
mandatory roles defined above, drawing vocabulary from existing
capabilities. The following scenarios fix the per-phase values for each
canonical phase.

Each scenario specifies the six roles for a single phase in the form:

- **inputs:** required inputs
- **outputs:** expected outputs
- **completion:** completion condition
- **branching:** enumerated outcomes
- **delegation:** phase-level classification

#### Scenario: start

- **WHEN** the `start` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `start`
  - **inputs:** empty (no artifacts required)
  - **outputs:** empty (no artifacts produced)
  - **completion:** one of `propose`, `explore_start`, or
    `spec_bootstrap_start` is applied
  - **branching:** three successors — `proposal_draft` via `propose`,
    `explore` via `explore_start`, or `spec_bootstrap` via
    `spec_bootstrap_start`
  - **delegation:** `deterministic`

#### Scenario: proposal_draft

- **WHEN** the `proposal_draft` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `proposal_draft`
  - **inputs:** the normalized source metadata carried in the run's canonical
    source field
  - **outputs:** `openspec/changes/<CHANGE_ID>/proposal.md`
  - **completion:** the proposal document exists and describes WHY / WHAT /
    Capabilities / Impact consistent with the source
  - **branching:** two successors — `proposal_scope` via `check_scope`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: proposal_scope

- **WHEN** the `proposal_scope` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `proposal_scope`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md`
  - **outputs:** empty (scope decision recorded in run history only)
  - **completion:** the actor has chosen between single-proposal and
    decomposition
  - **branching:** three successors — `proposal_clarify` via
    `continue_proposal`, `decomposed` (terminal) via `decompose`, or
    `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (agent analyses scope, actor selects
    the branch — both are actor/agent outputs)

#### Scenario: proposal_clarify

- **WHEN** the `proposal_clarify` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `proposal_clarify`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md`
  - **outputs:** `openspec/changes/<CHANGE_ID>/proposal.md` (revised with
    integrated clarification answers)
  - **completion:** all clarification questions have been resolved and
    integrated into the proposal
  - **branching:** two successors — `proposal_challenge` via
    `challenge_proposal`, or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: proposal_challenge

- **WHEN** the `proposal_challenge` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `proposal_challenge`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md`
  - **outputs:** a challenge result set (challenge items with id, category,
    question, context) held in run state
  - **completion:** the challenge agent has produced a result set (including
    the empty-challenges case)
  - **branching:** two successors — `proposal_reclarify` via `reclarify`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: proposal_reclarify

- **WHEN** the `proposal_reclarify` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `proposal_reclarify`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md` plus the
    challenge result set produced by `proposal_challenge`
  - **outputs:** `openspec/changes/<CHANGE_ID>/proposal.md` (revised with
    answers to challenge items)
  - **completion:** every challenge item has been addressed and the proposal
    is accepted
  - **branching:** two successors — `spec_draft` via `accept_proposal`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (agent integrates answers, actor
    provides them — both are actor/agent outputs)

#### Scenario: spec_draft

- **WHEN** the `spec_draft` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `spec_draft`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md`
  - **outputs:** `openspec/changes/<CHANGE_ID>/specs/*/spec.md` (at least
    one spec delta file per capability listed in the proposal)
  - **completion:** every capability listed in the proposal's Capabilities
    section has a matching delta spec file
  - **branching:** three successors — `spec_validate` via `validate_spec`,
    `proposal_reclarify` via `reclarify` (when capabilities cannot be
    resolved), or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: spec_validate

- **WHEN** the `spec_validate` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `spec_validate`
  - **inputs:** `openspec/changes/<CHANGE_ID>/specs/*/spec.md`
  - **outputs:** empty (validation result recorded in run state only)
  - **completion:** `openspec validate` has been run and either reported no
    issues or reported issues that remain unresolved
  - **branching:** three successors — `spec_verify` via `spec_validated`
    (validation passed), `spec_draft` via `revise_spec` (validation
    failed), or `rejected` (terminal) via `reject`
  - **delegation:** `deterministic`

#### Scenario: spec_verify

- **WHEN** the `spec_verify` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `spec_verify`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md` and
    `openspec/changes/<CHANGE_ID>/specs/*/spec.md`; for every modified
    capability, the baseline `openspec/specs/<capability>/spec.md`
  - **outputs:** `openspec/changes/<CHANGE_ID>/design.md` if accepted
    conflicts are recorded; otherwise empty
  - **completion:** every baseline/delta pairing has been judged compatible
    or recorded as an accepted conflict with rationale
  - **branching:** three successors — `spec_ready` via `spec_verified`
    (all conflicts resolved), `spec_draft` via `revise_spec` (missing
    baseline, unparseable baseline, or unresolved conflict), or
    `rejected` (terminal) via `reject`
  - **delegation:** `mixed` (deterministic helper computes candidate
    conflicts; actor judges each candidate)

#### Scenario: spec_ready

- **WHEN** the `spec_ready` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `spec_ready`
  - **inputs:** `openspec/changes/<CHANGE_ID>/specs/*/spec.md`
  - **outputs:** empty (gate decision recorded in run history only)
  - **completion:** the gate decision has been applied
  - **branching:** two successors — `design_draft` via `accept_spec`, or
    `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (gate decision is the actor's)

#### Scenario: design_draft

- **WHEN** the `design_draft` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `design_draft`
  - **inputs:** `openspec/changes/<CHANGE_ID>/proposal.md` and
    `openspec/changes/<CHANGE_ID>/specs/*/spec.md`
  - **outputs:** `openspec/changes/<CHANGE_ID>/design.md` and
    `openspec/changes/<CHANGE_ID>/tasks.md`
  - **completion:** both artifacts exist and cover every delta spec
  - **branching:** two successors — `design_review` via `review_design`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: design_review

- **WHEN** the `design_review` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `design_review`
  - **inputs:** `openspec/changes/<CHANGE_ID>/design.md` and
    `openspec/changes/<CHANGE_ID>/tasks.md`
  - **outputs:** `openspec/changes/<CHANGE_ID>/review-ledger-design.json`
    (updated with review findings)
  - **completion:** the review orchestrator has produced a ledger entry and
    the actor has selected a gate outcome
  - **branching:** three successors — `design_ready` via
    `design_review_approved`, `design_draft` via `revise_design`, or
    `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (review agent produces findings,
    actor chooses outcome — both are actor/agent outputs)

#### Scenario: design_ready

- **WHEN** the `design_ready` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `design_ready`
  - **inputs:** `openspec/changes/<CHANGE_ID>/design.md` and
    `openspec/changes/<CHANGE_ID>/tasks.md`
  - **outputs:** empty (gate decision recorded in run history only)
  - **completion:** the gate decision has been applied
  - **branching:** two successors — `apply_draft` via `accept_design`, or
    `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (gate decision is the actor's)

#### Scenario: apply_draft

- **WHEN** the `apply_draft` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `apply_draft`
  - **inputs:** `openspec/changes/<CHANGE_ID>/design.md`,
    `openspec/changes/<CHANGE_ID>/tasks.md`, and
    `openspec/changes/<CHANGE_ID>/task-graph.json`
  - **outputs:** task-graph bundle state transitions recorded in run state
    (no new artifact required by this role)
  - **completion:** every bundle in the task graph has reached a terminal
    bundle status
  - **branching:** two successors — `apply_review` via `review_apply`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated`

#### Scenario: apply_review

- **WHEN** the `apply_review` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `apply_review`
  - **inputs:** the applied-implementation state produced by `apply_draft`,
    referenced by run state
  - **outputs:** `openspec/changes/<CHANGE_ID>/review-ledger.json`
  - **completion:** the review orchestrator has produced a ledger entry and
    the actor has selected a gate outcome
  - **branching:** three successors — `apply_ready` via
    `apply_review_approved`, `apply_draft` via `revise_apply`, or
    `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (review agent produces findings,
    actor chooses outcome — both are actor/agent outputs)

#### Scenario: apply_ready

- **WHEN** the `apply_ready` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `apply_ready`
  - **inputs:** `openspec/changes/<CHANGE_ID>/review-ledger.json`
  - **outputs:** `openspec/changes/<CHANGE_ID>/approval-summary.md`
  - **completion:** the approval summary exists and the gate decision has
    been applied
  - **branching:** two successors — `approved` (terminal) via `accept_apply`,
    or `rejected` (terminal) via `reject`
  - **delegation:** `agent-delegated` (agent generates summary, actor
    chooses outcome — both are actor/agent outputs)

#### Scenario: approved

- **WHEN** the `approved` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `approved`
  - **inputs:** empty
  - **outputs:** empty (archived artifacts persist but are not produced by
    this phase)
  - **completion:** the run's lifecycle status has reached terminal
  - **branching:** `no transition / terminal`, `terminal_reason =
    "Implementation approved and merged"`
  - **delegation:** `deterministic`

#### Scenario: decomposed

- **WHEN** the `decomposed` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `decomposed`
  - **inputs:** empty
  - **outputs:** empty (sub-issue references persist outside the run)
  - **completion:** the run's lifecycle status has reached terminal
  - **branching:** `no transition / terminal`, `terminal_reason = "Proposal
    decomposed into sub-issues"`
  - **delegation:** `deterministic`

#### Scenario: rejected

- **WHEN** the `rejected` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `rejected`
  - **inputs:** empty
  - **outputs:** empty
  - **completion:** the run's lifecycle status has reached terminal
  - **branching:** `no transition / terminal`, `terminal_reason = "Change
    rejected"`
  - **delegation:** `deterministic`

#### Scenario: explore

- **WHEN** the `explore` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `explore`
  - **inputs:** empty (conversational exploration without fixed artifacts)
  - **outputs:** an exploration summary or GitHub issue reference, recorded
    outside the run's canonical artifacts
  - **completion:** the actor has concluded the exploratory session
  - **branching:** exactly one successor — `start` via `explore_complete`
  - **delegation:** `agent-delegated`

#### Scenario: spec_bootstrap

- **WHEN** the `spec_bootstrap` phase definition is read
- **THEN** its roles SHALL be:
  - **identity:** `spec_bootstrap`
  - **inputs:** the project's source tree, referenced by run state
  - **outputs:** `openspec/specs/*/spec.md` (baseline specs generated in
    bulk)
  - **completion:** baseline specs have been produced for every identified
    capability
  - **branching:** exactly one successor — `start` via
    `spec_bootstrap_complete`
  - **delegation:** `agent-delegated`
