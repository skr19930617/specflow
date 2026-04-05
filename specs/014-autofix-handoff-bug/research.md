# Research: Auto-fix Handoff Bug Fix

**Branch**: `014-autofix-handoff-bug` | **Date**: 2026-04-05

## R1: Current Handoff Architecture

**Decision**: handoff を廃止し、AskUserQuestion 直接確認に置き換える

**Rationale**:
- 現在の handoff は `specflow.impl_review.md` の Lines 216-426 に実装
- Case A (actionable high > 0): auto-fix 確認を AskUserQuestion で表示 → ここが問題の箇所
- Case B (actionable high == 0): 通常の handoff ボタン表示
- Case C: エラーハンドリング
- handoff がスキップされると、後続のフローが実行されず停止する
- AskUserQuestion 直接表示に切り替え、スキップ時はデフォルトで手動修正誘導

**Alternatives considered**:
- handoff にリトライロジックを追加 → 根本解決にならない
- handoff を必須化（Claude Code の仕組み上、不可能）→ 却下

## R2: AskUserQuestion の表示形式

**Decision**: severity 別件数のみ表示（タイトルなし）、0 件は非表示

**Rationale**:
- 現在の実装 (`impl_review.md` Lines 237-244): `"{actionable_high_count} 件の high findings があります:\n- {finding1_title}\n- {finding2_title}..."` 
- タイトル一覧が煩雑 → severity と件数のみに簡略化
- 例: 「CRITICAL: 2, HIGH: 3」
- 表示順: CRITICAL → HIGH → MEDIUM → LOW、0 件は非表示

**Alternatives considered**:
- タイトルを短縮表示 → まだ煩雑
- severity ごとに折りたたみ → AskUserQuestion では不可能

## R3: 修正対象ファイルの特定

**Decision**: `global/specflow.impl_review.md` の Handoff セクション（Lines 216-426）を主に修正

**Rationale**:
- Handoff の 3 ケース（A/B/C）を統合し、単一の AskUserQuestion フローに置き換え
- `specflow.fix.md` の autofix モードスキップ（Lines 338-341）はそのまま維持
- `specflow.impl.md` は変更不要（impl_review を呼び出すだけ）

**Alternatives considered**:
- 複数ファイルに分散修正 → 変更箇所が増えリスク増
- 新規ファイル作成 → 不要（既存ファイルの修正で十分）
