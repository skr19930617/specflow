# Research: Re-review プロンプトの欠落追加

## 既存プロンプトの構造分析

### review_impl_rereview_prompt.md（テンプレート）

構造:
1. **ロール宣言**: "You are the implementation re-reviewer."
2. **スコープ説明**: BROAD re-review（前回指摘以外も含む全体レビュー）
3. **入力定義**: PREVIOUS_FINDINGS, MAX_FINDING_ID, DIFF
4. **Part 1 — 前回指摘の分類**: resolved / still_open に分類。ルール: exhaustive, exclusive, split/merge ハンドリング
5. **Part 2 — 新規指摘の発見**: 全体レビューで新しい問題を検出
6. **ID 割り当てルール**: MAX_FINDING_ID + 1 から連番
7. **Decision ルール**: APPROVE / REQUEST_CHANGES / BLOCK
8. **Severity ガイド**: high / medium / low
9. **出力スキーマ**: strict JSON

### review_spec_prompt.md（初回レビュー）

- 入力: ISSUE BODY, SPEC CONTENT
- レビュー観点: ambiguity, acceptance criteria, edge cases, contradictions, hidden assumptions, vagueness
- 出力: decision, questions[], summary

### review_plan_prompt.md（初回レビュー）

- 入力: SPEC CONTENT, PLAN CONTENT, TASKS CONTENT
- レビュー観点: completeness, feasibility, ordering, granularity, scope, consistency, risk
- 出力: decision, findings[], summary

## fix コマンドのプロンプト参照パス

- `spec_fix`: `~/.config/specflow/global/review_spec_rereview_prompt.md`
- `plan_fix`: `~/.config/specflow/global/review_plan_rereview_prompt.md`
- `fix` (impl): `~/.config/specflow/global/review_impl_rereview_prompt.md`

specflow-install は `global/prompts/` の内容を `~/.config/specflow/global/` にコピーする。

## 主な差異と注意点

| 項目 | impl rereview | spec rereview (新規) | plan rereview (新規) |
|------|--------------|---------------------|---------------------|
| レビュー対象 | DIFF | SPEC CONTENT + ISSUE BODY | SPEC + PLAN + TASKS |
| カテゴリ | correctness等8種 | ambiguity等6種 | completeness等7種 |
| 出力 JSON | findings ベース | findings ベース（統一） | findings ベース（統一） |
| Part 1 分類対象 | previous findings | previous findings | previous findings |
| Part 2 レビュー範囲 | 全 DIFF | 全 SPEC | 全 PLAN + TASKS |
