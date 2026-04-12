# Approval Summary: move-proposal-source-normalization-to-runtime

**Generated**: 2026-04-12
**Branch**: move-proposal-source-normalization-to-runtime
**Status**: ⚠️ 1 unresolved high (in ledger — fixed in code but not re-reviewed)

## What Changed

 src/bin/specflow-fetch-issue.ts            |  10 +-
 src/bin/specflow-prepare-change.ts         | 187 +++++++++--
 src/contracts/command-bodies.ts            |   2 +-
 src/contracts/commands.ts                  |   2 +-
 src/lib/issue-url.ts                       |  44 +++
 src/tests/command-order.test.ts            |   7 +-
 src/tests/generation.test.ts               |   8 +-
 src/tests/issue-url.test.ts                |  67 ++++
 src/tests/prepare-change-raw-input.test.ts | 494 +++++++++++++++++++++++++++++
 9 files changed, 772 insertions(+), 49 deletions(-)

## Files Touched

- src/bin/specflow-fetch-issue.ts
- src/bin/specflow-prepare-change.ts
- src/contracts/command-bodies.ts
- src/contracts/commands.ts
- src/lib/issue-url.ts
- src/tests/command-order.test.ts
- src/tests/generation.test.ts
- src/tests/issue-url.test.ts
- src/tests/prepare-change-raw-input.test.ts

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 5     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 3     |
| Unresolved high    | 1     |
| New high (later)   | 4     |
| Total rounds       | 9     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | `/specflow` guide no longer requires writing `/tmp/specflow-proposal-source.json` | Yes | src/contracts/command-bodies.ts, src/contracts/commands.ts |
| 2 | Source normalization is performed by runtime/orchestrator | Yes | src/bin/specflow-prepare-change.ts, src/lib/issue-url.ts |
| 3 | Temp file usage confined to internal implementation | Yes | src/bin/specflow-prepare-change.ts |
| 4 | Change-id derivation and seeded proposal creation work as before | Yes | src/bin/specflow-prepare-change.ts |
| 5 | Run-state source persistence maintained | Yes | src/bin/specflow-prepare-change.ts |
| 6 | Docs/contract/spec updated for new responsibility | Yes | src/contracts/command-bodies.ts, src/contracts/commands.ts |

**Coverage Rate**: 6/6 (100%)

## Remaining Risks

- R8-F01: Shared URL matcher breaks the standalone fetch CLI contract (severity: high) — **Fixed in code** (split into strict/lenient patterns) but ledger not re-reviewed
- R8-F02: Repository lookup happens before documented argument validation (severity: medium) — **Fixed in code** (projectRoot() moved after validation)
- R9-F01: The explicit empty-input error path is still untested (severity: medium) — **Acknowledged**: empty string args are correctly validated but dedicated test was not added

## Human Checkpoints

- [ ] Verify `specflow-fetch-issue` still accepts trailing-path issue URLs (backward compat with lenient pattern)
- [ ] Test `specflow-prepare-change` with a real GitHub issue URL to confirm end-to-end flow
- [ ] Confirm the generated `specflow.md` guide reads correctly for a first-time user
- [ ] Verify the deprecation warning appears on stderr when using `--source-file`
