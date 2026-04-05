# Implementation Plan: specflow 起動時の入力形式改善

**Branch**: `011-specflow-input-ux` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-specflow-input-ux/spec.md`

## Summary

`/specflow` コマンドの起動時入力を AskUserQuestion ボタン方式からテキスト案内方式に変更する。issue URL とインライン仕様記述の両方を受け付け、入力内容に応じて後続フローを自動分岐させる。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit (.specify/)
**Storage**: File-based — `global/specflow.md` (command file)
**Testing**: Manual testing via `/specflow` command execution
**Target Platform**: macOS/Linux (Claude Code CLI environment)
**Project Type**: CLI tool (slash command system)
**Performance Goals**: N/A (interactive command)
**Constraints**: AskUserQuestion requires minimum 2 button options — cannot be used for free-text input
**Scale/Scope**: Single command file modification

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is template-only (no project-specific gates defined). No violations to check.

## Project Structure

### Documentation (this feature)

```text
specs/011-specflow-input-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (next step)
```

### Source Code (repository root)

```text
global/
└── specflow.md          # Main change target — Step 1 rewrite + Step 2/3/5 branching
```

**Structure Decision**: Single file modification. `global/specflow.md` is the only source file that needs changes. No new files created in the source tree.

## Implementation Approach

### Change 1: Step 1 — 共通エントリポイント + テキスト案内方式への書き換え

**Current behavior** (global/specflow.md Step 1):
- 引数が空の場合、AskUserQuestion でボタン表示 → ユーザーが Other で URL を入力
- 引数が URL の場合、直接使用

**New behavior — 共通エントリポイント**:
Step 1 は以下の順序で入力を取得・分類する。引数ありとなしの両方が同一の分類ロジックを通る:

1. **引数チェック**: `$ARGUMENTS` が非空かを確認
   - 非空 → そのテキストを `INPUT_TEXT` として使用（プロンプト表示なし）
   - 空 → テキスト案内メッセージを表示し、ユーザーの次のメッセージを `INPUT_TEXT` として受け取る
2. **入力分類** (`INPUT_TEXT` を統一的に分類):
   - `INPUT_TEXT` が空（ホワイトスペースのみ含む）→ 再度テキスト案内を表示し再入力を求める（ループ）
   - `INPUT_TEXT` が issue URL パターンに一致 → `MODE = issue_url`
   - 上記いずれでもない → `MODE = inline_spec`
3. **後続ステップへの引き渡し**:
   - `MODE = issue_url` → Step 2 (Fetch Issue) → Step 3〜5
   - `MODE = inline_spec` → Step 2 スキップ → Step 3〜5

### Change 2: Step 2 — 条件付きスキップ + エラー回復

**Current behavior**: 常に issue URL から issue を取得
**New behavior**:
- `MODE = issue_url` の場合のみ Step 2 を実行。`MODE = inline_spec` の場合はスキップ。
- issue 取得失敗時（存在しない、アクセス権なし、ネットワークエラー）:
  - エラーメッセージを表示（原因を含む）
  - テキスト案内メッセージを再表示し、再入力を求める（Step 1 の入力待ちに戻る）
  - 再入力された `INPUT_TEXT` は同じ分類ロジックを通る

### Change 3: Step 3 — インライン仕様記述の受け入れ

**Current behavior**: issue title + body を feature description として speckit.specify に渡す
**New behavior**:
- issue URL 経由: 従来通り issue title + body を渡す
- インライン仕様: ユーザーの入力テキストをそのまま feature description として渡す

### Change 4: Step 5 — issue body なしの Codex review 対応

**Current behavior**: issue body と spec を Codex に渡してレビュー
**New behavior**:
- issue URL 経由: 従来通り issue body + spec
- インライン仕様: spec のみ（issue body は空または省略）

## Complexity Tracking

変更は `global/specflow.md` 1 ファイルのみ。新規ファイル・スクリプトの追加なし。複雑性は低い。
