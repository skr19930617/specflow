# Approval Summary: apply-reviewapprovefix

**Generated**: 2026-04-15T11:40:00Z
**Branch**: apply-reviewapprovefix
**Status**: ✅ No unresolved high

## 2a. What Changed

```
 .../review-outcome-payload.schema.json             |  5 ++
 src/bin/specflow-review-apply.ts                   | 17 +++-
 src/bin/specflow-review-design.ts                  | 13 ++-
 src/contracts/command-bodies.ts                    | 10 +--
 src/contracts/surface-events.ts                    | 39 +++++++++
 src/lib/review-ledger.ts                           | 35 +++++++-
 src/lib/review-runtime.ts                          | 98 ++++++++--------------
 .../legacy-final/review-apply/current-phase.md     |  2 +-
 .../legacy-final/review-design/current-phase.md    |  2 +-
 src/tests/generation.test.ts                       | 67 +++++++++++++++
 src/tests/surface-event-schema-drift.test.ts       | 55 ++++++++++++
 11 files changed, 259 insertions(+), 84 deletions(-)
```

Plus newly added files (untracked):
- `openspec/changes/apply-reviewapprovefix/` (proposal, design, tasks, spec deltas, ledger)
- `src/tests/review-ledger.test.ts`
- `src/tests/severity-aware-handoff.test.ts`

## 2b. Files Touched

**Modified:**
- `assets/global/schemas/surface-events/review-outcome-payload.schema.json`
- `src/bin/specflow-review-apply.ts`
- `src/bin/specflow-review-design.ts`
- `src/contracts/command-bodies.ts`
- `src/contracts/surface-events.ts`
- `src/lib/review-ledger.ts`
- `src/lib/review-runtime.ts`
- `src/tests/fixtures/legacy-final/review-apply/current-phase.md`
- `src/tests/fixtures/legacy-final/review-design/current-phase.md`
- `src/tests/generation.test.ts`
- `src/tests/surface-event-schema-drift.test.ts`

**Added:**
- `src/tests/review-ledger.test.ts`
- `src/tests/severity-aware-handoff.test.ts`
- `openspec/changes/apply-reviewapprovefix/{proposal.md, design.md, tasks.md, task-graph.json, current-phase.md, specs/**}`

## 2c. Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

⚠️ `review-ledger.json` (impl) not persisted — the review agent returned a parse-error response, so no finding ledger was written. The raw response contained `decision: APPROVE` with 1 MEDIUM and 2 LOW informational findings; F1 (MEDIUM — `computeScore` ignoring CRITICAL) was addressed during apply review. F2 / F3 are below the HIGH+ gate and are captured below under Remaining Risks.

## 2d. Proposal Coverage

Acceptance criteria (spec-delta `#### Scenario:` blocks) mapped to implementation files:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Apply review with only LOW findings reports `review_no_findings` | Yes | `src/bin/specflow-review-apply.ts`, `src/lib/review-ledger.ts` (`unresolvedCriticalHighCount`), `src/tests/severity-aware-handoff.test.ts` |
| 2 | Apply review with HIGH unresolved reports `review_with_findings` | Yes | `src/bin/specflow-review-apply.ts`, `src/tests/severity-aware-handoff.test.ts` |
| 3 | Apply autofix loop applies the same severity-aware gate | Yes | `src/bin/specflow-review-apply.ts` (autofix-loop tail) |
| 4 | Design review applies the same severity-aware gate as apply review | Yes | `src/bin/specflow-review-design.ts`, `src/tests/severity-aware-handoff.test.ts` |
| 5 | Reviewer decision string does not gate handoff state | Yes | `src/bin/specflow-review-apply.ts`, `src/bin/specflow-review-design.ts` (`blocking` derived from ledger) |
| 6 | All gate sites call `unresolvedCriticalHighCount` | Yes | grep confirms single-helper usage in `src/lib/review-runtime.ts`, both `bin/specflow-review-*.ts` |
| 7 | Helper aggregates critical and high in one number | Yes | `src/lib/review-ledger.ts` (`unresolvedCriticalHighCount`), `src/tests/review-ledger.test.ts` |
| 8 | `apply_review_approved` / `design_review_approved` emitted only when HIGH+ gate satisfied | Yes | `src/bin/specflow-review-*.ts` derive `handoff.state` from `unresolvedCriticalHighCount`; `surface-events.ts` exposes `REVIEW_OUTCOME_PAYLOAD_SCHEMA_VERSION` |
| 9 | Review-outcome payload declares `schema_version` | Yes | `src/contracts/surface-events.ts` (type + constant), JSON schema updated, `src/tests/surface-event-schema-drift.test.ts` |
| 10 | Legacy payloads flagged on read (`isLegacyReviewOutcomePayload`) | Yes | `src/contracts/surface-events.ts` + drift test |
| 11 | `_with_findings` handoffs expose Approve as non-primary (last) with severity summary + accepted-risk warning | Yes | `src/contracts/command-bodies.ts` (both review_apply + review_design), `src/tests/generation.test.ts` |
| 12 | `specflow.approve.md` Quality Gate uses HIGH+ threshold | Yes | `src/contracts/command-bodies.ts` (approve body), `src/tests/generation.test.ts` |
| 13 | `review-orchestration` MODIFIED scenarios integrate severity-aware gate wording | Yes | `openspec/changes/apply-reviewapprovefix/specs/review-orchestration/spec.md` |
| 14 | `slash-command-guides` MODIFIED scenarios add LOW/MEDIUM clarification and non-primary approve | Yes | `openspec/changes/apply-reviewapprovefix/specs/slash-command-guides/spec.md` |
| 15 | `surface-event-contract` MODIFIED scenarios declare `schema_version` on new events | Yes | `openspec/changes/apply-reviewapprovefix/specs/surface-event-contract/spec.md` |

**Coverage Rate**: 15/15 (100%)

## 2e. Remaining Risks

1. **Deterministic risks:** ⚠️ `review-ledger.json` (impl) not available — raw apply-review agent response identified:
   - `F2 (low)`: Notes-required check at `src/lib/review-ledger.ts:203-213` (applyStillOpenSeverityOverrides) still keys on `severity === "high"` only. When a CRITICAL finding is marked `accepted_risk` without notes, the validator does not reopen it. Not on the approve path (LOW severity), but worth tracking for consistency.
   - `F3 (low)`: No CLI-level end-to-end test (`src/tests/review-cli.test.ts` or `specflow-run.test.ts`) exercises the orchestrator boundary with `HIGH+=0, LOW/MEDIUM>0` and asserts `handoff.state == "review_no_findings"`. Covered at the renderer/unit level (`severity-aware-handoff.test.ts`, `review-ledger.test.ts`).

2. **Untested new files:** None. The new test files (`src/tests/review-ledger.test.ts`, `src/tests/severity-aware-handoff.test.ts`) are themselves the tests.

3. **Uncovered criteria:** None — all 15 spec-delta scenarios map to implementation.

## 2f. Human Checkpoints

- [ ] Sanity-check the rewritten `specflow.review_apply.md` / `specflow.review_design.md` in the installed `dist/package/global/commands/` — does the Approve-last option ordering render visually as expected when the Dual-Display UI shows the option list?
- [ ] Confirm that consumers of `review-outcome` events (if any exist outside this repo) can tolerate the new `schema_version` field. In-repo code handles missing `schema_version` via `isLegacyReviewOutcomePayload`.
- [ ] Consider a follow-up issue to address F2 (notes-required for CRITICAL) and F3 (CLI-level LOW-only gate assertion) — both are consistency / defense-in-depth items below the approve gate.
- [ ] Verify that the `has_open_high` ledger status rename-by-semantics (now covering critical+high) does not break any dashboards or downstream automation that filters by this exact string. The string value is unchanged; only the computation expanded.

---

**Unresolved High**: 0
**Proposal Coverage**: 15/15 (100%)
**Remaining Risks**: 2 low-severity follow-ups (F2, F3)

⚠️ Degraded: Impl Review Loop Summary (impl ledger missing due to review-agent parse error — compensated by Design Review success, orchestrator unit tests, and the raw decision=APPROVE captured from the agent's response)
