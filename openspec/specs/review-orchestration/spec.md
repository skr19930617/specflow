# review-orchestration Specification

## Purpose

Describe the Codex-backed proposal, design, and apply review orchestration used
by the current `specflow` runtime.
## Requirements
### Requirement: Proposal review uses proposal artifacts and a dedicated proposal ledger

`specflow-review-proposal` SHALL review `proposal.md` and SHALL persist proposal
review state in `review-ledger-proposal.json`.

#### Scenario: Initial proposal review creates ledger and current-phase output

- **WHEN** `specflow-review-proposal review <CHANGE_ID>` succeeds
- **THEN** it SHALL create or update
  `openspec/changes/<CHANGE_ID>/review-ledger-proposal.json`
- **AND** it SHALL update `openspec/changes/<CHANGE_ID>/current-phase.md`

#### Scenario: Proposal re-review classifies still-open and new findings

- **WHEN** `specflow-review-proposal fix-review <CHANGE_ID>` returns
  rereview-classification data
- **THEN** the ledger SHALL preserve matched findings by id
- **AND** it SHALL record newly introduced findings for the new round

#### Scenario: Proposal review uses the configured round cap

- **WHEN** proposal review remains blocked through `max_autofix_rounds`
- **THEN** the runtime SHALL stop with `handoff.state = "max_rounds_reached"`
- **AND** it SHALL not increment the proposal review round past the configured cap

#### Scenario: Proposal review uses decision-first gating with a high-severity backstop

- **WHEN** the review decision is `APPROVE` and no unresolved `high` findings remain
- **AND** the approval is binding for the reviewer actor under the actor-aware review handoff rules
- **THEN** the runtime SHALL return `handoff.state = "review_approved"`
- **AND** non-blocking findings MAY remain advisory only

#### Scenario: Proposal review does not treat advisory approvals as approved handoff

- **WHEN** the review decision is `APPROVE` and no unresolved `high` findings remain
- **AND** the approval is advisory only for the reviewer actor under the actor-aware review handoff rules
- **THEN** the runtime SHALL NOT return `handoff.state = "review_approved"`
- **AND** it SHALL report a non-approved handoff state

#### Scenario: Proposal review blocks approval when unresolved high findings remain

- **WHEN** the review decision is `APPROVE` but unresolved `high` findings remain
- **THEN** the runtime SHALL keep the proposal blocked in place
- **AND** it SHALL report a non-approved handoff state

#### Scenario: Proposal review detects no-progress after repeated stagnant re-reviews

- **WHEN** proposal re-review is stagnant for two consecutive rounds
- **THEN** the runtime SHALL stop with `handoff.state = "no_progress"`
- **AND** it SHALL not append an additional proposal review round

#### Scenario: Proposal parse errors do not mutate the ledger

- **WHEN** Codex output cannot be parsed as review JSON
- **THEN** the CLI SHALL report `parse_error: true`
- **AND** it SHALL not create a proposal ledger file

#### Scenario: Corrupt proposal ledgers request manual recovery

- **WHEN** `review-ledger-proposal.json` is corrupt and no backup is usable
- **THEN** the CLI SHALL rename the corrupt file with a `.corrupt` suffix
- **AND** it SHALL return `ledger_recovery: "prompt_user"`

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
  actionable findings, reaches the configured round cap, or detects no progress

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

#### Scenario: Proposal review with no actionable findings recommends specflow continuation

- **WHEN** the proposal ledger has zero actionable findings
- **THEN** `current-phase.md` SHALL recommend `/specflow`

#### Scenario: Proposal re-review with findings recommends proposal work

- **WHEN** the proposal ledger still has actionable findings after re-review
- **THEN** `current-phase.md` SHALL recommend `/specflow`

#### Scenario: Proposal current-phase output includes cap and stop metadata

- **WHEN** proposal review updates `current-phase.md`
- **THEN** the file SHALL include the current round, configured round cap,
  latest decision, gate-blocking finding count, and any explicit stop reason

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

#### Scenario: Human reviewer approval is binding

- **WHEN** a `human` reviewer issues `review_approved`
- **THEN** the review orchestration SHALL treat the outcome as a binding review
  approval
- **AND** if no unresolved `high` findings remain it SHALL return
  `handoff.state = "review_approved"`

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
- **AND** if no unresolved `high` findings remain it SHALL return
  `handoff.state = "review_approved"`

#### Scenario: Request-changes outcome requires a phase revision

- **WHEN** a `human` reviewer or an `ai-agent` reviewer issues
  `request_changes`
- **THEN** the review orchestration SHALL return a non-approved handoff for the
  current phase
- **AND** the handoff SHALL require the phase-appropriate revise transition
  (`revise_proposal`, `revise_design`, or `revise_apply`) before the next
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

