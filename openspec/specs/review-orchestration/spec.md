# review-orchestration Specification

## Purpose

Describe the Codex-backed proposal, design, and apply review orchestration used
by the current `specflow` runtime.
## Requirements
### Requirement: Proposal challenge uses a single-pass challenge agent

`specflow-challenge-proposal` SHALL read `proposal.md` and identify ambiguous or
underspecified points as clarification questions for the author. The proposal
phase does NOT use a review ledger or multi-round review loop.

#### Scenario: Challenge returns clarification questions

- **WHEN** `specflow-challenge-proposal challenge <CHANGE_ID>` succeeds
- **THEN** it SHALL return a `challenges` array with questions for the author
- **AND** it SHALL return a `summary` assessing proposal readiness for design

#### Scenario: Challenge returns empty when proposal is clear

- **WHEN** the proposal has no ambiguous or underspecified points
- **THEN** the `challenges` array SHALL be empty
- **AND** the flow SHALL proceed directly to `proposal_reclarify` then `spec_draft`

#### Scenario: Challenge parse errors are reported gracefully

- **WHEN** agent output cannot be parsed as challenge JSON
- **THEN** the CLI SHALL report `parse_error: true`
- **AND** the flow SHALL still proceed to reclarify (the user can address issues manually)

### Requirement: Design review operates on change artifacts and a design ledger

`specflow-review-design` SHALL review `proposal.md`, `design.md`, `tasks.md`,
and any change-local `spec.md` files, and SHALL persist its state in
`review-ledger-design.json`.

#### Scenario: Design review requires generated design artifacts

- **WHEN** `design.md` or `tasks.md` is missing from the change directory
- **THEN** `specflow-review-design` SHALL return `missing_artifacts`

#### Scenario: Design re-review updates matched finding severity

- **WHEN** a re-review marks an existing finding as still open with a different
  severity
- **THEN** the stored finding SHALL keep its id and update its severity

#### Scenario: Design review supports an autofix loop

- **WHEN** `specflow-review-design autofix-loop <CHANGE_ID>` is invoked
- **THEN** the CLI SHALL iterate review rounds until the loop resolves the
  actionable findings, reaches `max_rounds_reached`, or detects `no_progress`

### Requirement: Apply review operates on filtered git diffs and an implementation ledger
`specflow-review-apply` SHALL obtain the implementation diff via the injected
`WorkspaceContext.filteredDiff()` method instead of calling `specflow-filter-diff`
directly, and SHALL persist implementation review state in `review-ledger.json`.

#### Scenario: Apply review filters the diff via WorkspaceContext
- **WHEN** `specflow-review-apply review <CHANGE_ID>` runs
- **THEN** it SHALL call `WorkspaceContext.filteredDiff()` with appropriate exclude globs
- **AND** it SHALL pass the filtered diff and `proposal.md` content into the review prompt

#### Scenario: Apply review handles empty diff from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns `summary: "empty"`
- **THEN** it SHALL skip the review and report that no reviewable changes were found

#### Scenario: Apply review warns on large diffs from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns a `DiffSummary` with `total_lines` exceeding the configured threshold
- **THEN** it SHALL set the `diff_warning` flag and follow the existing warning flow

### Requirement: Review configuration is read from `openspec/config.yaml` with stable defaults

The review runtime SHALL read review configuration from `openspec/config.yaml`
and SHALL fall back to built-in defaults when the keys are absent or invalid.

#### Scenario: Missing config uses defaults

- **WHEN** review configuration cannot be read from `openspec/config.yaml`
- **THEN** the runtime SHALL use `diff_warn_threshold = 1000` and
  `max_autofix_rounds = 4`

#### Scenario: Invalid max-autofix values fall back to the default

- **WHEN** `max_autofix_rounds` is not an integer in the range `1..10`
- **THEN** the runtime SHALL use `4`

### Requirement: Current-phase summaries reflect the latest review ledger state

Review runtimes SHALL render `current-phase.md` from the latest ledger snapshot
and SHALL recommend the next slash command for the current review outcome.
Downstream consumers SHALL derive binding versus advisory review approval from
persisted round-summary metadata rather than inferring it from reviewer actor
kind alone or from external runtime-only delegation context.

#### Scenario: Proposal challenge does not use a review ledger

- **WHEN** the proposal phase completes via the challenge-reclarify flow
- **THEN** no `review-ledger-proposal.json` SHALL be created
- **AND** no `current-phase.md` SHALL be written for the proposal phase

#### Scenario: Design and apply ledgers recommend the next phase-specific action

- **WHEN** design or apply review updates `current-phase.md`
- **THEN** the file SHALL include the ledger round, status, actionable finding
  count, and the next recommended slash command for that phase

#### Scenario: Current-phase rendering uses persisted approval binding metadata

- **WHEN** `current-phase.md` is rendered from the latest review ledger snapshot
- **AND** the latest round summary records `approval_binding: "advisory"`
- **THEN** the file SHALL render a non-approved handoff state
- **AND** it SHALL recommend the phase-appropriate revise action rather than
  the next approved-phase command

### Requirement: Review handoff distinguishes actor kinds in review decisions

Review orchestration SHALL recognize the actor kind of the reviewer when
processing review outcomes. Review outcomes SHALL remain review-phase decisions
that are distinct from workflow `approve` and `reject` operations. The mapping
from review outcome to workflow transition SHALL account for whether the
reviewer is `human`, `ai-agent`, or `automation`. `automation` actors SHALL NOT
issue review outcomes and SHALL NOT participate in review phases.

Whenever this requirement refers to "no unresolved high findings", the gate SHALL be evaluated as `unresolvedCriticalHighCount(ledger) == 0` — i.e., the gate covers both `critical` and `high` severities, and ignores `medium` and `low` severities. MEDIUM and LOW findings SHALL NOT block the binding-approval handoff; they remain visible via `handoff.severity_summary` and Remaining Risks aggregation.

#### Scenario: Human reviewer approval is binding

- **WHEN** a `human` reviewer issues `review_approved`
- **THEN** the review orchestration SHALL treat the outcome as a binding review
  approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return
  `handoff.state = "review_approved"` (or `"review_no_findings"` for the
  apply / design review handoff payload, per the severity-aware gate
  requirement)

#### Scenario: Undelegated AI-agent reviewer approval is advisory only

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** no delegation exists for the current run
- **THEN** the review orchestration SHALL record the outcome as an advisory recommendation
- **AND** it SHALL NOT return `handoff.state = "review_approved"` based on
  this outcome alone
- **AND** the workflow SHALL NOT advance to the next gated phase based on this
  outcome alone

#### Scenario: Delegated AI-agent reviewer approval is binding

- **WHEN** an `ai-agent` reviewer issues `review_approved`
- **AND** delegation is active for the current run
- **THEN** the review orchestration SHALL treat the outcome as a binding review
  approval
- **AND** if `unresolvedCriticalHighCount(ledger) == 0` it SHALL return
  `handoff.state = "review_approved"` (or `"review_no_findings"` for the
  apply / design review handoff payload, per the severity-aware gate
  requirement)
- **AND** unresolved findings whose `severity ∈ {medium, low}` SHALL NOT
  prevent this binding handoff

#### Scenario: Request-changes outcome requires a phase revision

- **WHEN** a `human` reviewer or an `ai-agent` reviewer issues
  `request_changes`
- **THEN** the review orchestration SHALL return a non-approved handoff for the
  current phase
- **AND** the handoff SHALL require the phase-appropriate revise transition
  (`revise_design` or `revise_apply`) before the next
  review round
- **AND** delegation SHALL NOT change this mapping because `request_changes` is
  a review-phase outcome, not a gated workflow approval

#### Scenario: AI-agent block is overridable in the ledger

- **WHEN** an `ai-agent` reviewer issues `block`
- **THEN** a `human` actor SHALL be able to override the finding status in the review ledger
- **AND** the override SHALL be recorded with the overriding actor's identity

#### Scenario: Human reviewer block is non-overridable

- **WHEN** a `human` reviewer issues `block`
- **THEN** no actor SHALL override the block
- **AND** the review orchestration SHALL reject any attempt to change the status of a human-issued block finding

#### Scenario: Automation cannot issue review outcomes

- **WHEN** an `automation` actor attempts to issue a review outcome (`review_approved`, `request_changes`, or `block`)
- **THEN** the review orchestration SHALL reject the operation
- **AND** automation actors SHALL NOT participate in review phases

#### Scenario: Automation evidence is advisory only

- **WHEN** an automation source emits CI, webhook, or batch evidence during a
  review phase
- **THEN** the review orchestration MAY surface or persist that evidence for a
  reviewer
- **AND** it SHALL NOT treat the automation source as the reviewer or as a
  review outcome

### Requirement: Review ledger records reviewer actor and binding provenance

Review ledger entries SHALL include enough reviewer provenance to reconstruct
from the latest ledger snapshot alone whether a review approval was binding or
advisory. Each round summary SHALL include the reviewer's actor kind and
identity, whether delegation was active for that round, and whether any
recorded approval was `binding`, `advisory`, or `not_applicable`. This metadata
SHALL be sufficient for downstream consumers, including `current-phase.md`
rendering, to determine approved versus non-approved handoff without replaying
external runtime context.

#### Scenario: Ledger findings include reviewer actor kind and identity

- **WHEN** a review round completes and findings are appended to the ledger
- **THEN** each round summary SHALL include a `reviewer_actor` field identifying the actor kind and a `reviewer_actor_id` field identifying the specific reviewer

#### Scenario: Round summaries persist approval binding state

- **WHEN** a review round completes
- **THEN** the round summary SHALL include an `approval_binding` field with
  value `binding`, `advisory`, or `not_applicable`
- **AND** it SHALL include a `delegation_active` field indicating whether
  approval delegation was active for that round

#### Scenario: Non-approval review outcomes serialize binding as not applicable

- **WHEN** a review round completes with decision `request_changes` or `block`
- **THEN** the round summary SHALL include `approval_binding: "not_applicable"`
- **AND** it SHALL still include `delegation_active` so the ledger snapshot is
  self-contained for that round

#### Scenario: Undelegated AI approval is serialized as advisory

- **WHEN** an undelegated `ai-agent` reviewer issues `review_approved`
- **THEN** the round summary SHALL include `reviewer_actor: "ai-agent"` and
  `reviewer_actor_id`
- **AND** it SHALL include `approval_binding: "advisory"`
- **AND** it SHALL include `delegation_active: false`

#### Scenario: Delegated AI approval is serialized as binding with delegation provenance

- **WHEN** a delegated `ai-agent` reviewer issues `review_approved`
- **THEN** the round summary SHALL include `reviewer_actor: "ai-agent"` and
  `reviewer_actor_id`
- **AND** it SHALL include `approval_binding: "binding"`
- **AND** it SHALL include `delegation_active: true`
- **AND** it SHALL include `delegated_by: "human"` and `delegated_by_id`
  identifying the delegating human actor

#### Scenario: Human approval is serialized as binding without delegation

- **WHEN** a `human` reviewer issues `review_approved`
- **THEN** the round summary SHALL include `approval_binding: "binding"`
- **AND** it SHALL include `delegation_active: false`

#### Scenario: Latest ledger snapshot distinguishes advisory and binding approvals

- **WHEN** a consumer reads the latest review ledger snapshot without replaying
  runtime context
- **THEN** it SHALL be able to distinguish an advisory undelegated AI approval
- **AND** it SHALL be able to distinguish a binding delegated AI approval using
  `approval_binding` and `delegation_active`

#### Scenario: Manual finding overrides record the overriding actor identity

- **WHEN** a finding's status is manually changed to `accepted_risk` or `ignored`
- **THEN** the finding SHALL include an `overridden_by` field identifying the actor kind and `overridden_by_id` identifying the specific actor that performed the override

### Requirement: Review agents SHALL NOT share sessions with main agents

Review agents SHALL continue to run in a fresh process per invocation and SHALL
NOT use `AgentSessionManager`. Main-agent invocations in server-mode move to the
`agent-session-manager` contract; review invocations remain on the existing
per-call process model to preserve independent judgment.

#### Scenario: Review agent spawns a new process per invocation

- **WHEN** a review phase (design review or apply review) invokes the review agent
- **THEN** the runtime SHALL spawn a fresh agent process via the existing
  `callReviewAgent()` path
- **AND** it SHALL NOT call `AgentSessionManager.create` or
  `AgentSessionManager.send`

#### Scenario: Review agent does not inherit main-agent session context

- **WHEN** a review agent runs after a main-agent session has accumulated context
  for the same change
- **THEN** the review agent SHALL have no access to the main-agent session's
  prior messages or reasoning
- **AND** it SHALL evaluate artifacts independently

### Requirement: Design review SHALL include task-plannable quality gate

Design review SHALL verify that `design.md` contains the mandatory planning sections defined by `design-planning-contract`. The quality gate SHALL perform structural validation only (heading existence and non-empty content). Content quality assessment SHALL remain the responsibility of the review agent's existing evaluation logic.

When the structural validation fails, the review agent SHALL report missing or empty planning sections as findings with severity `high` and category `task-plannable`. The existing design review flow (request_changes → author fix → re-review) SHALL handle remediation; no new review phase or remediation path is introduced.

#### Scenario: Design with all planning sections passes task-plannable gate

- **WHEN** design review runs on a `design.md` that contains all 7 mandatory planning section headings with non-empty content
- **THEN** the task-plannable quality gate SHALL pass
- **AND** no `task-plannable` category findings SHALL be added

#### Scenario: Design missing planning sections triggers request_changes

- **WHEN** design review runs on a `design.md` that is missing one or more mandatory planning section headings or has empty planning sections
- **THEN** the review agent SHALL add a `high` severity finding for each missing or empty section with category `task-plannable`
- **AND** the review outcome SHALL be `request_changes` (unless other critical findings also exist)

#### Scenario: Task-plannable gate uses existing remediation flow

- **WHEN** design review returns `request_changes` due to task-plannable findings
- **THEN** the author SHALL fix the design via the existing `revise_design` transition
- **AND** the next review round SHALL re-evaluate the task-plannable gate

#### Scenario: Task-plannable gate is skipped for pre-existing designs

- **WHEN** design review runs on a change where `design.md` existed before the `design-planning-contract` was deployed
- **THEN** the task-plannable quality gate SHALL be skipped
- **AND** no `task-plannable` category findings SHALL be generated

### Requirement: Review handoff state SHALL be derived from HIGH+ unresolved finding count

Apply and design review orchestrators SHALL derive the `handoff.state` value strictly from the count of unresolved findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`. The reviewer's free-form `decision` string and findings of severity `medium` or `low` SHALL NOT be used as gate inputs for the `handoff.state` field. The total unresolved-finding count (`actionable_count`) SHALL still be reported in the handoff payload for downstream consumers (e.g., approval-summary Remaining Risks aggregation).

This requirement defines the canonical mapping:

- `unresolvedCriticalHighCount(ledger) == 0` → `handoff.state = "review_no_findings"` (after a single review round) or `"loop_no_findings"` (after an autofix loop).
- `unresolvedCriticalHighCount(ledger) > 0` → `handoff.state = "review_with_findings"` (after a single review round) or `"loop_with_findings"` (after an autofix loop).

The literal state names (`review_no_findings`, `review_with_findings`, `loop_no_findings`, `loop_with_findings`) SHALL remain stable for backward compatibility; only the gate semantics change.

#### Scenario: Apply review with only LOW findings reports no_findings

- **WHEN** `specflow-review-apply review <CHANGE_ID>` finishes a review round
- **AND** the resulting ledger contains zero findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **AND** the resulting ledger contains one or more findings whose `severity == "low"` and whose `status ∈ {new, open}`
- **THEN** `handoff.state` SHALL equal `"review_no_findings"`
- **AND** `handoff.actionable_count` SHALL equal the total unresolved finding count (LOW included)
- **AND** `handoff.severity_summary` SHALL include the LOW count so downstream UI can display Remaining Risks

#### Scenario: Apply review with HIGH unresolved reports with_findings

- **WHEN** `specflow-review-apply review <CHANGE_ID>` finishes a review round
- **AND** the resulting ledger contains one or more findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **THEN** `handoff.state` SHALL equal `"review_with_findings"`
- **AND** `handoff.actionable_count` SHALL include those HIGH+ findings

#### Scenario: Apply autofix loop applies the same severity-aware gate

- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID>` finishes
- **THEN** `handoff.state` SHALL equal `"loop_no_findings"` if `unresolvedCriticalHighCount(ledger) == 0`
- **AND** `handoff.state` SHALL equal `"loop_with_findings"` otherwise
- **AND** the gate SHALL NOT consider MEDIUM or LOW findings

#### Scenario: Design review applies the same severity-aware gate as apply review

- **WHEN** `specflow-review-design review <CHANGE_ID>` finishes a review round
- **THEN** `handoff.state` SHALL be derived from `unresolvedCriticalHighCount` against the design ledger using the same mapping defined above
- **AND** the design autofix loop SHALL apply the same gate

#### Scenario: Reviewer decision string does not gate handoff state

- **WHEN** the review agent returns a `decision` string of `"approve"` while the ledger still contains a HIGH-severity open finding
- **THEN** `handoff.state` SHALL equal `"review_with_findings"` (gate is severity-driven, not decision-driven)
- **AND** the `decision` string MAY still be displayed in the review UI for context

### Requirement: Severity-aware gate SHALL be exposed via a single helper

The review runtime SHALL expose a single ledger helper, `unresolvedCriticalHighCount(ledger: ReviewLedger): number`, that returns the count of findings whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`. All apply / design review orchestrators, current-phase rendering, and tests SHALL use this helper as the single source of truth for the severity-aware gate. The legacy helper that counted only `severity == "high"` SHALL be removed; no caller may bypass `unresolvedCriticalHighCount` by hand-rolling the predicate.

#### Scenario: All gate sites call unresolvedCriticalHighCount

- **WHEN** the apply review orchestrator, design review orchestrator, or current-phase renderer computes `handoff.state` or "Next Recommended Action"
- **THEN** the implementation SHALL call `unresolvedCriticalHighCount(ledger)` rather than re-implementing the predicate inline
- **AND** no production code path SHALL retain a HIGH-only severity check for gating

#### Scenario: Helper aggregates critical and high in one number

- **WHEN** `unresolvedCriticalHighCount` is invoked on a ledger with a `critical` open finding and a `high` open finding
- **THEN** the helper SHALL return `2`

