# specflow

GitHub issue URL を入力にして、Claude + Codex による spec → clarify → review → implement → review のワークフローを自動で回すスクリプト群。

## セットアップ

### 1. 前提ツール

以下がすべて PATH 上にあること。

| ツール | 用途 | インストール |
|--------|------|-------------|
| `gh` | GitHub issue の取得 | `brew install gh` |
| `claude` | spec の clarify / plan / implement | Claude Code CLI |
| `codex` | spec / implementation のレビュー | OpenAI Codex CLI |
| `python3` | JSONL パース、issue→spec 変換 | macOS 標準 or `brew install python` |
| `git` | リポジトリ操作 | macOS 標準 or `brew install git` |

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

### 3. bin/ を PATH に通す

このリポジトリの `bin/` ディレクトリを PATH に追加する。

**方法 A: シンボリックリンク（推奨）**

```bash
# ~/bin がなければ作る
mkdir -p ~/bin

# 各スクリプトをリンク
ln -sf "$(pwd)/bin/specflow" ~/bin/specflow
ln -sf "$(pwd)/bin/specflow-fetch-issue" ~/bin/specflow-fetch-issue
ln -sf "$(pwd)/bin/specflow-parse-jsonl.py" ~/bin/specflow-parse-jsonl.py
ln -sf "$(pwd)/bin/specflow-init" ~/bin/specflow-init
```

`~/bin` が PATH に入っていなければシェル設定に追加:

```bash
# bash: ~/.bashrc
# zsh:  ~/.zshrc
# fish: ~/.config/fish/config.fish → set -gx fish_user_paths ~/bin $fish_user_paths
export PATH="$HOME/bin:$PATH"
```

**方法 B: このリポジトリの bin/ を直接 PATH に追加**

```bash
# bash/zsh
export PATH="/path/to/spec-scripts/bin:$PATH"

# fish
set -gx fish_user_paths /path/to/spec-scripts/bin $fish_user_paths
```

`/path/to/spec-scripts` はクローンした場所に置き換えること。

## 使い方

### 1. 対象リポジトリで初期化（初回のみ）

```bash
cd /path/to/your-project
specflow-init
```

`.specflow/` ディレクトリが作られる:

```
.specflow/
  config.env              # プロジェクト固有の環境変数
  review_spec_prompt.txt  # Codex spec レビュー用プロンプト
  review_impl_prompt.txt  # Codex 実装レビュー用プロンプト
  state/                  # 実行ごとの中間ファイル
```

### 2. issue URL を渡して実行

```bash
cd /path/to/your-project
specflow https://github.com/OWNER/REPO/issues/123
```

GitHub Enterprise:

```bash
specflow https://github.enterprise.local/OWNER/REPO/issues/123
```

### 3. フロー

1. issue 本文を取得
2. spec.md を生成
3. Claude が spec を clarify
4. Codex が spec をレビュー
5. レビュー指摘があれば Claude が修正
6. Claude が plan / tasks を作成
7. Claude が実装
8. Codex が実装をレビュー → あなたが approve / fix / reject / change-spec を選択

## カスタマイズ

### レビュープロンプト

`.specflow/review_spec_prompt.txt` と `.specflow/review_impl_prompt.txt` を編集すれば、Codex のレビュー観点を変更できる。出力は JSON を期待しているので、フォーマット指定部分は維持すること。

### config.env

`.specflow/config.env` にプロジェクト固有の環境変数を追加できる。`specflow` 実行時に `source` される。

## ファイル構成

```
spec-scripts/
  bin/
    specflow              # メインオーケストレーション
    specflow-fetch-issue  # gh で issue 取得
    specflow-parse-jsonl.py  # Codex JSONL → JSON 変換
    specflow-init         # .specflow/ 初期化
  README.md
```
