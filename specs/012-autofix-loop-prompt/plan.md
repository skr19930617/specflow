# Implementation Plan: Auto-fix Loop Confirmation Prompt

**Branch**: `012-autofix-loop-prompt` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-autofix-loop-prompt/spec.md`

## Summary

現在の `specflow.impl_review` は、actionable high findings がある場合（Case A）に auto-fix loop を自動的に開始する。本変更は、Case A の冒頭にユーザー確認プロンプトを挿入し、「開始する」「スキップする」のボタン選択を経てからループを実行（またはスキップ）するようにする。変更対象は `global/specflow.impl_review.md` の 1 ファイルのみ。

## Technical Context

**Language/Version**: Markdown (Claude Code slash command)
**Primary Dependencies**: Claude Code CLI, AskUserQuestion ツール, specflow.fix (既存 Skill)
**Storage**: File-based — `specs/<feature>/review-ledger.json` (read-only参照)
**Testing**: Manual integration test（impl review → 確認プロンプト → 選択 → 期待動作）
**Target Platform**: Claude Code CLI / VSCode Extension
**Project Type**: CLI slash command (Markdown instruction file)
**Performance Goals**: N/A（ユーザーインタラクション）
**Constraints**: 既存の auto-fix loop ロジックは変更しない。Case B / Case C のハンドオフも変更しない。
**Scale/Scope**: 1 ファイル変更

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution は未設定（テンプレートのみ）のため、ゲート違反なし。

## Project Structure

### Documentation (this feature)

```text
specs/012-autofix-loop-prompt/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
global/
└── specflow.impl_review.md   # 変更対象（Case A セクションに確認プロンプトを挿入）
```

**Structure Decision**: 既存の `global/specflow.impl_review.md` を編集するのみ。新規ファイルの追加は不要。

## Implementation Approach

### 変更箇所の特定

`global/specflow.impl_review.md` の以下のセクションを変更:

1. **Case A ヘッダー直後（L204-206 付近）**: 現在は直接 auto-fix loop の baseline snapshot に進む。ここにユーザー確認プロンプトを挿入する。

### 変更内容

#### 1. 確認プロンプトの挿入（Case A の冒頭）

Case A の説明テキスト（L206: `findings[]` 内に...）の後、`#### Round 0 Baseline Snapshot` の前に、以下のセクションを追加:

```markdown
#### ユーザー確認プロンプト

auto-fix loop を開始する前に、ユーザーに確認する。

1. actionable high findings（`severity == "high"` かつ `status ∈ {"new", "open"}`）の件数とタイトル一覧を収集する。

2. `AskUserQuestion` で以下を表示:
   - 質問テキスト: `"{count} 件の high findings があります:\n- {title1}\n- {title2}\n...\n\nauto-fix loop を開始しますか？"`
   - options:
     - label: "開始する", description: "auto-fix loop を実行して自動修正"
     - label: "スキップする", description: "auto-fix をスキップして手動アクション選択へ"

3. ユーザーの選択に応じて分岐:
   - 「開始する」 → 以下の Round 0 Baseline Snapshot に進む（既存フロー）
   - 「スキップする」 → Case B の通常の手動ハンドオフに進む（auto-fix loop は一切実行しない）
```

#### 2. 変更しないもの

- Round 0 Baseline Snapshot 以降の auto-fix loop ロジック全体
- Case B の handoff オプション
- Case C のエラーハンドオフ
- `accepted_risk`/`ignored` の判定ロジック

## Complexity Tracking

変更は最小限（1 ファイル、1 セクション追加）のため、複雑性の懸念なし。
