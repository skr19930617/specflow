# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/skr19930617/specflow) for issue-driven development.

### Prerequisites

- **speckit** (`.specify/`) — `/specflow` は speckit のコマンド群 (specify, clarify, plan, tasks, implement) を前提とする
- **Codex CLI** — `codex` コマンドがインストール済みであること（`npm install -g @openai/codex`）

### specflow Slash Commands

| コマンド | 役割 |
|----------|------|
| `/specflow <issue-url>` | issue → spec → clarify → Codex spec review |
| `/specflow.spec_fix` | spec 修正 → Codex spec re-review |
| `/specflow.plan` | plan → tasks → Codex plan/tasks review |
| `/specflow.plan_fix` | plan/tasks 修正 → Codex plan/tasks re-review |
| `/specflow.impl` | implement → Codex impl review |
| `/specflow.fix` | impl 修正 → Codex impl re-review |
| `/specflow.approve` | commit → push → PR 作成 |
| `/specflow.reject` | 全変更破棄 |
| `/specflow.setup` | CLAUDE.md をインタラクティブに設定 |

フロー: `/specflow` → `/specflow.plan` → `/specflow.impl` → `/specflow.approve`
修正ループ: spec → `/specflow.spec_fix` / plan → `/specflow.plan_fix` / impl → `/specflow.fix`

### Spec Kit Slash Commands (standalone)

speckit コマンドは `/specflow` の中で自動的に呼ばれるが、個別に使うことも可能:

- `/speckit.specify` — feature description から spec を作成
- `/speckit.clarify` — spec の曖昧さを検出し clarification
- `/speckit.plan` — spec から実装計画を生成
- `/speckit.tasks` — 計画からタスクリストを生成
- `/speckit.implement` — タスクに沿って実装

### Review Ledger

`/specflow.impl` と `/specflow.fix` の実行時、Codex review 結果は `specs/<number>-<name>/review-ledger.json` に自動保存される。

- **自動追跡**: 各 review ラウンドの findings が累積的に記録される
- **手動 override**: finding の `status` を `"accepted_risk"` / `"ignored"` に手動変更可能
  - JSON ファイルを直接編集し、`status` フィールドを変更する
  - high severity の場合は `notes` フィールドに理由の記載が必須（空だと自動リバート）
  - override は次回 review 時にも保持される
- **バックアップ**: 更新前に `.bak` ファイルが自動作成される
- **Re-review 分類**: `/specflow.fix` での再レビュー時、ledger が存在する場合は re-review 専用 prompt が使用される
  - 前回 findings は `resolved` / `still_open` / `new_findings` に自動分類される
  - `ledger_error` フラグ: ledger が破損していた場合 true となり、全 findings が new_findings として扱われる
  - `max_finding_id`: 全レビューを通じた最大 finding ID が ledger に保存され、新規 ID の衝突を防ぐ
  - 初回レビュー後に ledger が自動初期化される（`/specflow.impl` 実行時）

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
