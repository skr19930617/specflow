# Approval Summary: refactor-split-runstate-into-corerunstate-and-localadapterrunstate

**Generated**: 2026-04-15T06:55:23Z
**Branch**: refactor-split-runstate-into-corerunstate-and-localadapterrunstate
**Status**: ✅ No unresolved high

## What Changed

```
 docs/architecture.md   |  6 +++---
 src/core/_helpers.ts   | 32 ++++++++++++++++++++++++-------
 src/core/advance.ts    | 11 ++++++-----
 src/core/resume.ts     | 12 ++++++------
 src/core/suspend.ts    | 12 ++++++------
 src/core/types.ts      |  9 +++++++--
 src/types/contracts.ts | 52 +++++++++++++++++++++++++++++++++++++++++++-------
 7 files changed, 98 insertions(+), 36 deletions(-)
```

Plus one new tracked file: `src/tests/run-state-partition.test.ts` (compile-time drift guard).

## Files Touched

**Modified**
- `docs/architecture.md`
- `src/core/_helpers.ts`
- `src/core/advance.ts`
- `src/core/resume.ts`
- `src/core/suspend.ts`
- `src/core/types.ts`
- `src/types/contracts.ts`

**Added**
- `src/tests/run-state-partition.test.ts`

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | CoreRunState exposes the 12 runtime-agnostic fields | Yes | src/types/contracts.ts |
| 2 | LocalRunState exposes the 6 local-adapter fields | Yes | src/types/contracts.ts |
| 3 | RunState remains the `CoreRunState & LocalRunState` intersection alias | Yes | src/types/contracts.ts |
| 4 | Disjoint and exhaustive keys pass the compile-time guard | Yes | src/tests/run-state-partition.test.ts, src/types/contracts.ts |
| 5 | Overlapping or missing keys break the TypeScript build | Yes | src/tests/run-state-partition.test.ts (verified via deliberate perturbation — see apply log) |
| 6 | Core functions that ignore local-adapter fields accept `CoreRunState` (via `<T extends CoreRunState = RunState>`) | Yes | src/core/advance.ts, src/core/suspend.ts, src/core/resume.ts, src/core/_helpers.ts |
| 7 | Local-aware functions keep access to local-adapter fields | Yes | (unchanged) src/core/start.ts, src/core/status.ts, src/core/get-field.ts, src/core/update-field.ts |

**Coverage Rate**: 7/7 (100%)

## Remaining Risks

**Deterministic risks (from impl review ledger):**
- R1-F02: REQUIRED_RUN_STATE_FIELDS still includes local-adapter keys (severity: low) — reviewer explicitly marked "No change required in this PR; tracked for the follow-up under Epic #127". Acknowledged in `src/core/_helpers.ts` JSDoc and in `design.md` Open Questions.

**Untested new files:** none.

**Uncovered criteria:** none.

## Human Checkpoints

- [ ] Verify `npm run typecheck` passes locally on your machine (the drift-guard assertion is the primary verification gate).
- [ ] Confirm that the intersection widening note and the drift-guard reference in `docs/architecture.md` match team documentation style before merge.
- [ ] Scan `src/bin/**` and `src/adapters/**` once more to confirm no caller needed to change (the generic default `T = RunState` preserves prior inference for every existing call site).
- [ ] Track the R1-F02 follow-up (relocate `REQUIRED_RUN_STATE_FIELDS` out of `src/core/_helpers.ts`) in the Epic #127 backlog so the "core depends only on CoreRunState" contract becomes fully enforced, not just type-level.
