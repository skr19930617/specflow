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
- the `task-graph.json` file at `openspec/changes/<run.change_name>/task-graph.json`.

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
- If any non-essential source is unparseable or malformed, the affected section SHALL display an inline warning, and the other sections SHALL continue to render.
- If the run-state for the resolved run cannot be read (missing or unparseable), the CLI SHALL exit with a non-zero status and a clear error message rather than render an incomplete TUI.

#### Scenario: Missing task-graph shows placeholder

- **WHEN** `openspec/changes/<run.change_name>/task-graph.json` does not exist at watcher start or at redraw time
- **THEN** the task-graph section SHALL display a placeholder indicating no task graph yet
- **AND** the other sections SHALL continue to render normally

#### Scenario: Missing autofix snapshot shows placeholder

- **WHEN** no autofix progress snapshot exists for the tracked run
- **THEN** the review round section SHALL display a placeholder indicating no active review
- **AND** the other sections SHALL continue to render normally

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

