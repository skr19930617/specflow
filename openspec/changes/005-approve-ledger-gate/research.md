# Research: approve-ledger-gate

## Decision: review-ledger.json のスキーマ

- **Decision**: 002-review-ledger で定義された既存スキーマをそのまま使用
- **Rationale**: approve フェーズは ledger の reader であり、スキーマの変更は不要。top-level `status` フィールド（`has_open_high` / `all_resolved` / `in_progress`）を gate 判定に使用
- **Alternatives considered**: findings を直接再計算する方式 → 不採用（status は書き込み側で既に導出済み、二重計算は不要）

## Decision: quality gate の挿入位置

- **Decision**: `specflow.approve.md` の spec 読み取り（ステップ 3）直後、コミットメッセージ生成（ステップ 4）の前
- **Rationale**: ステップ 3 で取得する `FEATURE_DIR` を再利用して review-ledger.json のパスを導出できる。git 操作の前にブロックすることで、未解決 high がある場合に一切の変更をコミットしない
- **Alternatives considered**: ステップ 1 の前（git status より前）→ 不採用（変更ファイル確認なしに停止するとユーザーが状況を把握しにくい）

## Decision: 停止時の表示内容

- **Decision**: findings 配列から severity=high かつ status≠resolved の finding を抽出し、id/title/detail/status をテーブル表示
- **Rationale**: ユーザーが問題箇所を特定し `/specflow.fix` で対応するために必要な情報
- **Alternatives considered**: status フィールドだけ表示 → 不採用（具体的な問題がわからない）

## No NEEDS CLARIFICATION items

すべての技術的判断が確定済み。
