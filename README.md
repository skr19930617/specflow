# specflow

GitHub issue URL を入力にして、Claude + OpenAI による spec → clarify → review → implement → review のワークフローを Claude Code 内でインタラクティブに回すツール。

プロジェクトごとの設定テンプレートは別リポジトリ [specflow-template](https://github.com/skr19930617/specflow-template) にある。

## セットアップ

### 1. 前提ツール

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 / テンプレート取得 | `brew install gh && gh auth login` |
| `claude` | spec の clarify / plan / implement | Claude Code CLI |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |
| speckit | spec/plan/tasks/implement 管理 | `.specify/` を各プロジェクトにセットアップ |
| `OPENAI_API_KEY` | OpenAI API 認証 (レビュー用) | 環境変数に設定 |

### 2. GitHub CLI 認証

```bash
# GitHub.com
gh auth login

# GitHub Enterprise
gh auth login --hostname your.github.enterprise.host

# 確認
gh auth status
```

### 3. OpenAI API キーの設定

環境変数 `OPENAI_API_KEY` をシェルに設定:

```bash
# bash: ~/.bashrc
# zsh:  ~/.zshrc
export OPENAI_API_KEY="sk-..."

# fish: ~/.config/fish/config.fish
set -gx OPENAI_API_KEY "sk-..."
```

`specflow-init` を実行すると `.mcp.json` がプロジェクトに自動コピーされ、Claude Code が OpenAI MCP サーバーを自動起動する。手動で設定する場合は `global/mcp.json` をプロジェクトルートに `.mcp.json` としてコピー:

```bash
cp global/mcp.json /path/to/your-project/.mcp.json
```

### 4. Claude Code 権限

`global/claude-settings.json` を参考に、`~/.claude/settings.json` に権限をマージする。

### 5. テンプレートリポジトリの設定

`specflow-init` がプロジェクト初期化時にテンプレートを取得するリポジトリを指定する。

**方法 A: スクリプト内の変数を編集**

`bin/specflow-init` の `DEFAULT_TEMPLATE_REPO` を自分のリポジトリに変更:

```bash
# bin/specflow-init 内
DEFAULT_TEMPLATE_REPO="skr19930617/specflow-template"
```

**方法 B: 環境変数で指定**

```bash
export SPECFLOW_TEMPLATE_REPO="your-user/specflow-template"
```

### 6. `/specflow` スラッシュコマンドのインストール

`specflow-init` を実行すると自動で `~/.claude/commands/` にコピーされる。手動でインストールする場合:

```bash
mkdir -p ~/.claude/commands
cp global/specflow*.md ~/.claude/commands/
```

### 7. bin/ を PATH に通す

```bash
mkdir -p ~/bin

ln -sf "$(pwd)/bin/specflow-fetch-issue" ~/bin/specflow-fetch-issue
ln -sf "$(pwd)/bin/specflow-init" ~/bin/specflow-init
```

`~/bin` が PATH に入っていなければシェル設定に追加:

```bash
# bash/zsh
export PATH="$HOME/bin:$PATH"

# fish
set -gx fish_user_paths ~/bin $fish_user_paths
```

## 使い方

### 1. 対象リポジトリで初期化（初回のみ）

```bash
cd /path/to/your-project
specflow-init
```

テンプレートリポジトリから `.specflow/`、`.mcp.json`、`CLAUDE.md` が取得される。
`~/.claude/commands/specflow*.md` も自動でインストールされる。
初期化後に編集すべきファイルは [specflow-template の README](https://github.com/skr19930617/specflow-template#セットアップ後に編集すべきファイル) を参照。

### 2. issue URL を渡して実行

Claude Code 内で:

```
/specflow https://github.com/OWNER/REPO/issues/123
```

URL なしで起動してインタラクティブに入力:

```
/specflow
```

### 3. `/specflow` のフロー

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

## 設定一覧

| 設定 | 場所 | 要変更 |
|------|------|--------|
| テンプレートリポジトリ | `bin/specflow-init` の `DEFAULT_TEMPLATE_REPO` or 環境変数 `SPECFLOW_TEMPLATE_REPO` | **必須** — 自分のリポジトリ名に変更 |
| `/specflow` スラッシュコマンド | `~/.claude/commands/specflow*.md` (ソース: `global/specflow*.md`) | `specflow-init` で自動インストール |
| OpenAI MCP サーバー | プロジェクトルートの `.mcp.json` (参考: `global/mcp.json`) | **必須** — `OPENAI_API_KEY` 環境変数を設定。`specflow-init` で自動コピー |
| Claude Code 権限 | `~/.claude/settings.json` (参考: `global/claude-settings.json`) | 任意 |

## ファイル構成

```
specflow/                      # このリポジトリ（ツール）
  bin/
    specflow-fetch-issue       #   gh で issue 取得
    specflow-init              #   テンプレートリポジトリから .specflow/ を初期化
  global/                      # グローバル設定のサンプル
    specflow.md                #   /specflow メインコマンド
    specflow.review.md         #   /specflow.review (spec review 再実行)
    specflow.build.md          #   /specflow.build (plan → implement → review)
    specflow.approve.md        #   /specflow.approve (commit → push → PR)
    specflow.fix.md            #   /specflow.fix (修正 → re-review)
    specflow.reject.md         #   /specflow.reject (全変更破棄)
    mcp.json                   #   .mcp.json 用 (OpenAI MCP サーバー設定)
    claude-settings.json       #   ~/.claude/settings.json 用
  README.md

specflow-template/             # 別リポジトリ（プロジェクトテンプレート）
  .mcp.json                    #   OpenAI MCP サーバー設定
  CLAUDE.md                    #   Claude Code 用プロジェクト設定
  .specflow/
    config.env                 #   環境変数
    review_spec_prompt.txt     #   spec レビュープロンプト
    review_impl_prompt.txt     #   実装レビュープロンプト
  README.md
```
