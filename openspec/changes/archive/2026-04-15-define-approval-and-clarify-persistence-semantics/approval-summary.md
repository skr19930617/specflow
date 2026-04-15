# Approval Summary: define-approval-and-clarify-persistence-semantics

**Generated**: 2026-04-15T03:50:00Z
**Branch**: define-approval-and-clarify-persistence-semantics
**Status**: ✅ No unresolved high

## What Changed

```
 .../surface-events/approval-payload.schema.json    |   7 +-
 .../clarify-request-payload.schema.json            |   7 +-
 .../clarify-response-payload.schema.json           |   7 +-
 .../surface-events/reject-payload.schema.json      |   5 +
 src/contracts/surface-events.ts                    |   8 +
 src/core/advance.ts                                | 245 ++++++++++++++++++++-
 src/core/types.ts                                  |  14 +-
 src/tests/surface-event-schema-drift.test.ts       |   3 +
 src/types/contracts.ts                             |   6 +
 9 files changed, 287 insertions(+), 15 deletions(-)
```

New files (untracked):
- `assets/global/schemas/interaction-records/approval-record.schema.json`
- `assets/global/schemas/interaction-records/clarify-record.schema.json`
- `src/types/interaction-records.ts`
- `src/lib/interaction-record-store.ts`
- `src/lib/local-fs-interaction-record-store.ts`
- `src/lib/in-memory-interaction-record-store.ts`
- `src/tests/interaction-records.test.ts`
- `src/tests/advance-records.test.ts`

## Files Touched

assets/global/schemas/surface-events/approval-payload.schema.json
assets/global/schemas/surface-events/clarify-request-payload.schema.json
assets/global/schemas/surface-events/clarify-response-payload.schema.json
assets/global/schemas/surface-events/reject-payload.schema.json
assets/global/schemas/interaction-records/approval-record.schema.json (new)
assets/global/schemas/interaction-records/clarify-record.schema.json (new)
src/contracts/surface-events.ts
src/core/advance.ts
src/core/types.ts
src/types/contracts.ts
src/types/interaction-records.ts (new)
src/lib/interaction-record-store.ts (new)
src/lib/local-fs-interaction-record-store.ts (new)
src/lib/in-memory-interaction-record-store.ts (new)
src/tests/surface-event-schema-drift.test.ts
src/tests/interaction-records.test.ts (new)
src/tests/advance-records.test.ts (new)

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 3     |
| Resolved high      | 3     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 2     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 3     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | ApprovalRecord created on approval-gated phase entry | Yes | src/core/advance.ts, src/types/interaction-records.ts |
| 2 | ApprovalRecord updated on decision (approved/rejected) | Yes | src/core/advance.ts |
| 3 | ClarifyRecord created on clarify question issuance | Yes | src/core/advance.ts, src/types/interaction-records.ts |
| 4 | ClarifyRecord auto-resolved on response receipt | Yes | src/core/advance.ts |
| 5 | InteractionRecordStore interface with write/read/list/delete | Yes | src/lib/interaction-record-store.ts |
| 6 | LocalFsInteractionRecordStore with atomic writes | Yes | src/lib/local-fs-interaction-record-store.ts |
| 7 | Records stored under .specflow/runs/<runId>/records/ | Yes | src/lib/local-fs-interaction-record-store.ts |
| 8 | Run deletion cascades to records | Yes | filesystem layout (child directory) |
| 9 | Core runtime creates records synchronously during transitions | Yes | src/core/advance.ts |
| 10 | CLI entry points inject InteractionRecordStore | No | — |
| 11 | RunHistoryEntry optional record_ref field | Yes | src/types/contracts.ts, src/core/advance.ts |
| 12 | Surface event payloads include record_id | Yes | src/contracts/surface-events.ts, JSON schemas |
| 13 | Event-to-record cardinality is N:1 | Yes | src/core/advance.ts (event_ids array) |
| 14 | Backward compat: records undefined skips creation | Yes | src/core/advance.ts, src/tests/advance-records.test.ts |

**Coverage Rate**: 13/14 (93%)

## Remaining Risks

1. **R2-F06 (design, medium)**: No task for CLI entry point wiring of InteractionRecordStore — `src/bin/specflow-run.ts` does not yet construct and inject `LocalFsInteractionRecordStore` into the advance command. Records will be `undefined` in production until this wiring is added.

## Human Checkpoints

- [ ] Verify `src/bin/specflow-run.ts` advance subcommand is updated to inject `LocalFsInteractionRecordStore` (currently missing — R2-F06)
- [ ] Confirm JSON Schema files under `assets/global/schemas/interaction-records/` are included in the distribution bundle after build
- [ ] Test end-to-end: run a specflow workflow through an approval gate and verify `.specflow/runs/<runId>/records/` contains the expected record files
- [ ] Verify that existing runs without `record_ref` in history entries still parse correctly (backward compat)
