# Proposal: Re-review プロンプトの欠落追加

> GitHub Issue: [#58](https://github.com/skr19930617/specflow/issues/58) — rereviewpromptがない

## 背景

specflow の review ワークフローには「初回レビュー」と「再レビュー（rereview）」の2種類のプロンプトがある。
現在、`global/prompts/` には以下のプロンプトが存在する:

| フェーズ | 初回レビュー | 再レビュー |
|---------|------------|-----------|
| spec    | `review_spec_prompt.md` | **欠落** |
| plan    | `review_plan_prompt.md` | **欠落** |
| impl    | `review_impl_prompt.md` | `review_impl_rereview_prompt.md` |

`spec_fix` コマンドは `review_spec_rereview_prompt.md` を参照し、`plan_fix` コマンドは `review_plan_rereview_prompt.md` を参照するが、いずれも対応するプロンプトファイルが存在しない。このため、fix コマンドの rereview モード実行時に「❌ review prompt が見つかりません」エラーで停止する。

## スコープ

Issue body は「plan/tasks でないが他に要求しているプロンプトが存在してるかのチェックをする」と記載している。これは2つの側面を含む:

1. **欠落プロンプトの特定と追加**（本 issue のスコープ）
2. **プロンプト存在チェック機能の自動化**（別 issue で対応）

本 issue では、調査の結果判明した欠落プロンプト（spec rereview、plan rereview）の追加のみを行う。チェック機能の自動化は本 issue のスコープ外とする。この判断は issue 起票者の確認済み。

## 要件

### 必須要件

1. **欠落プロンプトの作成**: `review_spec_rereview_prompt.md` と `review_plan_rereview_prompt.md` を `global/prompts/` に作成する
2. **既存パターンとの一貫性**: 既存の `review_impl_rereview_prompt.md` の構造（Part 1: 前回指摘の分類、Part 2: 新規指摘の発見）に準拠する
3. **スキーマ互換性**: 出力 JSON スキーマは既存の `spec_fix` / `plan_fix` コマンドが消費するフィールド名と完全に一致させる（下記「出力 JSON スキーマ」参照）

## 設計決定

1. **出力スキーマ**: 全 rereview プロンプトは `findings` ベースの統一フォーマットを使用する（`spec_fix` / `plan_fix` コマンドが `resolved_previous_findings` / `still_open_previous_findings` / `new_findings` を消費するため）
2. **配置場所**: `global/prompts/` にのみ配置。`template/` には配置しない（specflow-install 経由でコピーする既存の仕組みを使用）
3. **スコープ**: プロンプトファイル2つの追加のみ

## 出力 JSON スキーマ

両 rereview プロンプトは以下の JSON スキーマを出力する。これは既存の `review_impl_rereview_prompt.md` および `spec_fix` / `plan_fix` コマンドの期待と一致する:

```json
{
  "decision": "APPROVE" | "REQUEST_CHANGES" | "BLOCK",
  "resolved_previous_findings": [
    {
      "id": "R1-F01",
      "note": "description of how the issue was resolved"
    }
  ],
  "still_open_previous_findings": [
    {
      "id": "R1-F02",
      "severity": "high" | "medium" | "low",
      "note": "description of why the issue is still open"
    }
  ],
  "new_findings": [
    {
      "id": "F3",
      "severity": "high" | "medium" | "low",
      "category": "<phase-specific categories>",
      "file": "path/to/file",
      "title": "short title",
      "detail": "what is wrong and how to fix it"
    }
  ],
  "summary": "short summary of review results",
  "ledger_error": false
}
```

### フェーズ固有のカテゴリ

- **spec rereview**: `category` は初回 spec review の問題分類に準拠 — `ambiguity`, `acceptance_criteria`, `edge_case`, `contradiction`, `assumption`, `vagueness`
- **plan rereview**: `category` は初回 plan review に準拠 — `completeness`, `feasibility`, `ordering`, `granularity`, `scope`, `consistency`, `risk`
- **impl rereview**（既存）: `correctness`, `completeness`, `quality`, `scope`, `testing`, `error_handling`, `forbidden_files`, `performance`

### レビュー対象コンテキスト

- **spec rereview** は以下を入力として受け取る:
  - `PREVIOUS_FINDINGS` — 前回の未解決 findings
  - `MAX_FINDING_ID` — 最大 finding ID
  - `ISSUE BODY` — 元の GitHub issue（利用可能な場合）
  - `SPEC CONTENT` — 現在の spec 内容
- **plan rereview** は以下を入力として受け取る:
  - `PREVIOUS_FINDINGS` — 前回の未解決 findings
  - `MAX_FINDING_ID` — 最大 finding ID
  - `SPEC CONTENT` — feature spec
  - `PLAN CONTENT` — 実装計画
  - `TASKS CONTENT` — タスク分割

## 受け入れ基準

- [ ] `global/prompts/review_spec_rereview_prompt.md` が存在する
- [ ] `global/prompts/review_plan_rereview_prompt.md` が存在する
- [ ] 両プロンプトの出力 JSON が上記スキーマに準拠する（`resolved_previous_findings` / `still_open_previous_findings` / `new_findings`）
- [ ] 両プロンプトの構造（Part 1: 前回指摘の分類、Part 2: 新規指摘の発見）が `review_impl_rereview_prompt.md` に準拠
- [ ] spec_fix で `review_spec_rereview_prompt.md` がロードされ、出力が ledger 更新ロジックで正しく処理される
- [ ] plan_fix で `review_plan_rereview_prompt.md` がロードされ、出力が ledger 更新ロジックで正しく処理される

## スコープ外

- 既存の `review_impl_rereview_prompt.md` の修正
- review コマンド（spec_review, plan_review, impl_review）自体のロジック変更
- `template/` 配下への配置
- `specflow-analyze` へのプロンプト存在チェック追加（別 issue で対応）
- 新規の CLI ツール追加
