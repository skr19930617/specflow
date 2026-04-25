# realtime-progress-ui Specification

## Purpose
TBD - created by archiving change dbui. Update Purpose after archive.
## Requirements
### Requirement: Real-time progress UI is a standalone terminal process driven by a slash command

The system SHALL provide a real-time progress UI for a single specflow run that runs as a standalone, long-lived terminal process launched through the `/specflow.watch` slash command. The UI SHALL render a full-screen ANSI TUI to stdout, redraw on changes, and exit on `q` or `Ctrl+C`. The UI SHALL NOT require any server, daemon, network connection, or database; its only data sources are local filesystem artifacts.

#### Scenario: Command produces a standalone terminal TUI process

- **WHEN** the `specflow-watch` CLI is launched for an existing active run
- **THEN** it SHALL occupy the terminal it was launched in with a redrawable full-screen TUI
- **AND** it SHALL continue running until the user presses `q` or `Ctrl+C`
- **AND** it SHALL NOT open any TCP/UDP listening socket and SHALL NOT connect to any database

#### Scenario: UI redraws on filesystem changes

- **WHEN** any of the watched artifacts (run-state, autofix progress snapshot, task-graph.json, observation events log) for the tracked run is modified on disk
- **THEN** the TUI SHALL redraw the affected section within a short interval
- **AND** the redraw SHALL use a diff-based update that does not clear and flicker the entire screen on every event

### Requirement: Run resolution supports run-id, change_name, and default branch-derived lookup

The CLI SHALL accept a single positional argument that is either a `run_id` or a `change_name`, or no argument at all. When no argument is given, the CLI SHALL resolve the tracked run as the latest active run matching the current git branch.

The default resolution rule SHALL be:

1. `run.change_name` equals the current git branch name.
2. `run.status` equals `active`.
3. Among matches, order by `updated_at` descending and then `created_at` descending; pick the first.

When a positional argument is provided, the CLI SHALL first attempt to interpret it as an exact `run_id`. If no run with that id exists, the CLI SHALL interpret it as a `change_name` and apply the same active / ordering rule as the default case.

If no run can be resolved, the CLI SHALL print an error message explaining what was searched for and exit with a non-zero status; it SHALL NOT open the TUI.

#### Scenario: Explicit run_id is tracked exactly

- **WHEN** the CLI is invoked with an argument that matches an existing `run_id`
- **THEN** the CLI SHALL track exactly that run regardless of its status

#### Scenario: change_name argument resolves to latest active run of that change

- **WHEN** the CLI is invoked with an argument that does not match any `run_id` but matches the `change_name` of one or more runs
- **THEN** the CLI SHALL pick the latest active run of that change using `updated_at DESC`, `created_at DESC`
- **AND** if no active run exists for that change_name, it SHALL exit with a non-zero status and a clear error message

#### Scenario: No argument falls back to current git branch

- **WHEN** the CLI is invoked with no positional argument inside a git repository
- **THEN** the CLI SHALL resolve the tracked run using `run.change_name == <current git branch>` and `status == active`, ordered by `updated_at DESC`, `created_at DESC`
- **AND** if no run matches, the CLI SHALL exit with a non-zero status and a clear error message that includes the branch name that was searched

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

### Requirement: Required display sections

The TUI SHALL render at least the following four sections, each labeled and visually separated:

1. **Run header** — `run_id`, `change_name`, `current_phase`, `status`, and git branch.
2. **Review round progress** — for the active review gate: `round_index / max_rounds`, unresolved `high` and `medium` counts, and the review `score`, sourced from the autofix progress snapshot.
3. **Task-graph bundled progress** — one horizontal progress bar per bundle showing completed tasks over total tasks (for example `[█████─────] 5/10`) along with the bundle's title and status; bundles SHALL be listed in topological order derived from `depends_on`; an overall totals line at the top of the section SHALL summarize completed bundles over total bundles.
4. **Recent observation events** — the most recent observation events for this run (approximately the last 5 to 10 entries), each showing a timestamp, event kind, and short summary.

#### Scenario: Run header reflects current run-state

- **WHEN** the TUI is rendered
- **THEN** the header SHALL show the resolved `run_id`, `change_name`, `current_phase`, `status`, and git branch
- **AND** updates to these fields in run-state SHALL propagate to the header on the next redraw

#### Scenario: Review round section reflects autofix snapshot

- **WHEN** an autofix progress snapshot exists for the tracked run
- **THEN** the review round section SHALL show `round_index`, `max_rounds`, unresolved high count, unresolved medium count, and score
- **AND** values SHALL update on the next redraw after the snapshot changes

#### Scenario: Task-graph section renders bundles in topological order

- **WHEN** `task-graph.json` is present and parseable for the tracked run
- **THEN** the task-graph section SHALL render one row per bundle, listed in a topological order consistent with each bundle's `depends_on`
- **AND** each row SHALL include a horizontal progress bar showing completed tasks over total tasks for that bundle, the bundle title, and the bundle status
- **AND** an overall totals line at the top of the section SHALL show completed bundles over total bundles

#### Scenario: Recent events section tails the observation log

- **WHEN** the observation events log contains entries for the tracked run
- **THEN** the recent events section SHALL show approximately the last 5 to 10 entries for the run
- **AND** new events appended to the log SHALL appear on the next redraw

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

### Requirement: Terminal-state lifecycle

When `run.status` transitions out of `active` (for example to `completed`, `failed`, `canceled`, `suspended`, or `archived`), the watcher SHALL NOT exit on its own. Instead it SHALL:

- keep the terminal window open;
- display a banner (for example "Run completed — press q to quit") indicating the terminal status reached;
- render the final snapshot of all sections using the last known values;
- continue honoring filesystem watches so that if the run re-activates the TUI can resume updating.

The user SHALL exit explicitly via `q` or `Ctrl+C`.

#### Scenario: Watcher stays open after run completes

- **WHEN** the tracked run transitions to a non-active status
- **THEN** the TUI SHALL remain open
- **AND** the TUI SHALL display a banner that indicates the run reached a terminal status and instructs the user to press `q` to quit

#### Scenario: Final snapshot is preserved after terminal transition

- **WHEN** the tracked run transitions to a non-active status
- **THEN** the review round, task-graph, and recent events sections SHALL continue to display their last known values
- **AND** the TUI SHALL NOT blank out sections on the status transition

#### Scenario: Re-activation resumes updates

- **WHEN** the tracked run re-enters `active` while the TUI is still open
- **THEN** the TUI SHALL resume updating sections from the live artifacts on the next redraw

### Requirement: Update mechanism uses filesystem watch with a polling fallback

The CLI SHALL primarily rely on filesystem change notifications on the watched artifact paths to trigger redraws, and SHALL additionally run a slow periodic poll (approximately every 2 seconds) as a fallback to cover dropped watch events. Polling SHALL detect changes by comparing file modification time and size against the last observed values.

#### Scenario: File modification triggers a redraw

- **WHEN** the contents or mtime of any watched artifact for the tracked run changes
- **THEN** the TUI SHALL redraw the affected section within a short interval (either via the filesystem watcher or via the polling fallback)

#### Scenario: Polling fallback catches missed events

- **WHEN** a watched artifact is modified in a way that the underlying filesystem watcher does not report (for example editor atomic-save on some filesystems)
- **THEN** the periodic poll SHALL still detect the change by mtime or size
- **AND** the TUI SHALL redraw the affected section

### Requirement: Recent events section renders concrete, event-kind-aware summaries

The Recent observation events section SHALL render each event as a specific one-line summary derived from the event's `event_kind`, `source_phase`, `target_phase`, `gate_ref`, and `payload` fields. Abstract `event_kind`-only display (for example, "phase_entered" with no phase name) SHALL NOT satisfy this requirement.

The normative formatting rules SHALL be:

- `phase_entered` → `→ <target_phase> (<payload.triggered_event>)`
- `phase_completed` → `✓ <source_phase> (<payload.outcome>)`
- `gate_opened` → `⏸ waiting: <payload.gate_kind>`; if `gate_ref` is non-empty, append ` (<gate_ref>)`
- `gate_resolved` → `▶ <payload.gate_kind> = <payload.resolved_response>`
- `run_started` → `▶ run started`
- `run_terminated` → `■ run <payload.final_status>`
- For any other `event_kind`, the renderer SHALL fall back to the existing `payload.summary` or `payload.loop_state` projection.

When a referenced field is absent (for example, `payload.triggered_event` is missing from a `phase_entered` event), the renderer SHALL elide the parenthesized suffix rather than print `undefined` or an empty placeholder.

#### Scenario: phase_entered renders as arrow + target phase + trigger

- **WHEN** a recent event has `event_kind == "phase_entered"`, `target_phase == "apply_review"`, and `payload.triggered_event == "review_apply"`
- **THEN** the event row SHALL display the summary `→ apply_review (review_apply)`

#### Scenario: phase_completed renders as checkmark + source phase + outcome

- **WHEN** a recent event has `event_kind == "phase_completed"`, `source_phase == "apply_review"`, and `payload.outcome == "advanced"`
- **THEN** the event row SHALL display the summary `✓ apply_review (advanced)`

#### Scenario: gate_opened renders as pause + gate kind

- **WHEN** a recent event has `event_kind == "gate_opened"` and `payload.gate_kind == "review_decision"`
- **THEN** the event row SHALL display the summary `⏸ waiting: review_decision`
- **AND** when `gate_ref` is non-empty, the summary SHALL append ` (<gate_ref>)`

#### Scenario: gate_resolved renders as play + gate kind + response

- **WHEN** a recent event has `event_kind == "gate_resolved"`, `payload.gate_kind == "approval"`, and `payload.resolved_response == "accept"`
- **THEN** the event row SHALL display the summary `▶ approval = accept`

#### Scenario: run_started and run_terminated render fixed labels

- **WHEN** a recent event has `event_kind == "run_started"`
- **THEN** the event row SHALL display the summary `▶ run started`
- **AND WHEN** a recent event has `event_kind == "run_terminated"` and `payload.final_status == "completed"`
- **THEN** the event row SHALL display the summary `■ run completed`

#### Scenario: Missing payload fields elide gracefully

- **WHEN** a `phase_entered` event is missing `payload.triggered_event`
- **THEN** the event row SHALL display `→ <target_phase>` without a parenthesized suffix and SHALL NOT display `undefined`

### Requirement: Review round section persists across phases in the same review family

The Review round section SHALL display the most recent autofix progress snapshot for the review family associated with `current_phase`, not only while the run is in the `design_review` or `apply_review` gate. The family mapping SHALL be:

- `current_phase ∈ {design_draft, design_review, design_ready}` → display `autofix-progress-design_review.json`
- `current_phase ∈ {apply_draft, apply_review, apply_ready, approved}` → display `autofix-progress-apply_review.json`
- Any other phase (for example `proposal_*`, `spec_*`) → display the existing `No active review` placeholder.

The section SHALL visually distinguish a live review from a completed one:

- **live**: rendered when `current_phase ∈ {design_review, apply_review}`. The header SHALL include a bold `live` badge.
- **completed**: rendered when a snapshot exists for the family but `current_phase` is not a review gate. The header SHALL include a dim `completed` badge referencing `loop_state` (for example, `completed — terminal_success`).

If no snapshot exists for the family, the section SHALL display the existing placeholder even when the current phase is adjacent to review.

#### Scenario: Review round is visible during apply_ready

- **WHEN** the tracked run's `current_phase` is `apply_ready` and `autofix-progress-apply_review.json` exists
- **THEN** the Review round section SHALL render the snapshot's `round_index`, `max_rounds`, severity counters, and `loop_state`
- **AND** the section header SHALL include a `completed` badge

#### Scenario: Review round shows live badge during apply_review

- **WHEN** the tracked run's `current_phase` is `apply_review` and `autofix-progress-apply_review.json` exists
- **THEN** the Review round section SHALL render the snapshot's fields
- **AND** the section header SHALL include a `live` badge

#### Scenario: Review round stays empty for unrelated phases

- **WHEN** the tracked run's `current_phase` is `spec_draft` or `proposal_clarify`
- **THEN** the Review round section SHALL display the existing `No active review` placeholder regardless of whether autofix snapshots exist on disk

### Requirement: Manual fix phase is visualized in header and review sections

When the tracked run is in a manual fix phase — defined as `run.history` whose last entry has `event == "revise_apply"` or `event == "revise_design"` — the TUI SHALL:

- append a `(manual fix)` badge to the `phase` field of the Run header;
- inject a line `Manual fix in progress — N unresolved findings` immediately below the existing Review round summary, where `N` SHALL be sourced from the family-matching autofix snapshot's `counters.totalOpen`;
- when the snapshot is absent or unreadable, substitute `? unresolved` for `N unresolved findings` rather than warning.

The manual-fix state SHALL be considered cleared — and both the badge and the extra line SHALL disappear — as soon as `run.history`'s last entry has `event == "review_apply"` or `event == "review_design"` (or any subsequent event that is not `revise_apply`/`revise_design`).

#### Scenario: Manual fix badge appears after revise_apply

- **WHEN** the last entry of `run.history` has `event == "revise_apply"` and `current_phase == "apply_draft"`
- **THEN** the Run header SHALL display `phase: apply_draft (manual fix)`
- **AND** the Review round section SHALL include a line `Manual fix in progress — N unresolved findings`, where `N == counters.totalOpen` from `autofix-progress-apply_review.json`

#### Scenario: Manual fix badge clears after review_apply

- **WHEN** a subsequent `review_apply` event is appended to `run.history`
- **THEN** the Run header SHALL NOT display the `(manual fix)` badge
- **AND** the Review round section SHALL NOT include the `Manual fix in progress` line

#### Scenario: Manual fix without snapshot falls back to question mark

- **WHEN** the last entry of `run.history` has `event == "revise_apply"` and `autofix-progress-apply_review.json` is absent or unreadable
- **THEN** the Review round section SHALL render `Manual fix in progress — ? unresolved`
- **AND** the section SHALL NOT display an error warning

### Requirement: Task-graph section renders per-bundle child task trees

Under each bundle row of the Task-graph section, the TUI SHALL render one row per individual task belonging to that bundle, in the order they appear in `bundle.tasks`. Each task row SHALL use box-drawing tree glyphs — `├─` for non-final siblings and `└─` for the final sibling — followed by a status glyph, the task `id`, and the task `title`.

The status-glyph mapping SHALL be:

- `done` → `[✓]`
- `in_progress` → `[◐]`
- `pending` → `[ ]`
- `skipped` → `[·]`

**Bundle-level completion override**: when the bundle's own `status == "done"`, every child task row SHALL render `[✓]` regardless of the task's internal status.

The existing bundle-level summary row (title, horizontal progress bar, `tasks_done/tasks_total` count, and `(status)` badge) SHALL be preserved; the child tree SHALL be rendered **in addition to** the summary, not in place of it.

#### Scenario: Child tasks render with tree glyphs and status symbols

- **WHEN** a bundle has three tasks with statuses `done`, `in_progress`, `pending`
- **THEN** the task-graph section SHALL render three task rows under the bundle using `├─`, `├─`, and `└─` glyphs
- **AND** the status glyphs on the three rows SHALL be `[✓]`, `[◐]`, and `[ ]` respectively

#### Scenario: Bundle-level done overrides child task status symbols

- **WHEN** a bundle's `status == "done"` and its tasks have mixed internal statuses
- **THEN** every child task row SHALL render `[✓]` regardless of the task's own `status` field

#### Scenario: Bundle summary row remains visible with child tree

- **WHEN** child task rows are rendered under a bundle
- **THEN** the existing bundle summary row (title + horizontal progress bar + `tasks_done/tasks_total` count + `(status)` badge) SHALL still be rendered above the child rows

### Requirement: Approval summary section renders last approval digest

The TUI SHALL render a new **Approval summary** section sourced from `run.last_summary_path`. The section SHALL display two lines extracted from the referenced `approval-summary.md`:

1. The first line beginning with `Status:` (verbatim).
2. The diffstat footer line matching the pattern `<N> files? changed, <+X> insertions?(+), <-Y> deletions?(-)` from inside the `What Changed` section.

The section SHALL NOT embed the full `What Changed` file list or the `Files Touched` list.

Degradation SHALL be:

- `run.last_summary_path == null` → placeholder `No approval yet`.
- `run.last_summary_path` points to a file that does not exist → warning `Approval summary missing`.
- File exists but no `Status:` line → display `Status: (unknown)`; if a diffstat footer is found, still display it.
- File exists but no diffstat footer → display only the `Status:` line.

The section SHALL be watched for filesystem changes so that a later `approval-summary.md` write causes the section to redraw.

#### Scenario: Approval summary renders Status and diffstat lines

- **WHEN** `run.last_summary_path` points to an `approval-summary.md` whose first `Status:` line is `Status: ✅ No unresolved high` and whose `What Changed` section contains `22 files changed, 3049 insertions(+), 13 deletions(-)`
- **THEN** the Approval summary section SHALL render those two lines verbatim
- **AND** it SHALL NOT render the per-file diff list or the Files Touched list

#### Scenario: Approval summary placeholder before first approval

- **WHEN** `run.last_summary_path` is `null` (no approval has been recorded yet)
- **THEN** the Approval summary section SHALL display the placeholder `No approval yet`

#### Scenario: Approval summary missing file shows warning

- **WHEN** `run.last_summary_path` points to a path that does not exist on disk
- **THEN** the Approval summary section SHALL display the warning `Approval summary missing`

#### Scenario: Approval summary redraws on file change

- **WHEN** `approval-summary.md` is written or updated while the watcher is running
- **THEN** the Approval summary section SHALL redraw on the next filesystem event or polling cycle

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

