# Approval Summary: 017-spec-decompose-command

**Generated**: 2026-04-06 11:56
**Branch**: 017-spec-decompose-command
**Status**: ✅ No unresolved high

## What Changed

```
 CLAUDE.md                        |  3 +-
 bin/specflow-create-sub-issues   | 270 +++++++++++++++++++++
 global/specflow.decompose.md     | 220 +++++++++++++++++
```

## Files Touched

- CLAUDE.md (modified — added decompose command entry)
- bin/specflow-create-sub-issues (new — helper script for batch issue creation)
- global/specflow.decompose.md (new — slash command for spec decomposition)
- specs/017-spec-decompose-command/ (new — spec, plan, tasks, research, data-model, quickstart, checklists)

## Review Loop Summary

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 5     |
| Unresolved high    | 0     |
| New high (later)   | 3     |
| Total rounds       | 4     |

## Spec Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Issue-linked spec → AI analysis → decomposition proposal | Yes | global/specflow.decompose.md (Step 2) |
| 2 | User confirms → sub-issues created with phase-prefixed titles, labels, parent ref | Yes | global/specflow.decompose.md (Step 4), bin/specflow-create-sub-issues |
| 3 | Summary comment posted on parent issue with ordered sub-issue links | Yes | bin/specflow-create-sub-issues, global/specflow.decompose.md (Step 5) |
| 4 | API error → retain created issues, report partial, offer retry | Yes | bin/specflow-create-sub-issues (partial failure handling), global/specflow.decompose.md (Step 5) |
| 5 | Inline spec too large → display warning with areas and guidance | Yes | global/specflow.decompose.md (Step 3, MODE=inline) |
| 6 | Well-scoped spec → confirm no decomposition needed | Yes | global/specflow.decompose.md (Step 2, outcome b/c) |
| 7 | User cancels → no issues created | Yes | global/specflow.decompose.md (Step 3, Cancel option) |
| 8 | Closed parent issue → proceed normally | Yes | global/specflow.decompose.md (Step 4, parent validation) |
| 9 | Deleted parent issue → report error | Yes | global/specflow.decompose.md (Step 4, parent validation) |
| 10 | Sub-issue body: description, requirements, acceptance criteria, parent link, Phase X of Y, Decomposition ID | Yes | bin/specflow-create-sub-issues (FR-009 template) |
| 11 | Phase labels auto-created, no milestones | Yes | bin/specflow-create-sub-issues (label creation loop) |
| 12 | Idempotent retry via decomposition ID marker | Yes | bin/specflow-create-sub-issues (duplicate guard) |

**Coverage Rate**: 12/12 (100%)

## Remaining Risks

- R4-F01: Retry accumulation only covers one retry (severity: medium) — multiple consecutive partial failures may result in incomplete final summary comment

## Human Checkpoints

- [ ] Verify `specflow-install` copies `global/specflow.decompose.md` to `~/.config/specflow/global/` and `bin/specflow-create-sub-issues` to PATH
- [ ] Test `/specflow.decompose` on a real multi-area spec from a GitHub issue — confirm sub-issues have correct format
- [ ] Test cancel flow — ensure no GitHub API calls are made when user cancels
- [ ] Test inline spec path — ensure warning is displayed (not issue creation) when no issue JSON exists
- [ ] Review `bin/specflow-create-sub-issues` Python subprocess calls for edge cases with special characters in titles
