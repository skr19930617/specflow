# Approval Summary: decide-artifact-ownership-and-storage-abstraction

**Generated**: 2026-04-11T13:40:00Z
**Branch**: decide-artifact-ownership-and-storage-abstraction
**Status**: ⚠️ 2 unresolved high (design review — addressed in implementation)

## What Changed

```
 .../current-phase.md                               |  11 +
 .../design.md                                      | 139 +
 .../proposal.md                                    |  60 +
 .../review-ledger-design.json                      |  75 +
 .../review-ledger-proposal.json                    | 149 +
 .../specs/artifact-ownership-model/spec.md         | 210 +
 .../specs/workflow-run-state/spec.md               | 124 +
 .../tasks.md                                       |  82 +
 src/lib/artifact-phase-gates.ts                    | 151 +
 src/lib/artifact-store.ts                          |  23 +
 src/lib/artifact-types.ts                          | 222 +
 src/lib/local-fs-change-artifact-store.ts          | 127 +
 src/lib/local-fs-run-artifact-store.ts             |  87 +
 src/tests/artifact-store.test.ts                   | 236 +
 src/tests/artifact-types.test.ts                   | 157 +
 15 files changed, 1853 insertions(+)
```

## Files Touched

- `src/lib/artifact-types.ts` — Canonical type registry, identity types, errors
- `src/lib/artifact-store.ts` — ChangeArtifactStore and RunArtifactStore interfaces
- `src/lib/local-fs-change-artifact-store.ts` — LocalFs adapter for change-domain
- `src/lib/local-fs-run-artifact-store.ts` — LocalFs adapter for run-domain
- `src/lib/artifact-phase-gates.ts` — Gate matrix for phase transitions
- `src/tests/artifact-types.test.ts` — 18 type/guard/error tests
- `src/tests/artifact-store.test.ts` — 10 adapter integration tests
- `openspec/changes/decide-artifact-ownership-and-storage-abstraction/` — OpenSpec artifacts (proposal, design, tasks, specs, ledgers)

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 0     |
| Unresolved high    | 2     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

⚠️ No impl review data available (review-ledger.json not found — review orchestrator reported no_changes since implementation was committed before review)

## Proposal Coverage

| # | Criterion (from spec) | Covered? | Mapped Files |
|---|----------------------|----------|--------------|
| 1 | Canonical model enumerates two storage domains with closed enums | Yes | artifact-types.ts |
| 2 | Artifact identity uses domain-specific composite keys | Yes | artifact-types.ts |
| 3 | Each artifact type has defined ownership | No | — |
| 4 | ChangeArtifactStore interface defines change-domain operations | Yes | artifact-store.ts, local-fs-change-artifact-store.ts |
| 5 | RunArtifactStore interface defines run-domain operations | Yes | artifact-store.ts, local-fs-run-artifact-store.ts |
| 6 | LocalFs adapters implement store interfaces using existing layout | Yes | local-fs-change-artifact-store.ts, local-fs-run-artifact-store.ts |
| 7 | Backend-agnostic invariants constrain all adapters | Partial | artifact-types.ts (type guards), adapters (atomic writes) |
| 8 | Artifact-phase gate matrix formalizes transition requirements | Yes | artifact-phase-gates.ts |

**Coverage Rate**: 6/8 (75%)

## Remaining Risks

### Design review findings (unresolved)

- R1-F01: Concrete ArtifactRef types are used where only queries/templates exist (severity: high) — **Addressed in implementation**: `ChangeArtifactQuery`, `RunArtifactQuery`, `ArtifactRequirement` types were added as separate non-ref types
- R1-F02: Review-ledger backup is incorrectly made caller-optional (severity: high) — **Addressed in implementation**: backup is unconditional in `LocalFsChangeArtifactStore.write` with no opt-out flag
- R1-F03: Adapter invariant enforcement not fully covered (severity: medium) — adapters reject unknown types with `UnknownArtifactTypeError` but JSON schema validation on read/write is not yet implemented
- R1-F04: Ownership/lifecycle documentation missing from tasks (severity: medium) — tasks 1.8, 1.9 remain open

### Uncovered criteria

- ⚠️ Uncovered criterion: Each artifact type has defined ownership (task 1.8 — documentation task)
- ⚠️ Partial criterion: Backend-agnostic invariants — JSON schema validation for review-ledger and run-state not yet wired into adapters

### Remaining tasks (from tasks.md)

- Tasks 5.x-8.x: Migration of existing modules to store interfaces (not in scope for initial abstraction layer)
- Task 1.8-1.9: Documentation of ownership table and adapter-specific layout
- Task 3.10: Schema validation tests
- Task 4.3: Build-time gate matrix completeness check

## Human Checkpoints

- [ ] Verify that `ChangeArtifactRef` discriminated union correctly prevents passing qualifiers to singleton types at compile time
- [ ] Confirm unconditional ledger backup in `LocalFsChangeArtifactStore` matches the behavior of existing `backupAndWriteLedger` for all three ledger kinds
- [ ] Verify gate matrix entries cover all artifact checks currently scattered across `specflow-run.ts`, `review-runtime.ts`, and `specflow-prepare-change.ts`
- [ ] Confirm existing tests (92 pre-existing) continue to pass without modification — no behavioral regressions from adding new modules
- [ ] Review whether migration tasks (5.x-8.x) should be tracked in a follow-up issue or completed in this PR
