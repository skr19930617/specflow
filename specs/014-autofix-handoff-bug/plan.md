# Implementation Plan: Auto-fix Handoff Bug Fix

**Branch**: `014-autofix-handoff-bug` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-autofix-handoff-bug/spec.md`

## Summary

impl review 後の handoff メカニズムを廃止し、AskUserQuestion による auto-fix 確認を直接表示する。severity 別件数のみの簡潔な表示に変更し、スキップ時は手動修正誘導をデフォルト動作とする。修正対象は `global/specflow.impl_review.md` の Handoff セクション (Lines 216-426) のみ。

## Technical Context

**Language/Version**: Markdown (Claude Code slash commands)
**Primary Dependencies**: なし（マークダウンファイルの文言修正のみ）
**Storage**: N/A
**Testing**: 手動テスト（specflow ワークフロー実行）
**Target Platform**: Claude Code CLI
**Project Type**: CLI tool (slash commands)
**Performance Goals**: N/A
**Constraints**: AskUserQuestion ツールの仕様に準拠
**Scale/Scope**: 単一ファイル修正

## Constitution Check

Constitution はテンプレート状態（未設定）のため、ゲートなし。

## Project Structure

### Documentation (this feature)

```text
specs/014-autofix-handoff-bug/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
global/
└── specflow.impl_review.md   # メイン修正対象（Handoff セクション）
```

**Structure Decision**: 既存の `global/specflow.impl_review.md` の Handoff セクションを書き換える。新規ファイル作成なし。

## Implementation Approach

### Phase 1: Handoff 廃止と統一フロー

`global/specflow.impl_review.md` の Handoff セクション (Lines 216-426) を以下に置換:

1. **Severity 集計ロジック**: review-ledger.json の findings から actionable (new/open) な指摘を severity 別に集計
2. **分岐統一**: Case A/B/C の 3 分岐を 2 分岐に簡素化:
   - actionable findings > 0 → AskUserQuestion 確認
   - actionable findings == 0 → 承認フローへ直接遷移
3. **AskUserQuestion 表示**: severity 別件数のみ（タイトルなし、0 件非表示、重要度順）
4. **選択肢**: 「Auto-fix 実行」「手動修正 (/specflow.fix)」の 2 択
5. **スキップ時デフォルト**: 「手動修正」と同等に扱う

### Phase 2: 後続フロー接続

- 「Auto-fix 実行」選択 → 既存の auto-fix loop ロジック（specflow.fix autofix 呼び出し）を維持
- 「手動修正」選択/スキップ → 手動修正誘導メッセージ + `/specflow.fix` 案内
- auto-fix loop 完了後の handoff も同様に AskUserQuestion に置換

## Complexity Tracking

該当なし（シンプルな文言修正）
