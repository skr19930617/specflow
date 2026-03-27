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

### 3. グローバル設定

#### Claude Code (`~/.claude/settings.json`)

`template/global/claude-settings.json` を参考に、既存の設定にマージする。

```bash
cat template/global/claude-settings.json
# 必要な permissions.allow エントリを ~/.claude/settings.json に追加
```

**要変更箇所:**
- `env.GITHUB_TOKEN` — PAT を使う場合のみ。`gh auth login` 済みなら不要

#### Codex (`~/.codex/config.toml`)

`template/global/codex-config.toml` を参考に設定。

```bash
# 新規の場合
cp template/global/codex-config.toml ~/.codex/config.toml

# 既存がある場合は手動マージ
```

**要変更箇所:**
- `model` — 利用可能なモデル名に変更
- `model_reasoning_effort` — 必要に応じて調整 (`low` / `medium` / `high` / `xhigh`)
- `[trust]` セクション — 自分のホームディレクトリのパスに変更

### 4. bin/ を PATH に通す

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

以下が作られる:

```
your-project/
  CLAUDE.md                 # ← 要編集
  .specflow/
    config.env              # ← 必要に応じて編集
    review_spec_prompt.txt  # ← 必要に応じて編集
    review_impl_prompt.txt  # ← 必要に応じて編集
    state/
```

### 2. 初期化後に編集すべきファイル

| ファイル | 要変更箇所 | 説明 |
|----------|-----------|------|
| `CLAUDE.md` | `Tech Stack` セクション | プロジェクトの言語・FW・ランタイムを記入 |
| `CLAUDE.md` | `Commands` セクション | ビルド・テスト・リントのコマンドを記入 |
| `CLAUDE.md` | `Code Style` セクション | コーディング規約があれば記入 |
| `.specflow/config.env` | 環境変数 | プロジェクト固有の変数があれば追加 |
| `.specflow/review_spec_prompt.txt` | レビュー観点 | spec レビューの観点をカスタマイズ（JSON フォーマット部分は維持） |
| `.specflow/review_impl_prompt.txt` | レビュー観点 | 実装レビューの観点をカスタマイズ（JSON フォーマット部分は維持） |

### 3. issue URL を渡して実行

```bash
cd /path/to/your-project
specflow https://github.com/OWNER/REPO/issues/123
```

GitHub Enterprise:

```bash
specflow https://github.enterprise.local/OWNER/REPO/issues/123
```

### 4. フロー

1. issue 本文を取得
2. spec.md を生成
3. Claude が spec を clarify
4. Codex が spec をレビュー
5. レビュー指摘があれば Claude が修正
6. Claude が plan / tasks を作成
7. Claude が実装
8. Codex が実装をレビュー → あなたが approve / fix / reject / change-spec を選択

## ファイル構成

```
spec-scripts/
  bin/
    specflow                 # メインオーケストレーション
    specflow-fetch-issue     # gh で issue 取得
    specflow-parse-jsonl.py  # Codex JSONL → JSON 変換
    specflow-init            # 対象リポジトリに .specflow/ と CLAUDE.md を初期化
  template/
    repo/                    # specflow-init がコピーするテンプレート
      CLAUDE.md              #   Claude Code 用プロジェクト設定
      .specflow/
        config.env           #   環境変数
        review_spec_prompt.txt   # spec レビュープロンプト
        review_impl_prompt.txt   # 実装レビュープロンプト
    global/                  # ホームに配置するグローバル設定のサンプル
      claude-settings.json   #   ~/.claude/settings.json 用
      codex-config.toml      #   ~/.codex/config.toml 用
  README.md
```
