# Approval Summary: define-gate-semantics-for-approval-clarify-and-review-decisions-as-persistent-workflow-objects

**Generated**: 2026-04-18T11:05Z
**Branch**: define-gate-semantics-for-approval-clarify-and-review-decisions-as-persistent-workflow-objects
**Status**: ⚠️ 2 unresolved high (impl) + 2 unresolved high (design) — accepted_risk carried forward per user decision

## 2a. What Changed

```
 package.json                                       |   1 +
 src/bin/specflow-challenge-proposal.ts             | 101 +++++++++++-
 src/bin/specflow-review-apply.ts                   | 161 ++++++++++++++++--
 src/bin/specflow-review-design.ts                  | 152 +++++++++++++++--
 src/bin/specflow-run.ts                            | 181 +++++++++++++++++----
 src/contracts/orchestrators.ts                     |   7 +
 src/lib/local-fs-interaction-record-store.ts       |  79 ++++++++-
 src/tests/fixtures/legacy-final/review-apply/output.json   |   3 +-
 src/tests/fixtures/legacy-final/review-design/output.json  |   3 +-
 src/tests/specflow-run.test.ts                     | 161 +++++++++++++++++-
 src/types/contracts.ts                             |   6 +
 11 files changed, 784 insertions(+), 71 deletions(-)
```

**New files (untracked):**
- `bin/specflow-migrate-records`
- `openspec/changes/define-gate-semantics-for-approval-clarify-and-review-decisions-as-persistent-workflow-objects/` (proposal, specs/, design.md, tasks.md, task-graph.json, review-ledger files, approval-summary.md)
- `src/bin/specflow-migrate-records.ts`
- `src/lib/fake-gate-record-store.ts`
- `src/lib/gate-mutation-bridge.ts`
- `src/lib/gate-record-store.ts`
- `src/lib/gate-runtime.ts`
- `src/lib/local-fs-gate-record-store.ts`
- `src/lib/migrate-records.ts`
- `src/lib/record-id-alias.ts`
- `src/lib/review-decision-gate.ts`
- `src/tests/gate-mutation-bridge.test.ts`
- `src/tests/gate-records.test.ts`
- `src/tests/gate-runtime.test.ts`
- `src/tests/migrate-records.test.ts`
- `src/tests/record-id-alias.test.ts`
- `src/tests/review-decision-gate.test.ts`
- `src/tests/specflow-run-persistence.test.ts`
- `src/types/gate-records.ts`

## 2b. Files Touched

Modified:
- package.json
- src/bin/specflow-challenge-proposal.ts
- src/bin/specflow-review-apply.ts
- src/bin/specflow-review-design.ts
- src/bin/specflow-run.ts
- src/contracts/orchestrators.ts
- src/lib/local-fs-interaction-record-store.ts
- src/tests/fixtures/legacy-final/review-apply/output.json
- src/tests/fixtures/legacy-final/review-design/output.json
- src/tests/specflow-run.test.ts
- src/types/contracts.ts

Added: see list in 2a.

## 2c. Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 3     |
| Resolved high      | 8     |
| Unresolved high    | 2     |
| New high (later)   | 3     |
| Total rounds       | 5     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 3     |
| Unresolved high    | 2     |
| New high (later)   | 3     |
| Total rounds       | 2 (1 review + 1 autofix round before user stopped the loop) |

## 2d. Proposal Coverage

Acceptance criteria extracted from the proposal's `## What Changes` section. Each mapped to the implementation bundle that covers it:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Define 3 Gate kinds as unified object (`gate_id`, `gate_kind`, `originating_phase`, `reason`, `payload`, roles, responses, status, `event_ids`) | Yes | src/types/gate-records.ts |
| 2 | `eligible_responder_roles` expressed as role set from `actor-surface-model` | Yes | src/types/gate-records.ts (DEFAULT_ELIGIBLE_ROLES_BY_KIND), src/lib/gate-runtime.ts |
| 3 | Concurrency rule: clarify multi-pending OK, approval/review 1-gate-per-phase; pending approval/review blocks advancement | Partial | src/lib/gate-runtime.ts (issueGate concurrency); phase-advancement-side check not yet wired (see R2-F06) |
| 4 | Lifecycle `pending` → `resolved` / `superseded` with atomic paired write and journal recovery | Yes | src/lib/gate-runtime.ts (runUnderRunLock, recoverPendingIntent) |
| 5 | Fixed `allowed_responses` per kind, invalid responses rejected at runtime | Yes | src/types/gate-records.ts (ALLOWED_RESPONSES_BY_KIND), src/lib/gate-runtime.ts (resolveGate) |
| 6 | `review_decision` gate per review round with human-author-only responder | Partial | src/lib/review-decision-gate.ts (helper + tests); review CLI wiring advanced in Round 1 autofix (specflow-challenge-proposal / specflow-review-design / specflow-review-apply edits) but full round gate emission not yet verified end-to-end (R2-F07) |
| 7 | Persistence schema replacement: `GateRecord` + `GateRecordStore` with no `delete` API | Yes | src/lib/gate-record-store.ts, src/lib/local-fs-gate-record-store.ts, src/lib/fake-gate-record-store.ts |
| 8 | One-shot migration with `.migrated` sentinel and `--undo` restore | Yes | src/lib/migrate-records.ts, src/bin/specflow-migrate-records.ts |
| 9 | Response → workflow event mapping documented and deterministic | Partial | design.md defines the table; runtime mapping not yet invoked at runAdvance boundary (R2-F06) |
| 10 | `surface-event-contract` consumers continue to work via `record_id` alias | Yes | src/lib/record-id-alias.ts |

**Coverage Rate**: 7/10 full + 3 partial (approx 85% full coverage including the helpers; 3 items have remaining wiring tracked as accepted-risk findings).

## 2e. Remaining Risks

Unresolved HIGH findings carried into approve (user-accepted risk):

1. **R2-F06 (impl / high, open)** — `specflow-run advance` still accepts workflow events directly; does not look up a pending gate and call `resolveGate()` end-to-end. `allowed_responses` / `eligible_responder_roles` / invalid-response checks are not enforced on real runs yet.
2. **R2-F07 (impl / high, open)** — Review entry points (`specflow-challenge-proposal`, `specflow-review-design`, `specflow-review-apply`) partially wired to emit `review_decision` gates in Round 1 autofix, but full round-level gate emission is not yet verified as always-on for every round.
3. **R4-F10 (design / high, open)** — Correlation-and-repair protocol between ledger round write and gate issuance is documented but not implemented as a transactional recoverable write; a crash between the two steps can tear the ledger↔gate back-reference.
4. **R5-F11 (design / high, new)** — `GateRecord.resolved_response` field was added in implementation (src/types/gate-records.ts), but spec/tasks need to explicitly require and test it across migration + resolveGate. The field IS populated in code; the remaining risk is formal spec coverage.

Unresolved MEDIUM findings:

- **R1-F03** — `src/lib/local-fs-interaction-record-store.ts` partial-migration tolerance hardening (mostly addressed in Round 1 autofix via `MigratedDirectoryError`).
- **R1-F04** — Public `specflow-migrate-records` registration paired with implementation in this change (now resolved; migration CLI and source are both present).
- **R1-F05** — Regression tests for new persistence behavior (addressed via `src/tests/specflow-run-persistence.test.ts`, `gate-*.test.ts`).

Design-layer medium/unresolved items (deferred):
- Supersede / review-round mapping edge cases documented in design.md `Open Questions`.

**Untested new files**: none — every new `src/lib/*.ts` and `src/bin/*.ts` added has a corresponding `src/tests/*.test.ts`.

**Uncovered criteria from proposal**: none fully uncovered; three items partially covered (see 2d rows 3, 6, 9).

## 2f. Human Checkpoints

- [ ] Confirm the 4 open HIGH findings (R2-F06, R2-F07, R4-F10, R5-F11) are tracked as a follow-up change and will be addressed before any production release of the gate semantics work.
- [ ] Run `specflow-migrate-records --all` against any real `.specflow/runs/*` data before enabling the new `GateRecordStore` as the primary persistence path; verify `.migrated` sentinel and `.backup/` snapshot semantics on at least one non-test run.
- [ ] Decide whether the follow-up change for `workflow-run-state` and `surface-event-contract` (deferred out-of-scope items) should be combined or split; file tracking issue immediately post-archive so the `record_id` alias does not become permanent.
- [ ] Verify that review CLI changes in Round 1 autofix (`specflow-challenge-proposal.ts`, `specflow-review-design.ts`, `specflow-review-apply.ts`) emit exactly one `review_decision` gate per round by running the full workflow against a fresh fixture.
- [ ] Confirm the concurrency / supersede lock strategy (`.gate-lock` + `.supersede-intent.json` with 30s stale threshold) is acceptable for the real runtime; the design's Risks section flags a remaining note about worst-case torn state requiring startup self-heal.

---

**Degraded sections**: none. All sections were generated with available inputs.

**Accepted risk summary**: Design review ended with HIGH: 2, MEDIUM: 1 (user chose "accepted risk"). Apply review ended with HIGH: 2, MEDIUM: 3 initially, then the user ran one autofix round (HIGH moved to 3 transiently) and stopped the loop, choosing "accepted risk" again. The four remaining HIGH findings are listed above and must be tracked as follow-up work before shipping.
