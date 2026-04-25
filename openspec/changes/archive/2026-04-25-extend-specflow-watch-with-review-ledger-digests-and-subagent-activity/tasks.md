## 1. Lock Review Ledger Digest Contract ✓

> Align the delta spec and implementation checklist around digest content, graceful degradation, and the watcher's read-only boundary before code wiring begins.

- [x] 1.1 Reconcile the design's digest fields, ranking order, and narrow-terminal behavior with the realtime-progress-ui delta scenarios
- [x] 1.2 Confirm the read-only artifact contract covers family-mapped review-ledger paths and excludes all watcher writes and mutating review-ledger helpers
- [x] 1.3 Freeze the Phase 1 handling for latest-summary fallback and empty-ledger placeholder semantics in an implementation checklist
- [x] 1.4 Confirm subagent activity and new observation events remain out of scope for this change

## 2. Add Ledger Readers And Family Selection ✓

> Provide tolerant review-ledger readers and a phase-to-ledger-family selector in the watcher's artifact layer.

> Depends on: lock-review-ledger-digest-contract

- [x] 2.1 Add design and apply review-ledger path helpers plus readDesignReviewLedger and readApplyReviewLedger returning ok, absent, unreadable, or malformed
- [x] 2.2 Implement a watcher-local ledger validator that only requires digest fields and tolerates unknown extras without side effects
- [x] 2.3 Add selectActiveReviewLedger(currentPhase) and verify its family mapping stays in parity with selectActiveAutofixPhase
- [x] 2.4 Extend specflow-watch reader tests for ok, absent, unreadable, malformed, and empty-round-summaries ledger cases

## 3. Build And Render Review Ledger Digest ✓

> Derive a review-ledger digest from the latest persisted ledger state and render it compactly beneath the existing snapshot progress lines.

> Depends on: lock-review-ledger-digest-contract, add-ledger-readers-and-family-selection

- [x] 3.1 Extend the review section model with LedgerDigest or null plus placeholder and warning states derived from ledger reader results
- [x] 3.2 Build digest decision, counts, open-severity totals, latest-summary fallback, and top-3 ranking from the last round_summaries entry plus open findings
- [x] 3.3 Render digest lines below snapshot progress without changing existing snapshot and manual-fix behavior
- [x] 3.4 Apply sub-80-column findings collapse and ellipsis truncation in the renderer only, keeping terminal width out of the model
- [x] 3.5 Expand watch-renderer tests for populated digests, ranking tie-breakers, empty ledgers, warning states, and narrow versus wide terminal output

## 4. Wire Ledger Digest Through Specflow Watch ✓

> Connect the new ledger readers and digest model through specflow-watch, including watched ledger paths and end-to-end redraw coverage.

> Depends on: add-ledger-readers-and-family-selection, build-and-render-review-ledger-digest

- [x] 4.1 Wire active ledger selection and tolerant ledger reads into buildModel and review-section construction in src/bin/specflow-watch.ts
- [x] 4.2 Add design and apply review-ledger files to the watched path set and keep redraw behavior aligned with the existing polling fallback
- [x] 4.3 Extend specflow-watch integration tests to cover initial digest render and redraw after ledger updates on disk
- [x] 4.4 Re-check the import-graph guard so the new wiring does not pull in mutating review-ledger code or write-oriented APIs
