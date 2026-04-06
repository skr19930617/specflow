# Quickstart: spec/planレビューをimpl方式のレビュー台帳に統一する

## 前提条件

- specflow (`.specify/`) がインストール済み
- specflow (`.specflow/`) が初期化済み
- Codex CLI (`codex`) がインストール済み

## 変更対象ファイル

### Slash Commands (global/)

| ファイル | 変更内容 |
|---------|---------|
| `specflow.spec_review.md` | ledger記録ロジック追加、current-phase.md生成、low severity自動適用 |
| `specflow.spec_fix.md` | ledger読み込み・re-review分類モード追加、current-phase.md生成 |
| `specflow.plan_review.md` | ledger記録ロジック追加、current-phase.md生成、auto-fixループ追加 |
| `specflow.plan_fix.md` | ledger読み込み・re-review分類モード追加、current-phase.md生成 |
| `specflow.approve.md` | 新ledgerファイル読み込み対応、approval-summary拡張 |
| `specflow.dashboard.md` | **新規作成** — 可視化コマンド |

### Review Prompts (~/.config/specflow/global/)

| ファイル | 変更内容 |
|---------|---------|
| `review_spec_prompt.md` | findings構造追加（ledger互換形式） |
| `review_plan_prompt.md` | findings構造にfile/category追加（ledger互換形式） |
| `review_spec_rereview_prompt.md` | **新規作成** — spec re-review分類プロンプト |
| `review_plan_rereview_prompt.md` | **新規作成** — plan re-review分類プロンプト |

### Scripts (bin/)

| ファイル | 変更内容 |
|---------|---------|
| `specflow-filter-diff` | 除外パターンに`review-ledger-spec.json`, `review-ledger-plan.json`追加 |
| `specflow-install` | 新規ファイルのインストール対応 |

## ワークフロー

### 変更前
```
/specflow.spec_review → Codex review → 結果表示 → handoff
/specflow.plan_review → Codex review → 結果表示 → handoff
```

### 変更後
```
/specflow.spec_review → Codex review → ledger記録 → current-phase.md → low自動適用 → handoff
/specflow.spec_fix    → 修正適用 → re-review(分類モード) → ledger更新 → current-phase.md → handoff
/specflow.plan_review → Codex review → ledger記録 → current-phase.md → auto-fixループ → handoff
/specflow.plan_fix    → 修正適用 → re-review(分類モード) → ledger更新 → current-phase.md → handoff
/specflow.dashboard   → 全featureのledger集計 → CLIテーブル + Markdown保存
```

## 動作確認手順

1. 既存featureでspec_reviewを実行 → `review-ledger-spec.json` が生成されることを確認
2. spec_fixで再レビュー → findingの状態遷移を確認
3. plan_reviewを実行 → `review-ledger-plan.json` が生成されることを確認
4. plan_fixで再レビュー → auto-fixループが動作することを確認
5. 既存のimpl reviewが正常動作することを確認（`review-ledger.json` に影響なし）
6. dashboardコマンドを実行 → テーブル表示 + review-dashboard.md保存を確認
