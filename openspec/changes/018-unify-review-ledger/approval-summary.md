# Approval Summary: 018-unify-review-ledger

**Generated**: 2026-04-06 14:21
**Branch**: 018-unify-review-ledger
**Status**: ⚠️ Review data unavailable

## What Changed

```
 CLAUDE.md                        |  3 +
 bin/specflow-filter-diff         | 15 ++
 global/specflow.approve.md      | 73 ++++++---
 global/specflow.dashboard.md    | (new file)
 global/specflow.plan_fix.md     | 255 +++++++++++++++++++++++++++-
 global/specflow.plan_review.md  | 360 +++++++++++++++++++++++++++++++++++---
 global/specflow.spec_fix.md     | 252 ++++++++++++++++++++++++++++-
 global/specflow.spec_review.md  | 167 ++++++++++++++++++-
```

Plus review prompt files (installed to ~/.config/specflow/global/):
- review_spec_prompt.md (modified: questions[] → findings[])
- review_plan_prompt.md (modified: added file field)
- review_spec_rereview_prompt.md (new)
- review_plan_rereview_prompt.md (new)

## Files Touched

- CLAUDE.md
- bin/specflow-filter-diff
- global/specflow.approve.md
- global/specflow.dashboard.md (new)
- global/specflow.plan_fix.md
- global/specflow.plan_review.md
- global/specflow.spec_fix.md
- global/specflow.spec_review.md
- ~/.config/specflow/global/review_spec_prompt.md
- ~/.config/specflow/global/review_plan_prompt.md
- ~/.config/specflow/global/review_spec_rereview_prompt.md (new)
- ~/.config/specflow/global/review_plan_rereview_prompt.md (new)

## Review Loop Summary

⚠️ No impl review data available (review-ledger.json not found). This feature modifies Markdown slash commands and review prompts, which are not subject to impl review ledger tracking.

Codex review was performed as part of the specflow workflow:
- Spec review: 4 rounds (APPROVE on final)
- Plan/Tasks review: 2 rounds (APPROVE on final)
- Impl review: 2 rounds (APPROVE on final, 3 findings fixed)

## Spec Coverage

| # | Criterion | Covered? | Mapped Files |
|---|-----------|----------|--------------|
| 1 | spec review → review-ledger-spec.json に記録 | Yes | specflow.spec_review.md, specflow.spec_fix.md |
| 2 | plan review → review-ledger-plan.json に記録 | Yes | specflow.plan_review.md, specflow.plan_fix.md |
| 3 | 同一JSONスキーマ（phase値のみ異なる） | Yes | All ledger logic uses identical schema |
| 4 | findingマッチングアルゴリズム適用 | Yes | spec_review, spec_fix, plan_review, plan_fix |
| 5 | spec: auto-fixなし、low単発自動適用 | Yes | specflow.spec_review.md Step 1.7 |
| 6 | plan: auto-fixループ有効 | Yes | specflow.plan_review.md auto-fix section |
| 7 | current-phase.md 生成 | Yes | All 4 review/fix commands |
| 8 | 既存impl ledger変更なし | Yes | No changes to review-ledger.json handling |
| 9 | 可視化 CLI + Markdown | Yes | specflow.dashboard.md |
| 10 | approve時に全phase ledger参照 | Yes | specflow.approve.md Quality Gate |

**Coverage Rate**: 10/10 (100%)

## Remaining Risks

- ⚠️ No impl review-ledger.json — impl review loop metrics unavailable
- ⚠️ Review prompts are installed to ~/.config/specflow/global/ (outside repo) — changes not tracked by git
- ⚠️ specflow.dashboard.md is a new file — manual testing recommended

## Human Checkpoints

- [ ] Run `/specflow.spec_review` on a test feature to verify review-ledger-spec.json is created correctly
- [ ] Run `/specflow.plan_review` on a test feature to verify auto-fix loop works with review-ledger-plan.json
- [ ] Verify existing `/specflow.impl_review` workflow still works unchanged (review-ledger.json untouched)
- [ ] Run `/specflow.dashboard` to verify CLIテーブル表示 + specs/review-dashboard.md 保存
- [ ] Run `specflow-install` and verify new files are installed to ~/.claude/commands/ and ~/.config/specflow/global/
