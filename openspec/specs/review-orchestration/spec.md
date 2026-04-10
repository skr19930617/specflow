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

`specflow-review-apply` SHALL review the current implementation diff and SHALL
persist implementation review state in `review-ledger.json`.

#### Scenario: Apply review filters the diff before calling Codex

- **WHEN** `specflow-review-apply review <CHANGE_ID>` runs
- **THEN** it SHALL call `specflow-filter-diff`
- **AND** it SHALL pass the filtered diff and `proposal.md` content into the
  review prompt

#### Scenario: Empty diffs return `no_changes`

- **WHEN** the filtered diff is empty
- **THEN** `specflow-review-apply` SHALL return `error: "no_changes"`

#### Scenario: Diff-threshold warnings short-circuit before Codex review

- **WHEN** the filtered diff line count exceeds `diff_warn_threshold`
- **THEN** the CLI SHALL return `status: "warning"` with
  `warning: "diff_threshold_exceeded"`

#### Scenario: Apply review supports an autofix loop

- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID>` is invoked
- **THEN** the CLI SHALL re-run fix-review rounds until the loop resolves the
  actionable findings, reaches the configured round cap, or detects no progress

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

#### Scenario: Proposal review with no actionable findings recommends design

- **WHEN** the proposal ledger has zero actionable findings
- **THEN** `current-phase.md` SHALL recommend `/specflow.design`

#### Scenario: Proposal re-review with findings recommends proposal work

- **WHEN** the proposal ledger still has actionable findings after re-review
- **THEN** `current-phase.md` SHALL recommend `/specflow`

#### Scenario: Design and apply ledgers recommend the next phase-specific action

- **WHEN** design or apply review updates `current-phase.md`
- **THEN** the file SHALL include the ledger round, status, actionable finding
  count, and the next recommended slash command for that phase
