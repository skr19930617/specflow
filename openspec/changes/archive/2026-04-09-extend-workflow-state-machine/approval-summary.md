# Approval Summary: extend-workflow-state-machine

**Generated**: 2026-04-09T04:04:23Z
**Branch**: extend-workflow-state-machine
**Status**: ⚠️ 1 unresolved high (design review — F10: slash commands don't call specflow-run)

## What Changed

```
 bin/specflow-run                    | 248 ++++++++++++++++++++
 global/commands/specflow.approve.md |  38 ++--
 global/workflow/state-machine.json  |  16 ++
 tests/test-specflow-run.sh          | 196 ++++++++++++++++
 README.md                           |  52 +++++
 docs/architecture.md                | new
```

## Files Touched

- bin/specflow-run
- global/commands/specflow.approve.md
- global/workflow/state-machine.json
- tests/test-specflow-run.sh
- README.md
- docs/architecture.md

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 4     |
| Unresolved high    | 1     |
| New high (later)   | 4     |
| Total rounds       | 5     |

### Impl Review
⚠️ No impl review data available (impl review was not run separately — implementation was done after design review)

## Proposal Coverage

| # | Criterion | Covered? | Mapped Files |
|---|-----------|----------|--------------|
| 1 | state-machine.json models mainline and key revision/branch paths | Yes | global/workflow/state-machine.json |
| 2 | run.json has enough metadata for multi-project and resumable execution | Yes | bin/specflow-run |
| 3 | Workflow state and UI binding metadata clearly separated | Yes | docs/architecture.md, README.md |
| 4 | Command surface and workflow core closer to 1:1 conceptually | Partial | global/workflow/state-machine.json (branch paths modeled but not wired to slash commands) |
| 5 | README mentions the workflow core explicitly | Yes | README.md |

**Coverage Rate**: 4/5 (80%)

## Remaining Risks

- F10: Slash commands don't call specflow-run start/advance yet (severity: high) — normal flow won't create run.json
- F9: project_id and repo_name are identical (severity: medium) — both reserved for future divergence
- F11: update-field has field whitelist (severity: medium) — **resolved in implementation** (whitelist enforced)
- ⚠️ Uncovered criterion: Command surface and workflow core not fully 1:1 (branch paths not wired to slash commands per D6)

## Human Checkpoints

- [ ] Verify `specflow-run start` correctly auto-detects project_id from git remote in both HTTPS and SSH URL formats
- [ ] Confirm that the `revise` → `revise_design`/`revise_apply` rename doesn't break any external consumers beyond the listed callers
- [ ] Test that pre-2.0 run.json files produce a clear, actionable error message when accessed
- [ ] Verify docs/architecture.md accurately reflects the implemented behavior (especially branch-path wording)
- [ ] Decide whether F10 (slash command wiring to specflow-run) should be tracked as a follow-up issue
