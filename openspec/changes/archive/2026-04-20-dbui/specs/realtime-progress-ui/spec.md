## ADDED Requirements

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
