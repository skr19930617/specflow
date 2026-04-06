# Data Model: Auto-fix Loop Confirmation Prompt

## エンティティ

本変更では新しいデータエンティティの追加はない。既存の review-ledger.json を読み取り専用で参照する。

### Actionable High Findings（既存・変更なし）

review-ledger.json の `findings[]` から以下の条件で抽出:
- `severity == "high"`
- `status ∈ {"new", "open"}`

確認プロンプトで表示する情報:
- **件数**: 上記条件に合致する finding の数
- **タイトル一覧**: 各 finding の `title` フィールド

### スキーマ変更

なし。review-ledger.json のスキーマには一切変更を加えない。
