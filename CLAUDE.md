# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/skr19930617/specflow) for issue-driven development.

### Prerequisites

- **OpenSpec CLI** — `npm install -g openspec` でインストール済みであること
- **Codex CLI** — `codex` コマンドがインストール済みであること（`npm install -g @openai/codex`）
### specflow Slash Commands

| コマンド | 役割 |
|----------|------|
| `/specflow <issue-url>` | issue → proposal → clarify → validate（OpenSpec CLI 連携） |
| `/specflow.explore` | OpenSpec explore ベースの自由対話 → GitHub issue 起票 |
| `/specflow.design` | design → tasks → Codex design review（OpenSpec CLI 連携） |
| `/specflow.review_design` | Codex design/tasks review を単独実行 |
| `/specflow.fix_design` | design/tasks のレビュー指摘を修正 → Codex re-review |
| `/specflow.apply` | implement → Codex impl review（OpenSpec CLI 連携） |
| `/specflow.review_apply` | Codex impl review を単独実行（ledger 更新・auto-fix loop 含む） |
| `/specflow.fix_apply` | impl のレビュー指摘を修正 → Codex impl re-review |
| `/specflow.approve` | commit → push → PR 作成 |
| `/specflow.reject` | 全変更破棄 |
| `/specflow.setup` | CLAUDE.md をインタラクティブに設定 |
| `/specflow.decompose` | spec の複雑さを分析し、issue-linked spec は GitHub sub-issue に分解 |
| `/specflow.dashboard` | 全 feature のレビュー台帳を集計し、ダッシュボードとして表示・保存 |
| `/specflow.license` | プロジェクト解析に基づいてライセンスファイルを生成 |
| `/specflow.readme` | プロジェクト解析に基づいて OSS 風 README を生成・更新 |

フロー: `/specflow` → `/specflow.design` → `/specflow.apply` → `/specflow.approve`
修正ループ: design → `/specflow.fix_design` / apply → `/specflow.fix_apply`
単独レビュー: `/specflow.review_design` / `/specflow.review_apply`

### Specflow Slash Commands (standalone)

specflow は OpenSpec CLI を内部で呼び出し、artifact の生成・管理を行う。各フェーズは個別にも実行可能:

- `/specflow.explore` — 自由対話 → GitHub issue 起票
- `/specflow.design` — OpenSpec artifacts 生成 (specs, design, tasks)
- `/specflow.apply` — OpenSpec apply 指示に従い実装

### Review Ledger

`/specflow.apply` と `/specflow.fix_apply` の実行時、Codex review 結果は `openspec/changes/<number>-<name>/review-ledger.json` に自動保存される。

- **自動追跡**: 各 review ラウンドの findings が累積的に記録される
- **手動 override**: finding の `status` を `"accepted_risk"` / `"ignored"` に手動変更可能
  - JSON ファイルを直接編集し、`status` フィールドを変更する
  - high severity の場合は `notes` フィールドに理由の記載が必須（空だと自動リバート）
  - override は次回 review 時にも保持される
- **バックアップ**: 更新前に `.bak` ファイルが自動作成される
- **Re-review 分類**: `/specflow.fix_apply` での再レビュー時、ledger が存在する場合は re-review 専用 prompt が使用される
  - 前回 findings は `resolved` / `still_open` / `new_findings` に自動分類される
  - `ledger_error` フラグ: ledger が破損していた場合 true となり、全 findings が new_findings として扱われる
  - `max_finding_id`: 全レビューを通じた最大 finding ID が ledger に保存され、新規 ID の衝突を防ぐ
  - 初回レビュー後に ledger が自動初期化される（`/specflow.apply` 実行時）

### Workflow Rules

- proposal は OpenSpec のディレクトリ構造 (`openspec/changes/<number>-<name>/proposal.md`) で管理される
- レビューは Codex MCP サーバー経由で実行される（プロジェクトルートの `.mcp.json` で設定）
- 実装時は proposal の acceptance criteria をすべて満たすこと
- `.specflow/` 配下のファイルは実装 diff に含めないこと
- レビュー指摘への対応時、proposal の意図を変えないこと
- 各フェーズの終了時に handoff ボタンでユーザーが次のアクションを選択する

## Tech Stack

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Commands

<!-- /specflow.setup で自動設定、または手動で記載 -->

## Code Style

<!-- /specflow.setup で自動設定、または手動で記載 -->

## MANUAL ADDITIONS

<!-- プロジェクト固有のルールをここに追記 -->
