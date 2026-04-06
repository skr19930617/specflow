# Quickstart: approve-ledger-gate

## 概要

`/specflow.approve` コマンドに review-ledger.json の quality gate を追加する。

## 変更対象

- `global/specflow.approve.md` — quality gate セクションを挿入

## 動作確認

1. 未解決 high がある状態で `/specflow.approve` を実行 → 停止することを確認
2. 全 finding を resolved にして `/specflow.approve` を実行 → 通常通り commit/push/PR が行われることを確認
3. review-ledger.json を削除して `/specflow.approve` を実行 → 停止することを確認
