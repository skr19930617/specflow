# Approval Summary: specflow-watch-ux-1

**Generated**: 2026-04-20T13:10:00Z
**Branch**: specflow-watch-ux-1
**Status**: ✅ No unresolved high

## What Changed

```
 assets/commands/specflow.md.tmpl               | 103 ++++-
 assets/commands/specflow.watch.md.tmpl         | 178 +++++---
 src/bin/specflow-watch.ts                      |  44 +-
 src/lib/specflow-watch/artifact-readers.ts     | 102 ++++-
 src/lib/watch-renderer/index.ts                |   7 +
 src/lib/watch-renderer/model.ts                | 234 +++++++++-
 src/lib/watch-renderer/render.ts               | 112 ++++-
 src/tests/__snapshots__/specflow.md.snap       | 103 ++++-
 src/tests/__snapshots__/specflow.watch.md.snap | 178 +++++---
 src/tests/specflow-watch-integration.test.ts   |  48 ++-
 src/tests/specflow-watch-launcher.test.ts      | 224 ++++++++++
 src/tests/specflow-watch-readers.test.ts       | 100 ++++-
 src/tests/watch-renderer.test.ts               | 568 +++++++++++++++++++++----
 13 files changed, 1720 insertions(+), 281 deletions(-)
```

## Files Touched

```
assets/commands/specflow.md.tmpl
assets/commands/specflow.watch.md.tmpl
src/bin/specflow-watch.ts
src/lib/specflow-watch/artifact-readers.ts
src/lib/watch-renderer/index.ts
src/lib/watch-renderer/model.ts
src/lib/watch-renderer/render.ts
src/tests/__snapshots__/specflow.md.snap
src/tests/__snapshots__/specflow.watch.md.snap
src/tests/specflow-watch-integration.test.ts
src/tests/specflow-watch-launcher.test.ts
src/tests/specflow-watch-readers.test.ts
src/tests/watch-renderer.test.ts
```

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 1     |
| Unresolved high    | 1     |
| New high (later)   | 1     |
| Total rounds       | 4     |

1 HIGH finding remains open by design (see Remaining Risks) — synchronous-branch success
semantics are an **intentional, documented accepted_risk** (design D11).

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 3     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 3     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Cross-platform launch dispatcher (tmux/screen/macOS osascript/Linux emulators/manual) | Yes | `assets/commands/specflow.watch.md.tmpl`, `assets/commands/specflow.md.tmpl`, `src/tests/specflow-watch-launcher.test.ts` |
| 2 | Events section specific formatting per event_kind | Yes | `src/lib/watch-renderer/model.ts` (`eventSummary`), `src/tests/watch-renderer.test.ts` |
| 3 | Review round sticky across adjacent phases with live/completed badge | Yes | `src/lib/specflow-watch/artifact-readers.ts` (`selectActiveAutofixPhase`, `phaseIsLiveReviewGate`), `src/lib/watch-renderer/model.ts` (`buildReviewView`), `src/lib/watch-renderer/render.ts` (`visibilityBadge`) |
| 4 | Manual fix badge + "Manual fix in progress — N unresolved findings" line | Yes | `src/lib/watch-renderer/model.ts` (`deriveManualFixKind`), `src/lib/watch-renderer/render.ts` (`manualFixBadgeOrEmpty`) |
| 5 | Task graph child task tree with status glyphs and bundle-done override | Yes | `src/lib/watch-renderer/model.ts` (`bundleView`), `src/lib/watch-renderer/render.ts` (`renderChildTaskRow`, `taskStatusGlyph`) |
| 6 | Approval summary section (Status + diffstat, 2 lines) with degraded-path handling | Yes | `src/lib/specflow-watch/artifact-readers.ts` (`readApprovalSummary`), `src/lib/watch-renderer/model.ts` (`buildApprovalSummary`), `src/lib/watch-renderer/render.ts` (`renderApprovalSection`), `src/bin/specflow-watch.ts` |

**Coverage Rate**: 6/6 (100%)

## Remaining Risks

- **R4-F08 (design ledger, HIGH, accepted_risk)**: "Launcher control flow reports success before verifying terminal launch and prevents fallback." Synchronous branches (`tmux split-window`, `screen`, `osascript do script`) use the wrapper's exit code as the success signal; per design D11 this is the canonical contract. Any startup failure inside the new terminal is visible to the operator in that terminal. Adding PID probes to synchronous wrappers would introduce false positives without meaningfully improving UX.
- 5 LOW findings remain in the impl ledger — cosmetic / naming / minor drift-from-design items only; none affect behavior.
- ⚠️ New file not reviewed as separate entry: `src/tests/specflow-watch-launcher.test.ts` is included in the diff but added in one atomic step together with the dispatcher templates it tests, so shared review coverage applies.

## Human Checkpoints

- [ ] On macOS, confirm `/specflow.watch` opens a new Terminal.app window and runs `specflow-watch` inside it (the original bug — `open -a Terminal --args` opened an empty window).
- [ ] Inside tmux, confirm `/specflow.watch` splits a new pane and the watch TUI renders there.
- [ ] While `specflow-watch` is running during an apply cycle, trigger `revise_apply` from the main chat and confirm the `(manual fix)` header badge plus "Manual fix in progress — N unresolved findings" row appear within 2s, then disappear after the next `review_apply`.
- [ ] On a linux host (or via `$TERMINAL` override), confirm that an emulator with non-`-e` syntax (e.g., `gnome-terminal`) launches the watch via the `--` separator branch and does not fall through to `xterm`.
- [ ] Walk the archived `approval-summary.md` of this change into `specflow-watch` (via `last_summary_path`) and confirm the new "Approval summary" section renders `Status: ✅ No unresolved high` plus the 1-line diffstat footer.
