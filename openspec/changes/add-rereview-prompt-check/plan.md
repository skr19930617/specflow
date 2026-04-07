# Plan: Re-review プロンプトの欠落追加

## 概要

`global/prompts/` に欠落している2つの rereview プロンプトファイルを作成する。既存の `review_impl_rereview_prompt.md` をテンプレートとし、各フェーズ固有のレビュー観点・入力・カテゴリを適用する。

## 実装方針

### アプローチ: テンプレート派生

`review_impl_rereview_prompt.md` の構造をベースに、以下を置き換える:

1. **ロール宣言**: フェーズ名（spec / plan）に変更
2. **レビュー対象の説明**: DIFF → SPEC CONTENT（spec）/ PLAN + TASKS（plan）
3. **入力定義**: フェーズに応じた入力リスト
4. **Part 2 のレビュー観点**: フェーズ固有のカテゴリ
5. **出力スキーマの category enum**: フェーズ固有のカテゴリ値

### ファイル一覧

| ファイル | アクション |
|---------|----------|
| `global/prompts/review_spec_rereview_prompt.md` | 新規作成 |
| `global/prompts/review_plan_rereview_prompt.md` | 新規作成 |

### 変更しないファイル

- `global/prompts/review_impl_rereview_prompt.md`
- `global/prompts/review_spec_prompt.md`
- `global/prompts/review_plan_prompt.md`
- `global/commands/specflow.spec_fix.md`
- `global/commands/specflow.plan_fix.md`

## 詳細設計

### review_spec_rereview_prompt.md

```
Role: "You are the specification re-reviewer."
Scope: BROAD re-review of the specification
Inputs: PREVIOUS_FINDINGS, MAX_FINDING_ID, ISSUE BODY, SPEC CONTENT

Part 1: Classify previous findings (resolved / still_open)
  - Same rules as impl rereview (exhaustive, exclusive, split/merge)

Part 2: Broad review for new issues
  - Review categories: ambiguity, acceptance_criteria, edge_case, contradiction, assumption, vagueness
  - Check against issue body for faithfulness
  - Focus on implementation-blocking issues

Output: unified JSON schema (decision, resolved_previous_findings, still_open_previous_findings, new_findings, summary, ledger_error)
```

### review_plan_rereview_prompt.md

```
Role: "You are the plan and tasks re-reviewer."
Scope: BROAD re-review of the plan and tasks
Inputs: PREVIOUS_FINDINGS, MAX_FINDING_ID, SPEC CONTENT, PLAN CONTENT, TASKS CONTENT

Part 1: Classify previous findings (resolved / still_open)
  - Same rules as impl rereview

Part 2: Broad review for new issues
  - Review categories: completeness, feasibility, ordering, granularity, scope, consistency, risk
  - Check plan against spec for coverage
  - Check tasks against plan for alignment

Output: unified JSON schema
```

## リスク

- **低リスク**: プロンプトの文言がレビュー品質に影響する可能性があるが、初回リリース後にフィードバックで改善可能
- **低リスク**: specflow-install が新ファイルを正しくコピーするか確認が必要（既存の仕組みなので問題ないはず）
