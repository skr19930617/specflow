# Quickstart: Auto-fix Loop Confirmation Prompt

## 変更概要

`global/specflow.impl_review.md` の Case A セクションに確認プロンプトを追加する。

## 動作フロー

1. `/specflow.impl_review` を実行
2. impl review → ledger 更新
3. actionable high findings が 1 件以上 → **確認プロンプト表示**（NEW）
   - 「開始する」→ auto-fix loop 実行（既存フロー）
   - 「スキップする」→ Case B の handoff へ
4. actionable high findings が 0 件 → Case B の handoff（変更なし）

## テスト方法

1. high findings がある状態で `/specflow.impl_review` を実行
2. 確認プロンプトが表示されることを確認
3. 「開始する」を選択 → auto-fix loop が動作することを確認
4. 再度実行し「スキップする」を選択 → Case B の handoff が表示されることを確認
5. high findings が 0 件の場合 → 確認プロンプトなしで Case B に到達することを確認
