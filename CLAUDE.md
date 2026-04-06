# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/skr19930617/specflow) for issue-driven development.

### Prerequisites

- **specflow prerequisites** (`.specify/`) — `/specflow` は specflow のコマンド群 (specify, clarify, plan, tasks, implement) を前提とする
- **Codex CLI** — `codex` コマンドがインストール済みであること（`npm install -g @openai/codex`）

### specflow Slash Commands

| コマンド | 役割 |
|----------|------|
| `/specflow [<issue-url> \| <text>]` | issue URL またはインライン仕様 → spec → clarify → Codex spec review |
| `/specflow.spec_review` | Codex spec review を単独実行 |
| `/specflow.spec_fix` | spec 修正 → Codex spec re-review |
| `/specflow.plan` | plan → tasks → Codex plan/tasks review |
| `/specflow.plan_review` | Codex plan/tasks review を単独実行 |
| `/specflow.plan_fix` | plan/tasks 修正 → Codex plan/tasks re-review |
| `/specflow.impl` | implement → Codex impl review |
| `/specflow.impl_review` | Codex impl review を単独実行（ledger 更新・auto-fix loop 含む） |
| `/specflow.fix` | impl 修正 → Codex impl re-review |
| `/specflow.decompose` | specの複雑さを分析し、issue-linked specはGitHub sub-issueに分解 |
| `/specflow.dashboard` | 全featureのレビュー台帳を集計しダッシュボード表示・保存 |
| `/specflow.approve` | commit → push → PR 作成 |
| `/specflow.reject` | 全変更破棄 |
| `/specflow.setup` | CLAUDE.md をインタラクティブに設定 |

フロー: `/specflow` → `/specflow.plan` → `/specflow.impl` → `/specflow.approve`
修正ループ: spec → `/specflow.spec_fix` / plan → `/specflow.plan_fix` / impl → `/specflow.fix`
単独レビュー: `/specflow.spec_review` / `/specflow.plan_review` / `/specflow.impl_review`

### Specflow Slash Commands (standalone)

specflow コマンドは `/specflow` の中で自動的に呼ばれるが、個別に使うことも可能:

- `/specflow.specify` — feature description から spec を作成
- `/specflow.clarify` — spec の曖昧さを検出し clarification
- `/specflow.plan` — spec から実装計画を生成
- `/specflow.tasks` — 計画からタスクリストを生成
- `/specflow.implement` — タスクに沿って実装

### Workflow Rules

- spec は specflow のディレクトリ構造 (`specs/<number>-<name>/spec.md`) で管理される
- レビューは Codex MCP サーバー経由で実行される（プロジェクトルートの `.mcp.json` で設定）
- 実装時は spec の acceptance criteria をすべて満たすこと
- `.specflow/` 配下のファイルは実装 diff に含めないこと
- レビュー指摘への対応時、spec の意図を変えないこと
- 各フェーズの終了時に handoff ボタンでユーザーが次のアクションを選択する

## Tech Stack

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Commands

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Code Style

<!-- /specflow.setup で自動設定、または手動で記載 -->

## MANUAL ADDITIONS

<!-- プロジェクト固有のルールをここに追記 -->

## Active Technologies
- Bash scripts, Markdown (Claude Code slash commands), Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh)

## Recent Changes

