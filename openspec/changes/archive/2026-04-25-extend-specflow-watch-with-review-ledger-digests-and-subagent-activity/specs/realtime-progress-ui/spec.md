## ADDED Requirements

### Requirement: Review section renders a ledger digest below snapshot progress

The Review section of the TUI SHALL render a **ledger digest layer** below the existing snapshot-based progress lines whenever a review-ledger file matching the active review family is available. The digest SHALL NOT replace the existing snapshot-derived progress view; both layers coexist.

Family-to-ledger mapping SHALL match the snapshot family rule already defined for the Review round section:

- `current_phase ∈ {design_draft, design_review, design_ready}` → read `openspec/changes/<run.change_name>/review-ledger-design.json`.
- `current_phase ∈ {apply_draft, apply_review, apply_ready, approved}` → read `openspec/changes/<run.change_name>/review-ledger.json`.
- Any other phase → no ledger digest is rendered for this run.

When a ledger is readable, the digest SHALL be built from the **latest `LedgerSnapshot`** only (no cross-round aggregation), and SHALL contain, in this order:

1. `Decision: <decision>` — the latest snapshot's decision verbatim (e.g. `approve_with_findings`). If the snapshot has no decision value, the renderer SHALL display `Decision: (none)`.
2. `Findings: <total> total | <open> open | <new> new | <resolved> resolved` — counts derived from the latest snapshot.
3. `Severity: HIGH <h> | MEDIUM <m> | LOW <l>` — computed **over open findings only** (`status ∈ {open, new}` in the latest snapshot). Resolved and overridden findings SHALL NOT contribute to this breakdown.
4. `Latest summary: <text>` — the latest round-summary text from the snapshot. If absent, the line SHALL be omitted.
5. `Open findings:` — a header line followed by up to three rows listing the top unresolved findings as `<SEVERITY>  <title>`. Exactly three findings SHALL be shown when at least three are open; fewer rows are shown when fewer open findings exist. The header line and its rows SHALL be omitted entirely when zero open findings exist.

Ranking of the open findings list SHALL be:

- Primary sort: severity, in the order `HIGH` > `MEDIUM` > `LOW`.
- Secondary sort (same severity): `latest_round` DESC — findings touched in the most recent round first.
- Tertiary sort (same severity and same `latest_round`): finding `id` ASC, interpreted as a stable string comparison.

The digest SHALL remain visible in the adjacent completed-family phases (`design_ready`, `apply_ready`, `approved`) consistent with the existing family-based review-section visibility rule.

#### Scenario: Digest renders under snapshot progress during apply_review

- **WHEN** `current_phase == "apply_review"`, an `autofix-progress-apply_review.json` snapshot exists, and `review-ledger.json` contains at least one `LedgerSnapshot`
- **THEN** the Review section SHALL render the existing snapshot progress lines unchanged
- **AND** below those lines it SHALL render a `Decision: …` line, a `Findings: … total | … open | … new | … resolved` line, a `Severity: HIGH … | MEDIUM … | LOW …` line, a `Latest summary: …` line, and an `Open findings:` block drawn from the **latest** `LedgerSnapshot`

#### Scenario: Severity breakdown only counts open findings

- **WHEN** the latest snapshot contains findings with mixed statuses (for example, 1 resolved HIGH, 2 open HIGH, 1 open MEDIUM, 1 overridden LOW)
- **THEN** the `Severity:` line SHALL display `HIGH 2 | MEDIUM 1 | LOW 0`
- **AND** resolved and overridden findings SHALL NOT contribute to the severity counts

#### Scenario: Open findings list ranks by severity then latest_round then id

- **WHEN** the latest snapshot contains five open findings with the following `(severity, latest_round, id)` tuples: `(MEDIUM, 4, R4-F01)`, `(HIGH, 2, R2-F03)`, `(HIGH, 3, R3-F01)`, `(LOW, 5, R5-F02)`, `(HIGH, 3, R3-F02)`
- **THEN** the `Open findings:` block SHALL render exactly three rows
- **AND** the rows SHALL be, in order: the `HIGH` at `latest_round=3, id=R3-F01`, the `HIGH` at `latest_round=3, id=R3-F02`, then the `HIGH` at `latest_round=2, id=R2-F03`
- **AND** the `MEDIUM` and `LOW` findings SHALL NOT appear in the block

#### Scenario: Digest remains visible on apply_ready after review completes

- **WHEN** `current_phase == "apply_ready"` and `review-ledger.json` contains a terminal `LedgerSnapshot`
- **THEN** the Review section SHALL render the digest below the completed snapshot progress view
- **AND** the digest SHALL reflect the latest `LedgerSnapshot`

#### Scenario: Digest is suppressed on non-review phases

- **WHEN** `current_phase` is `spec_draft`, `proposal_clarify`, or any other non-review-family phase
- **THEN** the Review section SHALL NOT read or render a ledger digest regardless of whether `review-ledger.json` or `review-ledger-design.json` exists on disk

#### Scenario: Latest round summary missing elides the line

- **WHEN** the latest snapshot has no round-summary text
- **THEN** the renderer SHALL omit the `Latest summary:` line entirely
- **AND** the other digest lines SHALL still render

### Requirement: Digest degrades compactly on narrow terminals

When the terminal width is less than 80 columns, the renderer SHALL **auto-collapse** the top-3 open-findings list (the `Open findings:` header and its rows) out of the digest, while still rendering the `Decision:`, `Findings:`, `Severity:`, and `Latest summary:` lines.

Under the same narrow-terminal condition, any single remaining digest line that would exceed the terminal width SHALL be truncated with a trailing ellipsis character `…` rather than wrapped across multiple terminal rows. The ellipsis SHALL be the final character of the truncated line; no further characters SHALL appear after it.

When the terminal width is 80 columns or wider, all digest lines SHALL render in full, and the `Open findings:` list SHALL render per the ranking rules defined above.

#### Scenario: Findings list collapses below 80 columns

- **WHEN** the terminal width is 79 columns and the latest snapshot has three open findings
- **THEN** the digest SHALL render the `Decision:`, `Findings:`, `Severity:`, and `Latest summary:` lines
- **AND** the `Open findings:` header and its three rows SHALL NOT render

#### Scenario: Non-findings digest lines truncate with ellipsis below 80 columns

- **WHEN** the terminal width is 60 columns and the `Latest summary:` line would be 120 characters at full width
- **THEN** the rendered `Latest summary:` line SHALL be truncated to at most 60 characters including a trailing `…`
- **AND** the truncation SHALL NOT produce a wrapped second row

#### Scenario: Wide terminals render the full digest

- **WHEN** the terminal width is 120 columns and the latest snapshot has five open findings
- **THEN** the digest SHALL render all lines in full
- **AND** the `Open findings:` block SHALL show exactly three rows ranked per the ranking rules

## MODIFIED Requirements

### Requirement: UI consumes only read-only local artifacts

The system SHALL consume the following artifact contracts in read-only mode and SHALL NOT write to any run artifact:

- the run-state JSON defined by `run-artifact-store-conformance`;
- the autofix progress snapshot defined by `review-autofix-progress-observability`;
- the observation events log defined by `workflow-observation-events`;
- the `task-graph.json` file at `openspec/changes/<run.change_name>/task-graph.json`;
- the review ledger JSON for the active review family, defined by `review-orchestration`, at one of `openspec/changes/<run.change_name>/review-ledger-design.json` or `openspec/changes/<run.change_name>/review-ledger.json` per the family rule.

The UI SHALL NOT watch or render content from `tasks.md`.

Multiple concurrent `specflow-watch` processes on the same run SHALL be safe (read-only, no lock contention).

#### Scenario: Watcher does not write to run artifacts

- **WHEN** `specflow-watch` is running against a run
- **THEN** no watched artifact file on disk SHALL be modified by the `specflow-watch` process
- **AND** `specflow-watch` SHALL NOT call any `specflow-run advance` or other mutating specflow subcommand

#### Scenario: task-graph path is derived from run.change_name

- **WHEN** `specflow-watch` resolves the tracked run
- **THEN** it SHALL locate the task-graph at `openspec/changes/<run.change_name>/task-graph.json`
- **AND** it SHALL NOT read or watch `tasks.md` for task progress

#### Scenario: Review ledger path is derived from run.change_name and active family

- **WHEN** `specflow-watch` resolves the tracked run and `current_phase` maps to the design review family
- **THEN** it SHALL locate the ledger at `openspec/changes/<run.change_name>/review-ledger-design.json`
- **AND WHEN** `current_phase` maps to the apply review family
- **THEN** it SHALL locate the ledger at `openspec/changes/<run.change_name>/review-ledger.json`
- **AND** neither ledger SHALL be written by the watcher process

#### Scenario: Multiple concurrent watchers coexist

- **WHEN** two or more `specflow-watch` processes are started against the same `run_id`
- **THEN** each process SHALL render independently without interfering with the others or with the run's producers

### Requirement: Graceful degradation per section

The UI SHALL degrade gracefully when a non-essential source is missing, unparseable, or not yet applicable. Run-state is the only mandatory source.

Specifically:

- If `task-graph.json` does not exist for the tracked run, the task-graph section SHALL display a placeholder such as "No task graph yet (generated in design phase)".
- If no active autofix snapshot exists, the review round section SHALL display a placeholder such as "No active review".
- If the observation events log has no entries for the tracked run, the recent events section SHALL display a placeholder such as "No events recorded".
- If the review-family ledger file is absent, the Review section's digest layer SHALL display the placeholder `No review digest yet` below the existing progress view; the snapshot-based progress view SHALL continue to render when a snapshot exists.
- If the review-family ledger file exists but is unreadable (I/O failure), the Review section's digest layer SHALL display the inline warning line `Review ledger unreadable: <reason>` with `<reason>` drawn from the reader status; the snapshot-based progress view and all other sections SHALL continue to render normally.
- If the review-family ledger file exists but is malformed (parse failure), the Review section's digest layer SHALL display an inline warning line identifying the source and the parse problem; the snapshot-based progress view and all other sections SHALL continue to render normally.
- If the review-family ledger file exists and is parseable but contains zero `LedgerSnapshot` entries, the digest layer SHALL display the same `No review digest yet` placeholder used for the absent-file case.
- If any other non-essential source is unparseable or malformed, the affected section SHALL display an inline warning, and the other sections SHALL continue to render.
- If the run-state for the resolved run cannot be read (missing or unparseable), the CLI SHALL exit with a non-zero status and a clear error message rather than render an incomplete TUI.

#### Scenario: Missing task-graph shows placeholder

- **WHEN** `openspec/changes/<run.change_name>/task-graph.json` does not exist at watcher start or at redraw time
- **THEN** the task-graph section SHALL display a placeholder indicating no task graph yet
- **AND** the other sections SHALL continue to render normally

#### Scenario: Missing autofix snapshot shows placeholder

- **WHEN** no autofix progress snapshot exists for the tracked run
- **THEN** the review round section SHALL display a placeholder indicating no active review
- **AND** the other sections SHALL continue to render normally

#### Scenario: Missing ledger shows digest placeholder

- **WHEN** the active review family maps to a ledger file that does not exist on disk
- **THEN** the Review section's digest layer SHALL display `No review digest yet` below the existing progress view
- **AND** the snapshot-based progress view SHALL continue to render when a snapshot exists
- **AND** all other sections SHALL render normally

#### Scenario: Unreadable ledger shows inline warning

- **WHEN** the active review family's ledger file exists but cannot be read (I/O failure, permission error)
- **THEN** the Review section's digest layer SHALL display `Review ledger unreadable: <reason>`
- **AND** the snapshot-based progress view SHALL continue to render when a snapshot exists
- **AND** all other sections SHALL render normally

#### Scenario: Malformed ledger shows inline warning

- **WHEN** the active review family's ledger file exists but cannot be parsed as JSON or does not conform to the ledger schema
- **THEN** the Review section's digest layer SHALL display an inline warning identifying the ledger source and the parse problem
- **AND** the snapshot-based progress view SHALL continue to render when a snapshot exists
- **AND** all other sections SHALL render normally

#### Scenario: Empty ledger shows digest placeholder

- **WHEN** the active review family's ledger file exists, is parseable, and contains zero `LedgerSnapshot` entries
- **THEN** the Review section's digest layer SHALL display `No review digest yet`
- **AND** no `Decision:` / `Findings:` / `Severity:` lines SHALL render

#### Scenario: Malformed source shows inline warning

- **WHEN** one of the watched source files exists but cannot be parsed
- **THEN** the affected section SHALL show an inline warning identifying the source and the parse problem
- **AND** the other sections SHALL continue to render normally

#### Scenario: Missing run-state aborts startup

- **WHEN** the resolved run has no readable run-state record
- **THEN** the CLI SHALL exit with a non-zero status and a clear error message
- **AND** the CLI SHALL NOT render a partial TUI
