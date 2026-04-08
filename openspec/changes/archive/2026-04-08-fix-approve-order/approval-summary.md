# Approval Summary: fix-approve-order

**Generated**: 2026-04-08
**Branch**: fix-approve-order
**Status**: ⚠️ 1 unresolved high

## What Changed

 global/commands/specflow.approve.md (uncommitted — reordered Archive before Commit, conditional error handling)
 global/commands/specflow.design.md |  2 +-
 global/commands/specflow.md        |  2 +-
 + archived fix-validate-option artifacts (12 files, 231 insertions)

## Files Touched

- global/commands/specflow.approve.md (uncommitted)
- global/commands/specflow.design.md
- global/commands/specflow.md
- openspec/changes/archive/2026-04-08-fix-validate-option/* (10 files)
- openspec/specs/validate-command-syntax/spec.md

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
| Unresolved high    | 1     |
| New high (later)   | 1     |
| Total rounds       | 2     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Archive executes before commit | Yes | global/commands/specflow.approve.md |
| 2 | Archive failure does not block commit | Yes | global/commands/specflow.approve.md |
| 3 | Commit diff includes archived state | Yes | global/commands/specflow.approve.md |

**Coverage Rate**: 3/3 (100%)

## Remaining Risks

- R2-F01: Archive now invalidates the later proposal reads used for commit and PR generation (severity: high)
- R1-F02: No regression coverage for the reordered approve flow (severity: medium)

## Human Checkpoints

- [ ] Verify that `openspec archive` actually moves files to `openspec/changes/archive/` and that the Commit section's `FEATURE_PROPOSAL` reference is pre-cached by Approval Summary before the archive runs
- [ ] Confirm that archive failure warning message is clear enough for users to know they need to run `openspec archive` manually
- [ ] Test the approve flow end-to-end: run `/specflow.approve` on a real change and verify the commit diff includes archived artifacts
