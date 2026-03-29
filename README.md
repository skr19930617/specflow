# specflow

GitHub issue URL を入力にして、Claude + Codex による spec → clarify → review → plan → implement → review のワークフローを Claude Code 内でインタラクティブに回すツール。

## セットアップ

### 1. 前提ツール

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 | `brew install gh && gh auth login` |
| `claude` | spec の clarify / plan / implement | Claude Code CLI |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |
| `jq` | 設定マージ（install 時） | `brew install jq` |
| speckit | spec/plan/tasks/implement 管理 | `.specify/` を各プロジェクトにセットアップ |
| `codex` | Codex CLI (レビュー用 MCP サーバー) | `npm install -g @openai/codex` |

### 2. GitHub CLI 認証

```bash
gh auth login
gh auth status
```

### 3. インストール

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

リポジトリ更新後に `specflow-install` を再実行すると全体が最新に更新される（idempotent）。

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

## 使い方

### 1. 対象リポジトリで初期化（初回のみ）

```bash
cd /path/to/your-project
specflow-init
```

以下がプロジェクトルートにコピーされる:

- `.specflow/` — レビュープロンプト、設定ファイル
- `.mcp.json` — Codex MCP サーバー設定
- `CLAUDE.md` — Claude Code 用プロジェクト設定テンプレート

スラッシュコマンドを最新に更新したい場合:

```bash
specflow-init --update
```

> **Note:** 既存プロジェクトで `review_plan_prompt.txt` が `.specflow/` に存在しない場合は、`~/.config/specflow/template/.specflow/review_plan_prompt.txt` を手動でコピーしてください。

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
/specflow           fetch → specify → clarify → Codex spec review
                    ┌─ [Plan に進む]        → /specflow.plan
                    ├─ [Spec を修正]        → /specflow.spec_fix
                    └─ [中止]              → /specflow.reject

/specflow.spec_fix  Spec 修正 → Codex spec review 再実行
                    ┌─ [Plan に進む]        → /specflow.plan
                    ├─ [Spec を修正]        → /specflow.spec_fix
                    └─ [中止]              → /specflow.reject

/specflow.plan      plan → tasks → Codex plan/tasks review
                    ┌─ [実装に進む]         → /specflow.impl
                    ├─ [Plan を修正]        → /specflow.plan_fix
                    └─ [中止]              → /specflow.reject

/specflow.plan_fix  Plan/Tasks 修正 → Codex plan/tasks review 再実行
                    ┌─ [実装に進む]         → /specflow.impl
                    ├─ [Plan を修正]        → /specflow.plan_fix
                    └─ [中止]              → /specflow.reject

/specflow.impl      implement → Codex impl review
                    ┌─ [Approve & Commit]   → /specflow.approve
                    ├─ [Fix All]            → /specflow.fix
                    └─ [Reject]             → /specflow.reject

/specflow.fix       指摘を修正 → Codex impl re-review
                    ┌─ [Approve & Commit]   → /specflow.approve
                    ├─ [Fix All]            → /specflow.fix
                    └─ [Reject]             → /specflow.reject

/specflow.approve   commit → push → PR 作成
/specflow.reject    全変更破棄
/specflow.setup     CLAUDE.md をインタラクティブに設定
```

#### フェーズの流れ

1. `/specflow` — issue 取得 → spec 作成 → clarify → Codex spec review
2. `/specflow.plan` — plan 作成 → tasks 作成 → Codex plan/tasks review
3. `/specflow.impl` — speckit.implement → Codex impl review
4. `/specflow.approve` — commit → push → PR 作成

修正ループ:
- Spec に問題 → `/specflow.spec_fix` → spec 修正 → Codex spec re-review
- Plan に問題 → `/specflow.plan_fix` → plan/tasks 修正 → Codex plan/tasks re-review
- 実装に問題 → `/specflow.fix` → 修正 → Codex impl re-review

## MCP サーバー設定

specflow は Codex CLI を MCP サーバーとして使い、spec/plan/実装のレビューを行う。

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

## ファイル構成

```
specflow/                      # このリポジトリ（ツール）
  bin/
    specflow-install           #   グローバルインストール（PATH, コマンド, 権限, テンプレート）
    specflow-fetch-issue       #   gh で issue 取得
    specflow-init              #   プロジェクト初期化 / コマンド更新
  global/                      # グローバル設定・スラッシュコマンド
    specflow.md                #   /specflow メインコマンド（spec フェーズ）
    specflow.spec_fix.md       #   /specflow.spec_fix（spec 修正 → re-review）
    specflow.plan.md           #   /specflow.plan（plan → tasks → review）
    specflow.plan_fix.md       #   /specflow.plan_fix（plan/tasks 修正 → re-review）
    specflow.impl.md           #   /specflow.impl（implement → review）
    specflow.fix.md            #   /specflow.fix（impl 修正 → re-review）
    specflow.approve.md        #   /specflow.approve（commit → push → PR）
    specflow.reject.md         #   /specflow.reject（全変更破棄）
    specflow.setup.md          #   /specflow.setup（CLAUDE.md インタラクティブ設定）
    claude-settings.json       #   ~/.claude/settings.json 用権限テンプレート
  template/                    # プロジェクトテンプレート（init でコピーされる）
    .specflow/
      config.env               #   環境変数
      review_spec_prompt.txt   #   spec レビュープロンプト
      review_plan_prompt.txt   #   plan/tasks レビュープロンプト
      review_impl_prompt.txt   #   実装レビュープロンプト
    .mcp.json                  #   Codex MCP サーバー設定
    CLAUDE.md                  #   Claude Code 用プロジェクト設定テンプレート
  README.md

~/.config/specflow/            # specflow-install でコピーされる
  template/                    #   init 時の参照元
  global/                      #   update 時の参照元
```
