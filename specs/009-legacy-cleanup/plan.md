# Implementation Plan: レガシーコードのリファクタリング

**Branch**: `009-legacy-cleanup` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-legacy-cleanup/spec.md`

## Summary

不要なスクリプトを特定・削除し、ドキュメントと install スクリプトを現行のファイル構成に合わせて更新する。grep ベースの参照検索で削除対象を特定し、README.md のファイル構成セクション更新、specflow-install への古いシンボリックリンク掃除機能の追加、specflow-init の完了メッセージ修正を行う。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms)  
**Primary Dependencies**: gh CLI, jq, git  
**Storage**: File-based (Markdown, JSON, shell scripts)  
**Testing**: Manual verification (shell script execution + file existence checks)  
**Target Platform**: macOS / Linux  
**Project Type**: CLI tool (shell scripts + Claude Code slash commands)  
**Performance Goals**: N/A (maintenance task)  
**Constraints**: 既存ワークフローの非破壊  
**Scale/Scope**: ~30 files in repository

## Constitution Check

*Constitution is a template (not customized for this project). No gates to check.*

## Project Structure

### Documentation (this feature)

```text
specs/009-legacy-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0: 削除対象ファイル調査結果
├── data-model.md        # Phase 1: ファイル参照マップ
├── quickstart.md        # Phase 1: 実装手順サマリー
└── tasks.md             # Phase 2: タスク一覧
```

### Source Code (repository root)

```text
bin/
├── specflow-install     # 更新対象: 古いシンボリックリンク掃除機能追加
├── specflow-init        # 更新対象: 完了メッセージ修正
└── specflow-fetch-issue # 変更なし

global/
├── specflow.md          # 参照チェックのみ
├── specflow.approve.md
├── specflow.fix.md
├── specflow.impl.md
├── specflow.plan.md
├── specflow.plan_fix.md
├── specflow.reject.md
├── specflow.setup.md
├── specflow.spec_fix.md
└── claude-settings.json # 変更なし

template/
├── .specflow/
│   ├── config.env
│   ├── review_spec_prompt.txt
│   ├── review_plan_prompt.txt
│   ├── review_impl_prompt.txt
│   └── review_impl_rereview_prompt.txt  # 調査対象
├── .mcp.json
└── CLAUDE.md

README.md                # 更新対象: ファイル構成セクション
```

**Structure Decision**: 既存のディレクトリ構造を維持。新規ディレクトリの追加なし。

## Complexity Tracking

該当なし（複雑性違反なし）。
