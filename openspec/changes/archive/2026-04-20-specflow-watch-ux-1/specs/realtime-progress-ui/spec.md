## ADDED Requirements

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
