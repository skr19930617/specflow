# Quickstart: impl フェーズ auto-fix loop

## 概要

`/specflow.impl` 実行時、Codex Implementation Review で unresolved high が検出されると、自動的に fix → re-review を最大 N ラウンド（デフォルト 4）繰り返す。

## 使い方

1. 通常通り `/specflow.impl` を実行
2. 実装レビューで unresolved high があれば、auto-fix loop が自動開始
3. ループは以下のいずれかで停止:
   - unresolved high = 0（成功）
   - 最大ラウンド到達
   - 発散検知（new high 増加、同種再発、quality gate 悪化）
4. 停止後、次のアクションを選択

## 設定のカスタマイズ

```bash
# .specflow/config.env に追加
export SPECFLOW_MAX_AUTOFIX_ROUNDS=6  # デフォルト 4、範囲 1〜10
```

## 発散検知の条件

| 条件 | 説明 | 1 回で停止 |
|------|------|-----------|
| new high 増加 | 前ラウンドより new high が増えた（ラウンド 2 以降） | Yes |
| 同種 high 再発 | resolved した high と title 部分一致する high が再出現 | Yes |
| quality gate 悪化 | severity 重み付けスコアが前ラウンドより増加 | Yes |

## 変更されるファイル

- `global/specflow.impl.md` — auto-fix loop のエントリポイントとロジック追加
- `global/specflow.fix.md` — 変更なし（既存のまま呼び出される）
- `review-ledger.json` — 既存スキーマをそのまま使用（スキーマ変更なし）
