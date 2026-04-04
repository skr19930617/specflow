# Data Model: specflow 起動時の入力形式改善

## Entities

### 入力テキスト (UserInput)

ユーザーが `/specflow` に提供するテキスト。引数として渡されるか、テキスト案内後のメッセージとして受け取る。

| Attribute | Description |
|-----------|-------------|
| raw_text | ユーザーが入力した生テキスト |
| source | 入力元: `argument`（引数）または `prompt`（案内後入力） |

### 入力分類結果 (InputClassification)

入力テキストを分類した結果。

| Value | Condition | Next Step |
|-------|-----------|-----------|
| `issue_url` | 正規表現 `https?://[^/]+/[^/]+/[^/]+/issues/\d+` に一致 | Step 2: Fetch Issue |
| `inline_spec` | URL パターンに一致しない非空テキスト | Step 3: Create Spec (issue 取得スキップ) |
| `empty` | 空文字またはホワイトスペースのみ | 再度入力を求める |

## State Transitions

```
/specflow 実行
    │
    ├─ 引数あり ─┬─ issue URL パターン一致 → Step 2 (Fetch Issue) → Step 3〜5
    │            └─ 一致しない → Step 3 (Create Spec with inline text) → Step 4〜5
    │
    └─ 引数なし → テキスト案内表示 → ユーザー入力待ち
                     │
                     ├─ issue URL パターン一致 → Step 2 (Fetch Issue) → Step 3〜5
                     ├─ 一致しない非空テキスト → Step 3 (Create Spec) → Step 4〜5
                     └─ 空入力 → 再度入力を求める
```

## Relationships

- 入力テキスト → 入力分類結果: 1:1（テキストは必ず 1 つの分類に属する）
- 入力分類結果 → 後続フロー: 分類結果がフローの分岐先を決定する
