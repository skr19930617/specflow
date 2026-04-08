# specflow

![Bash](https://img.shields.io/badge/Bash-4EAA25?logo=gnubash&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

[日本語](#セットアップ) | [English](#english)

GitHub issue URL を入力にして、Claude + Codex による proposal → clarify → validate → design → implement → review のワークフローを Claude Code 内でインタラクティブに回すツール。

## セットアップ

### 1. 前提ツール

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 | `brew install gh && gh auth login` |
| `claude` | proposal の clarify / design / implement | Claude Code CLI |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |
| `jq` | 設定マージ（install 時） | `brew install jq` |
| OpenSpec CLI | proposal/design/tasks/implement 管理 | `npm install -g openspec` でインストール |
| `codex` | Codex CLI (レビュー用 MCP サーバー) | `npm install -g @openai/codex` |

### 2. GitHub CLI 認証

```bash
gh auth login
gh auth status
```

### 3. インストール

```bash
curl -fsSL https://raw.githubusercontent.com/skr19930617/specflow/main/install.sh | bash
```

手動インストール:

```bash
git clone https://github.com/skr19930617/specflow.git
cd specflow
./bin/specflow-install
```

これで以下が自動で行われる:

- `template/`, `global/` → `~/.config/specflow/` にコピー（init / update 時の参照元）
- `bin/specflow-*` → `~/bin/` にシンボリックリンク
- `global/specflow*.md` → `~/.claude/commands/` にコピー（スラッシュコマンド）
- `global/claude-settings.json` の権限 → `~/.claude/settings.json` に差分マージ

curl コマンドを再実行すると全体が最新に更新される（idempotent）。手動インストールの場合は `specflow-install` を再実行する。スラッシュコマンドの更新（review-ledger 機能の追加等）を反映するには、再実行が必要。

`~/bin` が PATH に入っていない場合はシェル設定に追加:

```bash
# bash/zsh
export PATH="$HOME/bin:$PATH"

# fish
set -gx fish_user_paths ~/bin $fish_user_paths
```

### 5. (任意) 外部テンプレートリポジトリの指定

デフォルトでは `specflow-init` は `~/.config/specflow/template/` からファイルをコピーする。
カスタムテンプレートを使いたい場合のみ環境変数を設定:

```bash
export SPECFLOW_TEMPLATE_REPO="your-user/specflow-template"
```

## 前提条件チェックとトラブルシューティング

specflow コマンド実行時に以下のエラーが表示された場合、対応するコマンドを実行してください:

| # | エラー状態 | 検出条件 | 対処コマンド | 結果 |
|---|-----------|----------|-------------|------|
| 1 | OpenSpec CLI 未インストール | `openspec/` ディレクトリが存在しない | `npm install -g openspec` | OpenSpec CLI がインストールされる |
| 2 | specflow 未初期化 | `.specflow/config.env` が存在しない | `specflow-init` | `.specflow/config.env` が生成される |

**新規セットアップの流れ:**

1. specflow をインストール: `./bin/specflow-install`
2. OpenSpec CLI をインストール: `npm install -g openspec`
3. 対象プロジェクトで specflow を初期化: `specflow-init`
4. CLAUDE.md を設定: Claude Code 内で `/specflow.setup` を実行
5. `/specflow` を実行して開始

> **Note:** `specflow-init` は `.specflow/config.env`、`.mcp.json`、`CLAUDE.md` を生成します。`openspec/` ディレクトリは `/specflow` 初回実行時に OpenSpec CLI が自動作成します。`/specflow.setup` は既存の `CLAUDE.md` をインタラクティブに設定するコマンドです。

## 使い方

### 1. 対象リポジトリで初期化（初回のみ）

```bash
cd /path/to/your-project
specflow-init
```

以下がプロジェクトルートに生成される:

- `.specflow/config.env` — エージェント設定
- `.mcp.json` — Codex MCP サーバー設定
- `CLAUDE.md` — Claude Code 用プロジェクト設定テンプレート

スラッシュコマンドを最新に更新したい場合:

```bash
specflow-init --update
```

> **Note:** 既存プロジェクトで `review_design_prompt.md` や `review_apply_rereview_prompt.md` が見つからない場合は、`specflow-install` を再実行してください。

### 2. CLAUDE.md のセットアップ

Claude Code 内で:

```
/specflow.setup
```

Tech Stack、Commands、Code Style をインタラクティブに設定して CLAUDE.md を更新する。

### 3. issue URL を渡して実行

Claude Code 内で:

```
/specflow https://github.com/OWNER/REPO/issues/123
```

URL なしで起動してインタラクティブに入力:

```
/specflow
```

### 4. `/specflow` のフロー

各コマンドは1つのフェーズだけを担当し、終了時に handoff ボタンで次のステップに進む。

```
/specflow           fetch → proposal 作成 → clarify → validate
                    ┌─ [Design に進む]      → /specflow.design
                    ├─ [Explore]            → /specflow.explore
                    └─ [中止]              → /specflow.reject

/specflow.explore   アイデア探索・問題調査・設計検討のための思考パートナー
                    ┌─ [Design に進む]      → /specflow.design
                    └─ [中止]              → /specflow.reject

/specflow.design    design artifacts 生成 → Codex design review
                    ┌─ [実装に進む]         → /specflow.apply
                    ├─ [Design を修正]      → /specflow.fix_design
                    └─ [中止]              → /specflow.reject

/specflow.fix_design Design/Tasks 修正 → Codex design/tasks review 再実行
                    ┌─ [実装に進む]         → /specflow.apply
                    ├─ [Design を修正]      → /specflow.fix_design
                    └─ [中止]              → /specflow.reject

/specflow.apply     implement → Codex impl review
                    ┌─ [Approve & Commit]   → /specflow.approve
                    ├─ [Fix All]            → /specflow.fix_apply
                    └─ [Reject]             → /specflow.reject

/specflow.fix_apply      指摘を修正 → Codex impl re-review
                    ┌─ [Approve & Commit]   → /specflow.approve
                    ├─ [Fix All]            → /specflow.fix_apply
                    └─ [Reject]             → /specflow.reject

/specflow.approve   commit → push → PR 作成
/specflow.reject    全変更破棄
/specflow.setup     CLAUDE.md をインタラクティブに設定
/specflow.decompose spec の複雑さを分析 → issue-linked spec は GitHub sub-issue に分解
/specflow.dashboard 全 feature のレビュー台帳を集計 → ダッシュボード表示・保存
/specflow.license   プロジェクト解析に基づいてライセンスファイルを生成
/specflow.readme    プロジェクト解析に基づいて OSS 風 README を生成・更新
```

#### フェーズの流れ

1. `/specflow` — issue 取得 → proposal 作成 → clarify → validate（OpenSpec CLI 連携）
2. `/specflow.explore` — (任意) アイデア探索・問題調査・設計検討
3. `/specflow.design` — design artifacts 生成 → Codex design review
4. `/specflow.apply` — OpenSpec apply → tasks 実装 → Codex apply review
5. `/specflow.approve` — commit → push → PR 作成

修正ループ:
- Design に問題 → `/specflow.fix_design` → design/tasks 修正 → Codex design/tasks re-review
- 実装に問題 → `/specflow.fix_apply` → 修正 → Codex impl re-review

ユーティリティ:
- `/specflow.decompose` — spec の複雑さを分析し、issue-linked spec は GitHub sub-issue に分解
- `/specflow.dashboard` — 全 feature のレビュー台帳を集計し、ダッシュボードとして表示・保存
- `/specflow.license` — プロジェクト解析に基づいてライセンスファイルを生成
- `/specflow.readme` — プロジェクト解析に基づいて OSS 風 README を生成・更新

## MCP サーバー設定

specflow は Codex CLI を MCP サーバーとして使い、proposal/design/実装のレビューを行う。

`specflow-init` がプロジェクトルートに `.mcp.json` を自動コピーする:

```json
{
  "mcpServers": {
    "codex": {
      "command": "codex",
      "args": ["mcp-server"]
    }
  }
}
```

Claude Code がプロジェクトを開くと `.mcp.json` を読み込み、`codex` MCP サーバーを自動起動する。
Codex CLI がインストール済みであれば追加設定は不要（Codex team プランの課金で動作）。

## 設定一覧

| 設定 | 場所 | 設定方法 |
|------|------|----------|
| Codex MCP サーバー | プロジェクトルートの `.mcp.json` | `specflow-init` で自動コピー |
| Codex CLI | `codex` コマンド | `npm install -g @openai/codex` |
| スラッシュコマンド | `~/.claude/commands/specflow*.md` | `specflow-install` で自動インストール |
| Claude Code 権限 | `~/.claude/settings.json` | `specflow-install` で自動マージ |
| プロジェクト設定 | プロジェクトルートの `CLAUDE.md` | `/specflow.setup` でインタラクティブに設定 |
| 外部テンプレート | 環境変数 `SPECFLOW_TEMPLATE_REPO` | 任意 — デフォルトはローカルテンプレート |

## リポジトリアーキテクチャ

このリポジトリには 2 種類のコンテンツが含まれる:

1. **配布物 (Distributable Assets)** — ユーザープロジェクトにインストールされるツール
2. **リポジトリ計画状態 (Repository Planning State)** — specflow 自体の開発計画・設計資産

```
specflow/
├── bin/                           # 配布物: インストール・初期化スクリプト
├── global/                        # 配布物: Claude Code スラッシュコマンド
├── template/                      # 配布物: プロジェクトブートストラップテンプレート
└── openspec/                      # 計画状態: OpenSpec 準拠のリポジトリ内部資産
    ├── specs/                     #   Capability specs (現在の真実) — 現在は空
    ├── changes/                   #   Change records (提案・変更履歴)
    │   ├── <change-name>/          #     各変更の proposal / design / tasks
    │   └── archive/                #     完了済み変更レコード
    └── README.md                  #   OpenSpec ディレクトリ規約
```

### 配布物 vs 計画状態の区別

| ディレクトリ | 種類 | 用途 |
|-------------|------|------|
| `bin/` | 配布物 | インストール・初期化・ユーティリティスクリプト |
| `global/` | 配布物 | Claude Code スラッシュコマンド定義 |
| `template/` | 配布物 | プロジェクトブートストラップ資産 |
| `openspec/` | 計画状態 | specflow 自体の proposal / design / tasks |

## ファイル構成

```
specflow/                        # このリポジトリ（ツール）
  .claude/                       # Claude Code プロジェクト設定
    commands/opsx/               #   OpenSpec CLI 直接操作コマンド
    skills/                      #   スキル定義（openspec-apply-change 等）
    settings.json                #   プロジェクト権限設定
    settings.local.json          #   ローカル権限設定（git 管理外）
  bin/
    specflow-analyze             #   プロジェクト解析（言語、フレームワーク、ライセンス検出）
    specflow-create-sub-issues   #   GitHub sub-issue 作成
    specflow-fetch-issue         #   gh で issue 取得
    specflow-filter-diff         #   diff フィルタリング
    specflow-init                #   プロジェクト初期化 / コマンド更新
    specflow-install             #   グローバルインストール（PATH, コマンド, 権限, テンプレート）
  global/                        # グローバル設定・スラッシュコマンド
    commands/                    #   スラッシュコマンド定義
    prompts/                     #   レビュー・ワークフロープロンプト
    claude-settings.json         #   ~/.claude/settings.json 用権限テンプレート
  template/                      # プロジェクトテンプレート（init でコピーされる）
    CLAUDE.md                    #   Claude Code 用プロジェクト設定テンプレート
  openspec/                      # このリポジトリの計画状態 (OpenSpec)
    specs/                       #   Capability specs
    changes/                     #   変更レコード
    README.md                    #   OpenSpec ディレクトリ規約
  .gitignore                     # Git 除外設定
  .mcp.json                      # Codex MCP サーバー設定
  install.sh                     # curl ワンライナーインストーラー
  CLAUDE.md                      # プロジェクトガイドライン
  LICENSE                        # MIT License
  README.md

~/.config/specflow/              # specflow-install でコピーされる
  template/                      #   init 時の参照元
  global/                        #   update 時の参照元
```

## 貢献

コントリビューション歓迎です。お気軽に Pull Request をお送りください。

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Request を作成

## ライセンス

このプロジェクトは MIT License のもとで公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

---

<a id="english"></a>

# English

An interactive tool that runs the full proposal → clarify → validate → design → implement → review workflow inside Claude Code, driven by GitHub issue URLs using Claude + Codex.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/skr19930617/specflow/main/install.sh | bash
```

Or install manually:

```bash
git clone https://github.com/skr19930617/specflow.git
cd specflow
./bin/specflow-install
```

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| `gh` | Fetch GitHub issues | `brew install gh && gh auth login` |
| `claude` | Proposal clarify / design / implement | Claude Code CLI |
| `git` | Repository operations | macOS built-in or `brew install git` |
| `jq` | Config merging (during install) | `brew install jq` |
| OpenSpec CLI | Proposal/design/tasks/implement management | `npm install -g openspec` |
| `codex` | Codex CLI (review MCP server) | `npm install -g @openai/codex` |

## Usage

1. Initialize your project (first time only):
   ```bash
   cd /path/to/your-project
   specflow-init
   ```

2. Set up CLAUDE.md interactively in Claude Code:
   ```
   /specflow.setup
   ```

3. Start the workflow with a GitHub issue:
   ```
   /specflow https://github.com/OWNER/REPO/issues/123
   ```

### Workflow

```
/specflow          → proposal → clarify → validate
/specflow.design   → design artifacts → Codex review
/specflow.apply    → implement → Codex review
/specflow.approve  → commit → push → PR
```

Fix loops: `/specflow.fix_design` (design fixes) and `/specflow.fix_apply` (implementation fixes).

Utilities: `/specflow.decompose` (split into sub-issues), `/specflow.dashboard` (review ledger dashboard), `/specflow.license` (generate license), `/specflow.readme` (generate README).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
