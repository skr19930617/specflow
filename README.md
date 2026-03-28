# specflow

GitHub issue URL を入力にして、Claude + OpenAI による spec → clarify → review → implement → review のワークフローを Claude Code 内でインタラクティブに回すツール。

## セットアップ

### 1. 前提ツール

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 | `brew install gh && gh auth login` |
| `claude` | spec の clarify / plan / implement | Claude Code CLI |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |
| `jq` | 設定マージ（install 時） | `brew install jq` |
| speckit | spec/plan/tasks/implement 管理 | `.specify/` を各プロジェクトにセットアップ |
| `OPENAI_API_KEY` | OpenAI API 認証 (MCP サーバー用) | 環境変数に設定 |

### 2. GitHub CLI 認証

```bash
gh auth login
gh auth status
```

### 3. OpenAI API キーの設定

```bash
# bash/zsh
export OPENAI_API_KEY="sk-..."

# fish
set -gx OPENAI_API_KEY "sk-..."
```

### 4. インストール

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
- `.mcp.json` — OpenAI MCP サーバー設定（`OPENAI_API_KEY` 環境変数を参照）
- `CLAUDE.md` — Claude Code 用プロジェクト設定テンプレート

スラッシュコマンドを最新に更新したい場合:

```bash
specflow-init --update
```

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

```
/specflow           fetch → specify → clarify → OpenAI review → clarify
                    ┌─ [Plan に進む]        → /specflow.build
                    └─ [もう一度 Review]    → /specflow.review

/specflow.review    OpenAI spec review 再実行 + clarify
                    ┌─ [Plan に進む]        → /specflow.build
                    └─ [もう一度 Review]    → /specflow.review

/specflow.build     plan → tasks → implement → OpenAI impl review
                    ┌─ [Approve & Commit]   → /specflow.approve
                    ├─ [Fix All]            → /specflow.fix
                    └─ [Reject (全変更破棄)] → /specflow.reject

/specflow.approve   commit → push → PR 作成
/specflow.fix       指摘を修正 → OpenAI re-review → 同じ3ボタン
/specflow.reject    git checkout + git clean で全変更破棄
/specflow.setup     CLAUDE.md をインタラクティブに設定
```

1. issue 本文を取得
2. **speckit.specify** で spec 作成 (feature branch + spec)
3. **speckit.clarify** 1st round — 人間がインタラクティブに clarify
4. **OpenAI** が spec をレビュー — 結果をテーブル形式で表示
5. **speckit.clarify** 2nd round — review findings を踏まえて人間が再度 clarify
6. **UI 選択**: plan に進む / もう一度 review
7. **speckit.plan → speckit.tasks → speckit.implement** — 自動連続実行
8. **OpenAI** が実装をレビュー (自動)
9. **UI 選択**: approve & commit / fix all / reject

## MCP サーバー設定

specflow は OpenAI MCP サーバーを使って spec/実装のレビューを行う。

`specflow-init` がプロジェクトルートに `.mcp.json` を自動コピーする:

```json
{
  "mcpServers": {
    "openai": {
      "command": "npx",
      "args": ["-y", "@mzxrai/mcp-openai"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

Claude Code がプロジェクトを開くと `.mcp.json` を読み込み、`openai` MCP サーバーを自動起動する。
`OPENAI_API_KEY` 環境変数が設定されていれば追加設定は不要。

## 設定一覧

| 設定 | 場所 | 設定方法 |
|------|------|----------|
| OpenAI MCP サーバー | プロジェクトルートの `.mcp.json` | `specflow-init` で自動コピー |
| OpenAI API キー | 環境変数 `OPENAI_API_KEY` | **必須** — シェル設定に追加 |
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
    specflow.md                #   /specflow メインコマンド
    specflow.setup.md          #   /specflow.setup (CLAUDE.md インタラクティブ設定)
    specflow.review.md         #   /specflow.review (spec review 再実行)
    specflow.build.md          #   /specflow.build (plan → implement → review)
    specflow.approve.md        #   /specflow.approve (commit → push → PR)
    specflow.fix.md            #   /specflow.fix (修正 → re-review)
    specflow.reject.md         #   /specflow.reject (全変更破棄)
    claude-settings.json       #   ~/.claude/settings.json 用権限テンプレート
  template/                    # プロジェクトテンプレート（init でコピーされる）
    .specflow/
      config.env               #   環境変数
      review_spec_prompt.txt   #   spec レビュープロンプト
      review_impl_prompt.txt   #   実装レビュープロンプト
    .mcp.json                  #   OpenAI MCP サーバー設定
    CLAUDE.md                  #   Claude Code 用プロジェクト設定テンプレート
  README.md

~/.config/specflow/            # specflow-install でコピーされる
  template/                    #   init 時の参照元
  global/                      #   update 時の参照元
```
