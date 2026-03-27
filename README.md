# specflow

GitHub issue URL を入力にして、Claude + Codex による spec → clarify → review → implement → review のワークフローを自動で回す CLI ツール。

2 つの実行方法がある:

- **`/specflow` (Claude Code スラッシュコマンド、推奨)** — Claude Code 内でインタラクティブに実行。全ステップで介入・修正可能
- **`specflow` (bash CLI)** — ターミナルから非インタラクティブに実行（従来方式）

プロジェクトごとの設定テンプレートは別リポジトリ [specflow-template](https://github.com/skr19930617/specflow-template) にある。

## セットアップ

### 1. 前提ツール

以下がすべて PATH 上にあること。

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 / テンプレート取得 | `brew install gh` |
| `claude` | spec の clarify / plan / implement | Claude Code CLI |
| `codex` | spec / implementation のレビュー | OpenAI Codex CLI |
| `python3` | JSONL パース | macOS 標準 or `brew install python` |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |
| speckit | spec/plan/tasks/implement 管理 | `.specify/` を各プロジェクトにセットアップ |

### 2. GitHub CLI 認証

```bash
# GitHub.com
gh auth login

# GitHub Enterprise
gh auth login --hostname your.github.enterprise.host

# 確認
gh auth status
```

PAT を使う場合は `GITHUB_TOKEN` 環境変数でも可。

### 3. グローバル設定

#### Claude Code (`~/.claude/settings.json`)

`global/claude-settings.json` を参考に、既存の設定にマージする。

```bash
cat global/claude-settings.json
# 必要な permissions.allow エントリを ~/.claude/settings.json に追加
```

**要変更箇所:**
- `env.GITHUB_TOKEN` — PAT を使う場合のみ。`gh auth login` 済みなら不要

#### Codex (`~/.codex/config.toml`)

`global/codex-config.toml` を参考に設定。

```bash
# 新規の場合
mkdir -p ~/.codex
cp global/codex-config.toml ~/.codex/config.toml

# 既存がある場合は手動マージ
```

**要変更箇所:**
- `model` — 利用可能なモデル名に変更
- `model_reasoning_effort` — 必要に応じて調整 (`low` / `medium` / `high` / `xhigh`)
- `[trust]` セクション — 自分のホームディレクトリのパスに変更

### 4. テンプレートリポジトリの設定

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

### 5. `/specflow` スラッシュコマンドのインストール

`specflow-init` を実行すると自動で `~/.claude/commands/specflow.md` がコピーされる。手動でインストールする場合:

```bash
mkdir -p ~/.claude/commands
cp global/specflow.md ~/.claude/commands/specflow.md
```

### 6. bin/ を PATH に通す

**方法 A: シンボリックリンク（推奨）**

```bash
mkdir -p ~/bin

ln -sf "$(pwd)/bin/specflow" ~/bin/specflow
ln -sf "$(pwd)/bin/specflow-fetch-issue" ~/bin/specflow-fetch-issue
ln -sf "$(pwd)/bin/specflow-parse-jsonl.py" ~/bin/specflow-parse-jsonl.py
ln -sf "$(pwd)/bin/specflow-init" ~/bin/specflow-init
```

`~/bin` が PATH に入っていなければシェル設定に追加:

```bash
# bash: ~/.bashrc
# zsh:  ~/.zshrc
export PATH="$HOME/bin:$PATH"

# fish: ~/.config/fish/config.fish
set -gx fish_user_paths ~/bin $fish_user_paths
```

**方法 B: このリポジトリの bin/ を直接 PATH に追加**

```bash
# bash/zsh
export PATH="/path/to/specflow/bin:$PATH"

# fish
set -gx fish_user_paths /path/to/specflow/bin $fish_user_paths
```

## 使い方

### 1. 対象リポジトリで初期化（初回のみ）

```bash
cd /path/to/your-project
specflow-init
```

テンプレートリポジトリから `.specflow/` と `CLAUDE.md` が取得される。
`~/.claude/commands/specflow.md` も自動でインストールされる。
初期化後に編集すべきファイルは [specflow-template の README](https://github.com/skr19930617/specflow-template#セットアップ後に編集すべきファイル) を参照。

### 2. issue URL を渡して実行

#### Claude Code スラッシュコマンド（推奨）

Claude Code 内で:

```
/specflow https://github.com/OWNER/REPO/issues/123
```

URL なしで起動してインタラクティブに入力:

```
/specflow
```

#### bash CLI（従来方式）

```bash
specflow https://github.com/OWNER/REPO/issues/123
```

GitHub Enterprise:

```bash
specflow https://github.enterprise.local/OWNER/REPO/issues/123
```

### 3. `/specflow` のフロー

1. issue 本文を取得
2. **speckit.specify** で spec 作成 (feature branch + spec)
3. **speckit.clarify** 1st round — 人間がインタラクティブに clarify
4. **Codex** が spec をレビュー — 結果をテーブル形式で表示
5. **speckit.clarify** 2nd round — Codex findings を踏まえて人間が再度 clarify
6. **UI 選択**: plan に進む / もう一度 Codex review
7. **speckit.plan → speckit.tasks → speckit.implement** — 自動連続実行
8. **Codex** が実装をレビュー (自動)
9. **UI 選択**: approve / fix (個別指定可) / reject / change-spec

> `/specflow` は speckit を前提とし、全ステップでインタラクティブに操作可能。
> `specflow` (bash CLI) は従来方式で、speckit なしでも動作する。

## 設定一覧

| 設定 | 場所 | 要変更 |
|------|------|--------|
| テンプレートリポジトリ | `bin/specflow-init` の `DEFAULT_TEMPLATE_REPO` or 環境変数 `SPECFLOW_TEMPLATE_REPO` | **必須** — 自分のリポジトリ名に変更 |
| `/specflow` スラッシュコマンド | `~/.claude/commands/specflow.md` (ソース: `global/specflow.md`) | `specflow-init` で自動インストール |
| Claude Code 権限 | `~/.claude/settings.json` (参考: `global/claude-settings.json`) | 任意 |
| Codex モデル・trust | `~/.codex/config.toml` (参考: `global/codex-config.toml`) | 任意 |

## ファイル構成

```
specflow/                      # このリポジトリ（ツール）
  bin/
    specflow                   #   メインオーケストレーション
    specflow-fetch-issue       #   gh で issue 取得
    specflow-parse-jsonl.py    #   Codex JSONL → JSON 変換
    specflow-init              #   テンプレートリポジトリから .specflow/ を初期化
  global/                      # グローバル設定のサンプル
    specflow.md                #   ~/.claude/commands/ 用スラッシュコマンド
    claude-settings.json       #   ~/.claude/settings.json 用
    codex-config.toml          #   ~/.codex/config.toml 用
  README.md

specflow-template/             # 別リポジトリ（プロジェクトテンプレート）
  CLAUDE.md                    #   Claude Code 用プロジェクト設定
  .specflow/
    config.env                 #   環境変数
    review_spec_prompt.txt     #   spec レビュープロンプト
    review_impl_prompt.txt     #   実装レビュープロンプト
  .gitignore
  README.md
```
