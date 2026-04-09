# Workflow Core Architecture

## Overview

specflow のワークフローは 3 つのコアコンポーネントで構成される:

1. **State Machine** (`global/workflow/state-machine.json`) — 宣言的な状態遷移定義
2. **Run CLI** (`bin/specflow-run`) — 状態遷移の実行・検証エンジン
3. **Run State** (`.specflow/runs/<run_id>/run.json`) — per-run の永続化状態

## State Machine (v2.0)

### States

| State | Type | Description |
|-------|------|-------------|
| `start` | Mainline | 初期状態 |
| `proposal` | Mainline | Proposal 作成・Clarify・Validate |
| `design` | Mainline | Design artifacts 生成・レビュー |
| `apply` | Mainline | 実装・レビュー |
| `approved` | Terminal | 承認済み |
| `rejected` | Terminal | 拒否済み |
| `explore` | Branch | アイデア探索（state-machine-only、run state 非参加） |
| `spec_bootstrap` | Branch | ベースライン spec 生成（state-machine-only、run state 非参加） |

### Events

| Event | From | To | Description |
|-------|------|----|-------------|
| `propose` | start | proposal | Proposal 作成開始 |
| `accept_proposal` | proposal | design | Proposal 承認 → Design フェーズへ |
| `accept_design` | design | apply | Design 承認 → Apply フェーズへ |
| `accept_apply` | apply | approved | 実装承認 |
| `reject` | proposal/design/apply | rejected | 拒否 |
| `revise_design` | design | design | Design 修正ループ（自己遷移） |
| `revise_apply` | apply | apply | Apply 修正ループ（自己遷移） |
| `explore_start` | start | explore | Explore 開始 |
| `explore_complete` | explore | start | Explore 完了 → start に復帰 |
| `spec_bootstrap_start` | start | spec_bootstrap | Spec bootstrap 開始 |
| `spec_bootstrap_complete` | spec_bootstrap | start | Spec bootstrap 完了 → start に復帰 |

### v2.0 Breaking Changes

- `revise` イベントは削除され、`revise_design` と `revise_apply` に分割
- `explore` と `spec_bootstrap` 状態が追加（ブランチパス）
- version フィールドが `"1.0"` → `"2.0"` に変更

### Branch Paths (D6)

`explore` と `spec_bootstrap` は state-machine.json と specflow-run CLI で完全にサポートされている（`specflow-run advance ... explore_start` は有効な遷移）。ただし、現在のスラッシュコマンド（`/specflow.explore`, `/specflow.spec`）はこれらのイベントをまだ emit しない。理由: これらは change スコープではなく、自然な `run_id` が存在しない。将来的に synthetic run ID（例: `_explore_<timestamp>`）を導入する可能性がある。

## Run State Schema (v2.0)

### Required Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `run_id` | string | 引数 | OpenSpec change 名 |
| `change_name` | string | 引数 | run_id と同値 |
| `current_phase` | string | 状態遷移 | 現在の状態 |
| `status` | string | 固定 | `"active"` |
| `allowed_events` | string[] | state-machine.json | 現在の状態で有効なイベント |
| `issue` | object/null | `--issue-url` | GitHub issue メタデータ |
| `project_id` | string | `git remote get-url origin` | `owner/repo` 形式 |
| `repo_name` | string | `project_id` と同値 | 将来の multi-project 拡張用に予約 |
| `repo_path` | string | `git rev-parse --show-toplevel` | リポジトリルートの絶対パス |
| `branch_name` | string | `git rev-parse --abbrev-ref HEAD` | 現在のブランチ名 |
| `worktree_path` | string | `git rev-parse --show-toplevel` | ワークツリーの絶対パス |
| `agents` | object | デフォルト or フラグ | `{ main: "claude", review: "codex" }` |
| `last_summary_path` | string/null | `update-field` | 最新サマリーファイルのパス |
| `created_at` | string | 自動 | ISO 8601 タイムスタンプ |
| `updated_at` | string | 自動 | ISO 8601 タイムスタンプ |
| `history` | array | 自動 | 遷移履歴 |

### Schema Validation

`specflow-run advance`, `status`, `update-field` は読み込み時に required fields の存在を検証する。v2.0 以前の `run.json`（required fields が欠落）は明確なエラーメッセージで拒否される。

### Migration Policy

既存の `run.json` のマイグレーションは行わない。`.specflow/runs/` は gitignore されておりローカルのみの状態。旧スキーマの run は `specflow-run start` で再作成する。

## UI Binding Metadata Separation

配信固有のメタデータ（Slack チャンネル、スレッド ID、メッセージルーティング等）は `run.json` に含めない。

命名規約: `.specflow/runs/<run_id>/<ui>.json`

例: `.specflow/runs/my-change/slack.json`

これにより:
- ワークフロー状態がポータブルに保たれる
- UI 統合が交換可能になる
- DM / チャンネル / スレッドサポートがワークフローコアを汚染しない

## specflow-run CLI

### Subcommands

| Command | Description |
|---------|-------------|
| `specflow-run start <run_id> [--issue-url <url>] [--agent-main <name>] [--agent-review <name>]` | 新規 run を初期化 |
| `specflow-run advance <run_id> <event>` | 状態遷移を実行 |
| `specflow-run status <run_id>` | 現在の run 状態を表示 |
| `specflow-run update-field <run_id> <field> <value>` | 許可されたフィールドを更新（現在: `last_summary_path` のみ） |

### Output Contract

- 成功時: stdout に JSON、stderr は空
- 失敗時: stderr にエラーメッセージ、exit code 非ゼロ
