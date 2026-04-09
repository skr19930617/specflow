# Approval Summary: design-orchestrator-extraction

**Generated**: 2026-04-09T07:12:08Z
**Branch**: design-orchestrator-extraction
**Status**: ✅ No unresolved high

## What Changed

```
 global/commands/specflow.design.md        |  76 +++--
 global/commands/specflow.fix_design.md    | 313 ++++++---------------
 global/commands/specflow.review_design.md | 447 +++++++++++-------------------
 lib/specflow-ledger.sh                    |  26 +-
 bin/specflow-design-artifacts             | 120 +++++++  (new)
 bin/specflow-review-design                | 647 ++++++++++++++++++++++++++++  (new)
 global/prompts/fix_design_prompt.md       |  19 +  (new)
```

## Files Touched

- `lib/specflow-ledger.sh` — Added `ledger_init` function, removed `readonly`
- `bin/specflow-design-artifacts` — New: artifact dependency loop orchestrator
- `bin/specflow-review-design` — New: design review orchestrator (review, fix-review, autofix-loop)
- `global/prompts/fix_design_prompt.md` — New: design fix prompt for autofix-loop
- `global/commands/specflow.design.md` — Simplified to thin wrapper calling orchestrators
- `global/commands/specflow.fix_design.md` — Simplified to thin wrapper calling orchestrators
- `global/commands/specflow.review_design.md` — Simplified to thin wrapper calling orchestrators

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 8     |
| Unresolved high    | 0     |
| New high (later)   | 7     |
| Total rounds       | 4     |

### Impl Review
⚠️ No impl review data available (review skipped by user).

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Artifact dependency loop runs deterministically in Bash | Yes | bin/specflow-design-artifacts |
| 2 | Design ledger updates handled entirely by Bash script | Yes | bin/specflow-review-design, lib/specflow-ledger.sh |
| 3 | Re-review classification logic testable independently | Yes | bin/specflow-review-design (uses lib/specflow-ledger.sh ledger_match_rereview) |
| 4 | design and fix_design slash commands are thin wrappers | Yes | global/commands/specflow.design.md, specflow.fix_design.md, specflow.review_design.md |
| 5 | Existing user-facing command interface unchanged | Yes | All slash commands preserve AskUserQuestion patterns |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

- R4-F10: Simplified /specflow.design wrapper does not define blocked or invalid-status handling (severity: medium)
- R4-F12: Artifact-loop task contract does not preserve instruction constraints (severity: medium)
- R4-F13: Risk section still describes the abandoned JSONL streaming model (severity: medium)
- ⚠️ New file not mentioned in review: bin/specflow-design-artifacts
- ⚠️ New file not mentioned in review: bin/specflow-review-design
- ⚠️ New file not mentioned in review: global/prompts/fix_design_prompt.md

## Human Checkpoints

- [ ] Verify `specflow-review-apply` backward compatibility by running an existing apply-side review on a test change
- [ ] Run `/specflow.design` on a new change to confirm artifact loop works with one-at-a-time `next` invocations
- [ ] Verify `ledger_init` does not affect existing `review-ledger.json` files when sourced by `specflow-review-apply`
- [ ] Test corrupt ledger recovery: create a corrupt `review-ledger-design.json` and verify `--reset-ledger` flag works
- [ ] Run `specflow-install` and confirm `fix_design_prompt.md` is deployed to `~/.config/specflow/global/prompts/`
