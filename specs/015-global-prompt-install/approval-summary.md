# Approval Summary: 015-global-prompt-install

**Generated**: 2026-04-05
**Branch**: 015-global-prompt-install
**Status**: ✅ No unresolved high

## What Changed

```
 CLAUDE.md                                          |  1 +
 bin/specflow-init                                  |  4 -
 global/review_impl_prompt.md                       | 34 ++ (new)
 global/review_impl_rereview_prompt.md              | 88 ++ (new)
 global/review_plan_prompt.md                       | 62 ++ (new)
 global/review_spec_prompt.md                       | 70 ++ (new)
 global/specflow.fix.md                             | 12 +-
 global/specflow.impl_review.md                     |  2 +-
 global/specflow.plan_fix.md                        |  2 +-
 global/specflow.plan_review.md                     |  2 +-
 global/specflow.spec_fix.md                        |  2 +-
 global/specflow.spec_review.md                     |  2 +-
 template/.specflow/review_impl_prompt.txt          | 33 -- (deleted)
 template/.specflow/review_impl_rereview_prompt.txt | 87 -- (deleted)
 template/.specflow/review_plan_prompt.txt          | 61 -- (deleted)
 template/.specflow/review_spec_prompt.txt          | 69 -- (deleted)
```

## Files Touched

- CLAUDE.md
- bin/specflow-init
- global/review_impl_prompt.md (new)
- global/review_impl_rereview_prompt.md (new)
- global/review_plan_prompt.md (new)
- global/review_spec_prompt.md (new)
- global/specflow.fix.md
- global/specflow.impl_review.md
- global/specflow.plan_fix.md
- global/specflow.plan_review.md
- global/specflow.spec_fix.md
- global/specflow.spec_review.md
- template/.specflow/review_impl_prompt.txt (deleted)
- template/.specflow/review_impl_rereview_prompt.txt (deleted)
- template/.specflow/review_plan_prompt.txt (deleted)
- template/.specflow/review_spec_prompt.txt (deleted)

## Review Loop Summary

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

## Spec Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| FR-001 | prompt を ~/.config/specflow/global/ から読み込む | Yes | global/specflow.{spec_review,spec_fix,plan_review,plan_fix,impl_review,fix}.md |
| FR-002 | 拡張子 .txt → .md | Yes | global/review_*_prompt.md (new), template/.specflow/*.txt (deleted) |
| FR-003 | コマンドファイルの参照パスを更新 | Yes | global/specflow.{spec_review,spec_fix,plan_review,plan_fix,impl_review,fix}.md |
| FR-004 | prompt 不在時にエラーメッセージ表示 | Yes | global/specflow.{spec_review,spec_fix,plan_review,plan_fix,impl_review,fix}.md |
| FR-005 | 内容保持のまま .md 変換 | Yes | global/review_*_prompt.md |
| FR-006 | specflow リポジトリから prompt 除去 | Yes | template/.specflow/*.txt (deleted), bin/specflow-init |

**Coverage Rate**: 6/6 (100%)

## Remaining Risks

- なし（全 findings resolved、全 FR カバー済み）

## Human Checkpoints

- [ ] `specflow-install` 実行後に `~/.config/specflow/global/review_spec_prompt.md` が存在するか確認
- [ ] `/specflow.spec_review` を実際に実行し、グローバル prompt が正しく読み込まれるか確認
- [ ] 新規ディレクトリで `specflow-init` を実行し、`.specflow/` に prompt ファイルが含まれないことを確認
- [ ] `/specflow.fix` を ledger あり/なしの両パターンで実行し、正しい prompt が使われるか確認
