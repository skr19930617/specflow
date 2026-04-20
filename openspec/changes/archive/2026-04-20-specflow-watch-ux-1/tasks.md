## 1. Extend Watch Model Contracts ✓

> Define the pure model interfaces required for manual-fix state, sticky review visibility, child tasks, and approval summary data.

- [x] 1.1 Extend WatchModelHeader, ReviewRoundView, BundleView, ApprovalSummaryView, and WatchModel with the new fields described in the design
- [x] 1.2 Thread the new task and section-state shapes through the existing model contracts so downstream builders and renderers can consume them without changing section order

## 2. Expand Watch Artifact Readers ✓

> Add the pure reader behavior needed to keep review snapshots visible across phase families and to extract approval summary data from archived artifacts.

- [x] 2.1 Expand selectActiveAutofixPhase to map design_draft/design_review/design_ready to design_review and apply_draft/apply_review/apply_ready/approved to apply_review
- [x] 2.2 Add ApprovalSummaryExtract and readApprovalSummary with tolerant Status and diffstat extraction plus tagged absent/missing/ok outcomes

## 3. Improve Review And Event Visibility ✓

> Make recent events concrete and keep review/manual-fix context visible across adjacent phases without changing the existing watch layout.

> Depends on: watch-model-contracts, watch-artifact-readers

- [x] 3.1 Update eventSummary to render concrete phase, gate, trigger, outcome, and resolved-response text from RawObservationEvent fields
- [x] 3.2 Add manual-fix derivation plus review-family visibility and manual_fix_open_count logic in buildHeader and buildReviewView
- [x] 3.3 Render the header manual-fix badge and review live/completed plus manual-fix lines while preserving the current section order and renderer diff behavior

## 4. Expose Bundle Child Tasks ✓

> Project bundle child tasks into the watch model and render them as a persistent tree beneath each bundle summary.

> Depends on: watch-model-contracts

- [x] 4.1 Populate BundleView.tasks from the task graph and force child display_status to done when the parent bundle is done
- [x] 4.2 Render the child task tree with box-drawing glyphs, task status markers, and existing truncation behavior for narrow terminals

## 5. Wire Approval Summary Into Watch ✓

> Surface approval summary data in the watch frame and watch process without introducing any new write-side behavior.

> Depends on: watch-model-contracts, watch-artifact-readers

- [x] 5.1 Add buildApprovalSummary to translate readApprovalSummary results into the new WatchModel approval_summary section state
- [x] 5.2 Implement renderApprovalSection and append it after Recent events in renderFrame
- [x] 5.3 Update src/bin/specflow-watch.ts to pass the expanded model shape and add approval-summary.md to watchedPaths only when last_summary_path is present

## 6. Unify Watch Launch Dispatcher ✓

> Replace fragile platform-specific watch launch snippets with one inline cross-platform Bash dispatcher used by both command templates.

- [x] 6.1 Add the inline launch_watch Bash dispatcher to specflow.watch.md.tmpl with tmux, screen, osascript, TERMINAL, Linux emulator, and manual fallback branches
- [x] 6.2 Replace /specflow Step 3.7 with the same dispatcher while preserving SPECFLOW_NO_WATCH opt-out semantics only for /specflow

## 7. Verify Watch UX Regression Coverage ✓

> Protect the new watch UX and launcher behavior with targeted reader, renderer, integration, and snapshot coverage.

> Depends on: watch-review-and-events, watch-task-tree, watch-approval-section-and-cli, watch-launcher-dispatcher

- [x] 7.1 Add reader unit tests for expanded selectActiveAutofixPhase mappings and approval summary extraction outcomes
- [x] 7.2 Extend watch-renderer tests to cover concrete event summaries, sticky review visibility, manual-fix indicators, and task tree rendering
- [x] 7.3 Extend the --once integration coverage with apply_ready persistence plus manual-fix and approval-summary fixtures
- [x] 7.4 Regenerate template and renderer snapshots and verify the new dispatcher text replaces the old open -a Terminal flow
