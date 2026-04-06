# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/skr19930617/specflow) for issue-driven development.

### Prerequisites

- **speckit** (`.specify/`) — `/specflow` は speckit のコマンド群 (specify, clarify, plan, tasks, implement) を前提とする
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
| `/specflow.approve` | commit → push → PR 作成 |
| `/specflow.reject` | 全変更破棄 |
| `/specflow.setup` | CLAUDE.md をインタラクティブに設定 |

フロー: `/specflow` → `/specflow.plan` → `/specflow.impl` → `/specflow.approve`
修正ループ: spec → `/specflow.spec_fix` / plan → `/specflow.plan_fix` / impl → `/specflow.fix`
単独レビュー: `/specflow.spec_review` / `/specflow.plan_review` / `/specflow.impl_review`

### Spec Kit Slash Commands (standalone)

speckit コマンドは `/specflow` の中で自動的に呼ばれるが、個別に使うことも可能:

- `/speckit.specify` — feature description から spec を作成
- `/speckit.clarify` — spec の曖昧さを検出し clarification
- `/speckit.plan` — spec から実装計画を生成
- `/speckit.tasks` — 計画からタスクリストを生成
- `/speckit.implement` — タスクに沿って実装

### Workflow Rules

- spec は speckit のディレクトリ構造 (`specs/<number>-<name>/spec.md`) で管理される
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
- Bash scripts + Claude Code slash commands (Markdown) + Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), specki (002-review-ledger)
- JSON ファイル (`specs/<issue>-<slug>/review-ledger.json`) (002-review-ledger)
- Bash scripts, Markdown (Claude Code slash commands) + Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), specki (003-impl-rereview-classify)
- Markdown (Claude Code slash command) + Bash shell scripts + Claude Code CLI, speckit (.specify/), GitHub CLI (gh) (005-approve-ledger-gate)
- JSON ファイル (`specs/<feature>/review-ledger.json`) (005-approve-ledger-gate)
- Bash (shell scripts), Markdown (Claude Code slash commands) + Claude Code CLI, GitHub CLI (gh), speckit (.specify/), jq (for JSON parsing in scripts) (006-approval-summary)
- File-based — `specs/<feature>/approval-summary.md`, `specs/<feature>/review-ledger.json` (006-approval-summary)
- Markdown (Claude Code slash commands) + Bash (inline git commands) + Claude Code CLI, speckit (.specify/), GitHub CLI (gh), jq (not needed — inline logic) (007-current-phase)
- File-based — `specs/<feature>/current-phase.md`, `specs/<feature>/review-ledger.json` (read-only) (007-current-phase)
- Markdown (Claude Code slash command), Bash (config.env) + specflow.impl.md, specflow.fix.md, review-ledger.json (008-impl-autofix-loop)
- File-based (review-ledger.json — 既存スキーマ変更なし) (008-impl-autofix-loop)
- Bash (POSIX + bashisms) + gh CLI, jq, gi (009-legacy-cleanup)
- File-based (Markdown, JSON, shell scripts) (009-legacy-cleanup)
- Bash (POSIX + bashisms), Markdown (Claude Code slash commands) + Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit (.specify/) (010-split-review-commands)
- File-based — `global/*.md` (command files), `.specflow/review_*_prompt.txt` (review prompts), `specs/<feature>/review-ledger.json` (010-split-review-commands)
- File-based — `global/specflow.md` (command file) (011-specflow-input-ux)
- Markdown (Claude Code slash command) + Claude Code CLI, AskUserQuestion ツール, specflow.fix (既存 Skill) (012-autofix-loop-prompt)
- File-based — `specs/<feature>/review-ledger.json` (read-only参照) (012-autofix-loop-prompt)
- Markdown (Claude Code slash commands) + なし（マークダウンファイルの文言修正のみ） (013-speckit-prereq-guidance)
- File-based (Markdown prompt files in `global/`) (015-global-prompt-install)
- Bash (POSIX + bashisms), Markdown (Claude Code slash commands) + Claude Code CLI, Codex CLI (MCP server), git, specflow slash commands (016-diff-filter-review)
- File-based — `config.env`, `review-ledger.json`, slash command `.md` files (016-diff-filter-review)
- Bash (POSIX + bashisms), Markdown (Claude Code slash commands) + Claude Code CLI, GitHub CLI (`gh`), speckit (`.specify/`) (017-spec-decompose-command)
- File-based — slash command in `global/`, helper script in `bin/`, no persistent state (017-spec-decompose-command)

## Recent Changes
- 002-review-ledger: Added Bash scripts + Claude Code slash commands (Markdown) + Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), specki
