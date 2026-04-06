<!-- Historical Migration
  Source: specs/015-global-prompt-install/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: 015-global-prompt-install

**Branch**: `015-global-prompt-install` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-global-prompt-install/spec.md`

## Summary

Codex 向け review prompt ファイルをプロジェクトローカルの `.specflow/` からリポジトリの `global/` ディレクトリに移動し、`.txt` から `.md` に変換する。`specflow-install` が `global/` を `~/.config/specflow/global/` にコピーするため、スラッシュコマンドの参照パスを `~/.config/specflow/global/review_*_prompt.md`（絶対パス）に更新する。テンプレートから prompt ファイルを除去する。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh)
**Storage**: File-based (Markdown prompt files in `global/`)
**Testing**: 手動検証 — specflow コマンド実行で prompt が正しく読み込まれることを確認
**Target Platform**: macOS / Linux
**Project Type**: CLI tool (slash command collection)
**Constraints**: 既存のコマンド動作を壊さないこと。prompt の意味を変えないこと。

## Constitution Check

Constitution はテンプレート状態（未カスタマイズ）のため、ゲート違反なし。

## Project Structure

### Documentation (this feature)

```text
specs/015-global-prompt-install/
├── spec.md
├── plan.md              # This file
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md             # Next step
```

### Source Code (repository root)

```text
global/
├── specflow.spec_review.md      # 参照パス更新
├── specflow.spec_fix.md         # 参照パス更新
├── specflow.plan_review.md      # 参照パス更新
├── specflow.plan_fix.md         # 参照パス更新
├── specflow.impl_review.md      # 参照パス更新
├── specflow.fix.md              # 参照パス更新（2 箇所）
├── review_spec_prompt.md        # NEW: .specflow/ から移動 + .md 変換
├── review_plan_prompt.md        # NEW: .specflow/ から移動 + .md 変換
├── review_impl_prompt.md        # NEW: .specflow/ から移動 + .md 変換
└── review_impl_rereview_prompt.md # NEW: .specflow/ から移動 + .md 変換

template/.specflow/
├── config.env                   # 変更なし
└── (review_*_prompt.txt 削除)   # 4 ファイル削除

bin/
└── specflow-init                # 出力メッセージ更新
```

**Structure Decision**: 既存の `global/` ディレクトリに prompt ファイルを追加。新規ディレクトリの作成は不要。

## Implementation Strategy

### Phase 1: Prompt ファイルの移動 + Markdown 変換

1. `.specflow/review_*_prompt.txt` の内容を読み取り、`global/review_*_prompt.md` として作成
2. 拡張子変更のみ。内容は同一とする（既にプレーンテキストだが有効な Markdown でもある）
3. 4 ファイル: spec, plan, impl, impl_rereview

### Phase 2: スラッシュコマンドの参照パス更新 + エラーハンドリング

7 箇所の参照を一括更新し、prompt 不在時のエラーメッセージを各コマンドに追加:

| 更新前 | 更新後 |
|--------|--------|
| `.specflow/review_spec_prompt.txt` | `~/.config/specflow/global/review_spec_prompt.md` |
| `.specflow/review_plan_prompt.txt` | `~/.config/specflow/global/review_plan_prompt.md` |
| `.specflow/review_impl_prompt.txt` | `~/.config/specflow/global/review_impl_prompt.md` |
| `.specflow/review_impl_rereview_prompt.txt` | `~/.config/specflow/global/review_impl_rereview_prompt.md` |

### Phase 3: テンプレート + init スクリプトの更新

1. `template/.specflow/` から `review_*_prompt.txt` (4 ファイル) を削除
2. `bin/specflow-init` の出力メッセージから prompt ファイルの行を削除

### Phase 4: ローカルプロジェクトのクリーンアップ

1. 本リポジトリの `.specflow/review_*_prompt.txt` を削除（開発リポジトリとしてのクリーンアップ）

## Risk Assessment

| リスク | 影響 | 対策 |
|--------|------|------|
| 参照パス更新漏れ | コマンド実行時にファイル not found エラー | research.md で全箇所を事前調査済み |
| prompt 内容の意図しない変更 | レビュー品質の劣化 | 拡張子のみ変更、内容は同一を保証 |
| `specflow-install` 後に古い prompt が残る | 混乱の原因 | install スクリプトは `rm -rf` + `cp -R` で上書きするため問題なし |

## Complexity Tracking

違反なし。全変更はファイルの移動・名前変更・テキスト置換のみ。
