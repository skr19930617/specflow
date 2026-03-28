# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/skr19930617/specflow) for issue-driven development.

### Prerequisites

- **speckit** (`.specify/`) — `/specflow` は speckit のコマンド群 (specify, clarify, plan, tasks, implement) を前提とする
- **OpenAI MCP サーバー** — プロジェクトルートの `.mcp.json` で設定済みであること（`specflow-init` で自動コピーされる）

### specflow Slash Command

- `/specflow <issue-url>` — GitHub issue からの全ワークフロー
- `/specflow` — issue URL をインタラクティブに入力
- `/specflow.setup` — CLAUDE.md をインタラクティブに設定

フロー: issue 取得 → speckit.specify → speckit.clarify (人間) → OpenAI review → speckit.clarify (人間) → speckit.plan → speckit.tasks → speckit.implement → OpenAI review

### Spec Kit Slash Commands (standalone)

speckit コマンドは `/specflow` の中で自動的に呼ばれるが、個別に使うことも可能:

- `/speckit.specify` — feature description から spec を作成
- `/speckit.clarify` — spec の曖昧さを検出し clarification
- `/speckit.plan` — spec から実装計画を生成
- `/speckit.tasks` — 計画からタスクリストを生成
- `/speckit.implement` — タスクに沿って実装

### Workflow Rules

- spec は speckit のディレクトリ構造 (`specs/<number>-<name>/spec.md`) で管理される
- レビューは OpenAI MCP サーバー経由で実行される（プロジェクトルートの `.mcp.json` で設定）
- 実装時は spec の acceptance criteria をすべて満たすこと
- `.specflow/` 配下のファイルは実装 diff に含めないこと
- レビュー指摘への対応時、spec の意図を変えないこと
- clarify と review 後の選択はユーザーがインタラクティブに決定する

## Tech Stack

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Commands

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Code Style

<!-- /specflow.setup で自動設定、または手動で記載 -->

## MANUAL ADDITIONS

<!-- プロジェクト固有のルールをここに追記 -->
