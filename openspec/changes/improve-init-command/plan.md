# Plan: improve-init-command

## Overview

`bin/specflow-init` を書き換えて、openspec CLI 呼び出し・プロジェクト名指定・ディレクトリ引数・エージェント選択を追加する。

## Architecture

### 実行フロー（新）

```
specflow-init [<project-name>] [--dir <path>] [--update]
  │
  ├─ --update → コマンド更新のみ（既存動作）→ 早期 exit
  │
  ├─ 引数解析
  │   ├─ <project-name> → PROJECT_NAME に設定
  │   ├─ --dir <path> → TARGET_DIR に設定
  │   └─ 引数なし → TARGET_DIR="", PROJECT_NAME=""
  │
  ├─ Preflight バリデーション（ファイル書き込み前に全チェック）
  │   ├─ openspec CLI 存在チェック（command -v openspec）
  │   └─ specflow-install 済みチェック（$CONFIG_DIR/template 存在）
  │
  ├─ ターゲットパス解決（ディレクトリ作成はまだしない）
  │   ├─ パターン 1: TARGET_PATH="./<project-name>"
  │   ├─ パターン 2/3: TARGET_PATH="<path>"
  │   └─ パターン 4: TARGET_PATH=$(git rev-parse --show-toplevel 2>/dev/null)
  │       → 空の場合: "Error: not inside a git repository." → exit 1
  │
  ├─ ターゲットパスバリデーション（ファイル書き込み前）
  │   ├─ --dir フローのみ: サブディレクトリチェック
  │   │   TARGET_PATH が既存 git リポジトリ内のサブディレクトリ → エラー
  │   └─ TARGET_PATH が既に存在する場合: openspec/config.yaml チェック → エラー
  │
  ├─ ターゲットディレクトリ作成 & 移動（バリデーション通過後）
  │   ├─ パターン 1: mkdir <project-name> && cd <project-name>
  │   ├─ パターン 2/3: mkdir -p <path> if needed && cd <path>
  │   └─ パターン 4: cd $TARGET_PATH
  │
  ├─ git init（git リポジトリがない場合のみ。パターン 1/2/3 で発生しうる）
  │
  ├─ プロジェクト名解決
  │   ├─ PROJECT_NAME が設定済み → そのまま使用
  │   └─ 未設定（パターン 2/4）→ ディレクトリ名をデフォルトで対話プロンプト
  │
  ├─ エージェント選択（番号選択式、2 回実行）
  │   ├─ main: select_agent(MAIN_AGENTS, MAIN_AGENT_DEFAULT) → MAIN_AGENT
  │   │   "Select main agent: 1) claude [default]"
  │   └─ review: select_agent(REVIEW_AGENTS, REVIEW_AGENT_DEFAULT) → REVIEW_AGENT
  │       "Select review agent: 1) codex [default]"
  │   → TOOLS_ARG="${MAIN_AGENT},${REVIEW_AGENT}"
  │
  ├─ openspec init . --tools $TOOLS_ARG
  │
  ├─ config.yaml に name フィールドを追加（inject_config_name $PROJECT_NAME）
  │
  ├─ specflow 固有セットアップ（openspec init 完了後に実行）
  │   ├─ .specflow/config.env 生成（SPECFLOW_MAIN_AGENT=$MAIN_AGENT, SPECFLOW_REVIEW_AGENT=$REVIEW_AGENT）
  │   ├─ .mcp.json コピー（テンプレートから、既存ならスキップ）
  │   ├─ CLAUDE.md コピー（テンプレートから、既存ならスキップ）
  │   └─ スラッシュコマンドインストール
  │
  └─ .gitignore 更新（冪等、.specflow/config.env のみ）
```

### エージェント定義（拡張可能な配列）

```bash
# Main agents
MAIN_AGENTS=("claude")
MAIN_AGENT_DEFAULT=0

# Review agents
REVIEW_AGENTS=("codex")
REVIEW_AGENT_DEFAULT=0
```

### ヘルパー関数

1. `select_agent(agents_array, default_index)` — 番号選択式 UI。配列とデフォルトインデックスを受け取り、選択されたエージェント名を返す。main/review それぞれで呼び出す。
2. `prompt_project_name(default)` — デフォルト値付きのプロジェクト名入力。Enter で確定。
3. `ensure_gitignore_entry(entry)` — .gitignore に指定エントリのみを冪等に追加。他のエントリは追加しない。
4. `check_not_subdirectory()` — `--dir` フロー専用。ターゲットディレクトリが既存 git リポジトリ内のサブディレクトリの場合にエラー
5. `inject_config_name(name)` — openspec/config.yaml に name フィールドを追加

## Risks

1. **openspec CLI のバージョン差異**: `openspec init` の出力形式が変わる可能性
   - 対策: `openspec init` の終了コードのみに依存し、出力パースは最小限にする
2. **config.yaml の書き換え**: openspec init が生成する config.yaml のフォーマットが不明
   - 対策: sed で `schema:` 行の後に `name:` を挿入する or 末尾に追加
3. **既存の specflow-init ユーザーへの影響**: 引数なしの動作が変わる（プロジェクト名プロンプト追加）
   - 対策: デフォルト値ありで Enter だけで確定可能にし、UX の変更を最小限に
4. **git リポジトリ外での引数なし実行**: git rev-parse --show-toplevel が失敗する
   - 対策: エラーメッセージで `specflow-init <project-name>` の使用を案内
