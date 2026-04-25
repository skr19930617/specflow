# Approval Summary: extend-specflow-watch-with-review-ledger-digests-and-subagent-activity

**Generated**: 2026-04-25T01:53:24Z
**Branch**: extend-specflow-watch-with-review-ledger-digests-and-subagent-activity
**Status**: ⚠️ 1 unresolved high

## What Changed

```
 src/bin/specflow-watch.ts                    |  21 ++
 src/lib/specflow-watch/artifact-readers.ts   | 289 ++++++++++++++-
 src/lib/watch-renderer/index.ts              |   7 +
 src/lib/watch-renderer/model.ts              | 237 +++++++++++-
 src/lib/watch-renderer/render.ts             |  76 +++-
 src/tests/specflow-watch-integration.test.ts | 153 ++++++++
 src/tests/specflow-watch-readers.test.ts     | 230 ++++++++++++
 src/tests/watch-renderer.test.ts             | 531 ++++++++++++++++++++++++++-
 8 files changed, 1537 insertions(+), 7 deletions(-)
```

## Files Touched

```
src/bin/specflow-watch.ts
src/lib/specflow-watch/artifact-readers.ts
src/lib/watch-renderer/index.ts
src/lib/watch-renderer/model.ts
src/lib/watch-renderer/render.ts
src/tests/specflow-watch-integration.test.ts
src/tests/specflow-watch-readers.test.ts
src/tests/watch-renderer.test.ts
```

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 5     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 1     |
| New high (later)   | 1     |
| Total rounds       | 3     |

## Proposal Coverage

Spec acceptance scenarios from `specs/realtime-progress-ui/spec.md`:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Digest renders under snapshot progress during apply_review | Yes | src/lib/watch-renderer/model.ts, src/lib/watch-renderer/render.ts, src/bin/specflow-watch.ts |
| 2 | Severity breakdown only counts open findings | Yes | src/lib/watch-renderer/model.ts, src/tests/watch-renderer.test.ts |
| 3 | Open findings list ranks by severity → latest_round → id | Yes | src/lib/watch-renderer/model.ts (rankOpenFindings), src/tests/watch-renderer.test.ts |
| 4 | Digest remains visible on apply_ready after review completes | Yes | src/lib/specflow-watch/artifact-readers.ts (selectActiveReviewLedger), src/tests/specflow-watch-integration.test.ts |
| 5 | Digest is suppressed on non-review phases (hidden state) | Yes | src/lib/watch-renderer/model.ts, src/tests/watch-renderer.test.ts |
| 6 | Latest round summary missing elides the line | Yes | src/lib/watch-renderer/model.ts (buildSummaryState returns absent), src/lib/watch-renderer/render.ts |
| 7 | Findings list collapses below 80 columns | Yes | src/lib/watch-renderer/render.ts (NARROW_TERMINAL_THRESHOLD), src/tests/watch-renderer.test.ts |
| 8 | Non-findings digest lines truncate with ellipsis below 80 cols | Yes | src/lib/watch-renderer/render.ts (ellipsizeForCols), src/tests/watch-renderer.test.ts |
| 9 | Wide terminals render the full digest | Yes | src/lib/watch-renderer/render.ts, src/tests/watch-renderer.test.ts |
| 10 | UI consumes only read-only artifacts (no writes) | Yes | src/tests/specflow-watch-import-graph.test.ts (denylist guard) |
| 11 | Review ledger path derived from change_name + active family | Yes | src/lib/specflow-watch/artifact-readers.ts (reviewLedgerPath, selectActiveReviewLedger) |
| 12 | Missing ledger shows digest placeholder | Yes | src/lib/watch-renderer/model.ts (buildDigestState placeholder branch), src/tests/watch-renderer.test.ts |
| 13 | Unreadable ledger shows inline warning | Yes | src/lib/watch-renderer/model.ts (warning branch), src/tests/watch-renderer.test.ts |
| 14 | Malformed ledger shows inline warning | Yes | src/lib/specflow-watch/artifact-readers.ts (validateReviewLedgerSchema), src/tests/watch-renderer.test.ts |
| 15 | Empty ledger (no LedgerSnapshot entries) shows digest placeholder | Yes | src/lib/watch-renderer/model.ts (buildDigestFromLedger returns null on empty round_summaries), src/tests/watch-renderer.test.ts |

**Coverage Rate**: 15/15 (100%)

## Remaining Risks

- R3-F01: Digest never renders the required latest-summary line (severity: high) — accepted_risk pending; Phase 2 work to add a compliant persisted summary source. Currently no `LedgerRoundSummary.summary` field exists in the persisted ledger; the spec scenario "Latest round summary missing elides the line" explicitly permits omission, which the implementation honors.
- R3-F02: New tests lock in the spec-violating summary omission (severity: medium) — accepted_risk; tests assert the spec-allowed omission contract. Will be replaced when persisted summary text becomes available.
- R2-F02: Staleness compared against `round_summaries.length` (severity: medium) — moot now that summary state is always `absent`; no comparison performed.

## Human Checkpoints

- [ ] Confirm the Phase 2 plan to add a persisted narrative summary source (e.g., extend `LedgerRoundSummary` with a free-form `summary` field, or define a watcher-readable artifact with explicit ownership). Track as a follow-up issue before users complain about the omitted `Latest summary:` line.
- [ ] Verify the new ledger reader is exercised end-to-end: run `specflow-watch` against a live design or apply review and confirm the digest section renders with decision, counts, severity, and top-3 findings as the ledger updates between rounds.
- [ ] Sanity-check the narrow-terminal collapse (run with `COLUMNS=60` or a 60-column terminal and confirm the findings list disappears while the decision/counts/severity lines remain readable).
- [ ] Review `validateReviewLedgerSchema` in `src/lib/specflow-watch/artifact-readers.ts` for any future `ReviewLedger` fields that should be required vs. optional; the current strict validator may need updating when contracts evolve.
- [ ] Confirm the import-graph guard (`src/tests/specflow-watch-import-graph.test.ts`) still asserts the read-only boundary after this change — no orchestration mutators are imported.
