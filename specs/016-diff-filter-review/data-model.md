# Data Model: レビュー対象 Diff フィルタリング

## Entity: Diff Filter Config

config.env 内の環境変数として表現。

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `DIFF_EXCLUDE_PATTERNS` | string (colon-separated globs) | `""` (empty) | 除外対象のファイルパターン。コロン区切り |
| `DIFF_WARN_THRESHOLD` | integer | `1000` | diff 行数の警告閾値 |

**書式例**:
```bash
DIFF_EXCLUDE_PATTERNS="*.lock:generated/**:vendor/**"
DIFF_WARN_THRESHOLD=1000
```

## Entity: Filter Result

`specflow-filter-diff` スクリプトの出力として表現。

### stdout: フィルタリング後の diff テキスト

git diff のフィルタ後出力そのまま。

### stderr: JSON フィルタサマリー

```json
{
  "excluded": [
    {"file": "old-module.js", "reason": "deleted_file"},
    {"file": "utils/helper.js", "reason": "rename_only", "new_path": "lib/helper.js"},
    {"file": "package-lock.json", "reason": "pattern_match", "pattern": "*.lock"}
  ],
  "warnings": [
    "invalid pattern '[abc' — skipping"
  ],
  "included_count": 5,
  "excluded_count": 3,
  "total_lines": 1234
}
```

**出力方式**: JSON は stderr の最終行に 1 行で出力する。FR-006 の不正パターン警告は `warnings` 配列に内包し、テキスト警告を JSON とは別に出力しない。呼び出し側は `tail -1` で最終行を取得し JSON パースする。

| Field | Type | Description |
|-------|------|-------------|
| `excluded` | array | 除外されたファイルのリスト |
| `excluded[].file` | string | 除外されたファイルのパス |
| `excluded[].reason` | enum | `deleted_file` / `rename_only` / `pattern_match` |
| `excluded[].new_path` | string? | rename の場合のみ、新パス |
| `excluded[].pattern` | string? | pattern_match の場合のみ、マッチしたパターン |
| `included_count` | integer | レビュー対象に含まれるファイル数 |
| `excluded_count` | integer | 除外されたファイル数 |
| `total_lines` | integer | フィルタ後の diff 総行数 |
| `warnings` | string[] | FR-006 不正パターン警告メッセージの配列（警告がなければ空配列） |

## State Transitions

なし。フィルタリングはステートレスな処理。毎回 git diff の出力から再計算する。

## Validation Rules

- `DIFF_EXCLUDE_PATTERNS`: 各パターンが glob 構文として有効であること。不正パターンはスキップ
- `DIFF_WARN_THRESHOLD`: 正の整数であること。非数値や負数の場合はデフォルト（1000）を使用
- パターンのマッチ対象: repo ルート相対のファイルパス
