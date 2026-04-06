# Research: Auto-fix Loop Confirmation Prompt

## R1: AskUserQuestion ツールの使用パターン

**Decision**: 既存プロジェクト内の AskUserQuestion 使用パターンに従う
**Rationale**: `global/specflow.impl_review.md` 内で既に Case B / Case C の handoff で AskUserQuestion を使用しており、同じパターンを踏襲する。question テキストに finding 情報を含め、options で「開始する」「スキップする」を提供する。
**Alternatives considered**: マークダウンテーブルで選択肢を表示 → プロジェクト標準がボタン UI（AskUserQuestion）のため不採用。

## R2: 確認プロンプトの挿入位置

**Decision**: Case A セクションの `accepted_risk`/`ignored` の扱い説明の後、`#### Round 0 Baseline Snapshot` の前に新しい `#### ユーザー確認プロンプト` サブセクションを挿入する
**Rationale**: 
- Case A 判定ロジック（actionable_high_count > 0）はそのまま維持
- 確認プロンプトは「開始するか」の判断であり、baseline snapshot の前に来るべき
- 「スキップする」選択時は Case B の handoff に飛ぶため、ループ変数初期化の前に分岐する必要がある
**Alternatives considered**: Case A 全体を書き換え → 変更量が大きくリスク増。最小限の挿入で対応可能。

## R3: 「スキップする」選択時のフロー

**Decision**: 既存 Case B の handoff をそのまま表示する
**Rationale**: Clarify セッションでユーザーが選択。Case B は「Approve & Commit」「Fix All」「Reject」の 3 択で、手動修正を含む標準的な選択肢を提供する。
**Alternatives considered**: 専用の handoff メニュー → 不要な複雑性の追加。Case B + auto-fix 再開ボタン → ユーザーが不要と判断。
