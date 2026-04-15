# Approval Summary: normalize-task-statuses-and-re-render-tasks-md-when-bundles-complete

**Generated**: 2026-04-15T06:02:15Z
**Branch**: normalize-task-statuses-and-re-render-tasks-md-when-bundles-complete
**Status**: ✅ No unresolved high

## What Changed

```
 package.json                        |   1 +
 src/contracts/orchestrators.ts      |   8 ++
 src/lib/schemas.ts                  |  35 ++++++
 src/lib/task-planner/index.ts       |  15 ++-
 src/lib/task-planner/status.ts      |  90 ++++++++++++++-
 src/tests/task-planner-core.test.ts | 220 ++++++++++++++++++++++++++++++++++++
 src/types/contracts.ts              |   1 +
 7 files changed, 365 insertions(+), 5 deletions(-)
```

_Also adds 4 untracked files that `git add -A` will stage on commit: `bin/specflow-advance-bundle`, `src/bin/specflow-advance-bundle.ts`, `src/lib/task-planner/advance.ts`, `src/tests/advance-bundle.test.ts`._

## Files Touched

```
package.json
src/contracts/orchestrators.ts
src/lib/schemas.ts
src/lib/task-planner/index.ts
src/lib/task-planner/status.ts
src/tests/task-planner-core.test.ts
src/types/contracts.ts
```

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

Acceptance criteria come from the MODIFIED `task-planner` spec (scenarios inside the "Apply phase writes back bundle status to task graph" requirement, [openspec/changes/.../specs/task-planner/spec.md](openspec/changes/normalize-task-statuses-and-re-render-tasks-md-when-bundles-complete/specs/task-planner/spec.md)).

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Status transitions from pending to in_progress (non-terminal preserves child statuses) | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 2 | Status transitions from in_progress to done (children normalized to done) | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 3 | Invalid status transition is rejected (e.g., done → pending) | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 4 | Bundle → done normalizes pending child tasks and reports coercions | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 5 | Bundle → skipped normalizes child tasks | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 6 | Normalization force-coerces conflicting prior terminal child status | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 7 | Terminal transition on empty bundle is a no-op for children | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 8 | Audit log suppressed when coercion does not change status | Yes | src/lib/task-planner/advance.ts, src/tests/advance-bundle.test.ts |
| 9 | updateBundleStatus does not mutate input graph | Yes | src/lib/task-planner/status.ts, src/tests/task-planner-core.test.ts |
| 10 | tasks.md re-rendered from normalized graph after terminal transition | Yes | src/lib/task-planner/advance.ts, src/tests/task-planner-core.test.ts, src/tests/advance-bundle.test.ts |
| 11 | Atomic persistence avoids mismatched intermediate state | Yes | src/lib/task-planner/advance.ts (writer seam), src/lib/fs.ts#atomicWriteText (existing), src/tests/advance-bundle.test.ts |

**Coverage Rate**: 11/11 (100%)

## Remaining Risks

**Deterministic risks (from review ledger — all LOW, explicitly marked optional by the reviewer):**

- R1-F01: Atomicity test exercises atomicWriteText directly, not the CLI wiring (severity: low)
- R1-F02: CLI usage/parse errors do not emit advance-bundle-result JSON (severity: low)
- R1-F03: Defensive renameSync type check is dead weight (severity: low)

**Untested new files:** none. (No newly-added tracked `.sh` or `.md` files fall outside of review finding `file` references.)

**Uncovered criteria:** none.

## Human Checkpoints

- [ ] Confirm that emitting audit log lines on stderr (vs. a structured file sink) matches the operational expectation for this codebase — the spec only requires a "structured log entry", not a specific transport.
- [ ] Verify that the new `specflow-advance-bundle` CLI surface is the right vehicle for the apply-phase caller integration, vs. invoking `advanceBundleStatus()` directly from another binary later.
- [ ] Decide whether to address the 3 LOW findings (CLI error-envelope unification, end-to-end CLI atomicity test, removal of defensive `typeof renameSync` check) in this PR or in a follow-up.
- [ ] Validate the atomic-write guarantee on your target deployment OS — the current implementation relies on `renameSync` being atomic within a single filesystem, which is true on POSIX and NTFS but worth confirming for any cross-filesystem deployment.
