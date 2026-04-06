# Quickstart: レビュー対象 Diff フィルタリング

## 概要

Codex レビュー時の diff フィルタリング機能。完全削除ファイルやリネームのみファイルをデフォルト除外し、カスタムパターンによる追加除外と行数警告を提供する。

## 使い方

### デフォルト動作（設定不要）

`/specflow.impl` や `/specflow.fix` を実行すると、以下が自動的に除外される:
- 完全削除ファイル（`deleted file mode`）
- リネームのみファイル（内容変更なし、similarity index 100%）

### カスタム除外パターンの設定

`.specflow/config.env` に追加:

```bash
# ロックファイルと自動生成ファイルを除外
DIFF_EXCLUDE_PATTERNS="*.lock:generated/**"
```

### 警告閾値の変更

```bash
# デフォルトは 1000 行。変更する場合:
DIFF_WARN_THRESHOLD=2000
```

## 動作フロー

1. レビュー実行時に自動的にフィルタリングが適用される
2. 除外されたファイルがあればサマリーが表示される
3. フィルタ後の diff が閾値を超えていれば警告が表示される
4. フィルタ後の diff が空なら「レビュー対象の変更がありません」と通知
5. フィルタ後の diff が Codex に送信される

## CLI スクリプト

`specflow-filter-diff` — 単体での使用も可能:

```bash
# 現在の作業ツリーの diff をフィルタリング
specflow-filter-diff

# カスタムパターン付き
DIFF_EXCLUDE_PATTERNS="*.lock:dist/**" specflow-filter-diff

# フィルタサマリーのみ確認（diff は /dev/null に）
specflow-filter-diff > /dev/null
```
