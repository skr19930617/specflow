# Tasks: improve-init-command

## Phase 1: 引数パース & Preflight & バリデーション

### Task 1.1: 引数パース（--update 早期 exit を含む）
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Description**: `--update` / `-h` / `--help` / `--dir <path>` / 位置引数 `<project-name>` を解析。`--update` の場合は既存のコマンド更新ロジックを実行して早期 exit（preflight/target-dir 以降の全ステップをバイパス）。
- **Acceptance Criteria**:
  - `specflow-init --update` → コマンド更新のみ実行して exit（preflight/openspec init は実行しない）
  - `specflow-init my-project` → `PROJECT_NAME=my-project`, `TARGET_DIR=""`
  - `specflow-init --dir /tmp/foo` → `PROJECT_NAME=""`, `TARGET_DIR=/tmp/foo`
  - `specflow-init --dir /tmp/foo my-project` → `PROJECT_NAME=my-project`, `TARGET_DIR=/tmp/foo`
  - `specflow-init` → `PROJECT_NAME=""`, `TARGET_DIR=""`
  - 不明なオプションはエラー

### Task 1.2: Preflight バリデーション
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.1
- **Description**: ファイル書き込み前に前提条件をチェック。
- **Checks**:
  1. `command -v openspec` — openspec CLI の存在
  2. `$CONFIG_DIR/template` — specflow-install 済み
- **Acceptance Criteria**:
  - チェック失敗 → エラーメッセージ + exit 1（ディレクトリ作成なし）

### Task 1.3: ターゲットパス解決（ディレクトリ作成なし）
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.2
- **Description**: パターン別にターゲットパスを**解決するだけ**。mkdir は行わない。
- **Acceptance Criteria**:
  - パターン 1: `TARGET_PATH="./<project-name>"`
  - パターン 2/3: `TARGET_PATH="<path>"`
  - パターン 4: `TARGET_PATH=$(git rev-parse --show-toplevel 2>/dev/null)`, 空なら `"Error: not inside a git repository."` + exit 1

### Task 1.4: ターゲットパスバリデーション
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.3
- **Description**: ファイルシステム変更前にバリデーション。
- **Checks**:
  1. `--dir` フローのみ: `check_not_subdirectory()` — サブディレクトリチェック
  2. TARGET_PATH が既存の場合: `openspec/config.yaml` 存在チェック（already initialized）
- **Acceptance Criteria**:
  - `--dir` でサブディレクトリ → エラー + exit 1（ディレクトリ作成なし）
  - already initialized → エラー + exit 1（ディレクトリ作成なし）

### Task 1.5: ターゲットディレクトリ作成 & 移動
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.4
- **Description**: バリデーション通過後にディレクトリ作成と cd を実行。
- **Acceptance Criteria**:
  - パターン 1: `mkdir <project-name> && cd <project-name>`
  - パターン 2/3: `mkdir -p <path> && cd <path>`（必要な場合のみ作成）
  - パターン 4: `cd $TARGET_PATH`

## Phase 2: git init & インタラクティブ設定（順次実行）

### Task 2.1: git init の自動実行
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.5
- **Description**: ターゲットディレクトリに git リポジトリがない場合、`git init` を自動実行。パターン 4 では既に git ルートのため実行されない。

### Task 2.2: プロジェクト名解決
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 1.5
- **Description**: `prompt_project_name(default)` ヘルパー関数。PROJECT_NAME が未設定の場合にディレクトリ名をデフォルトとして対話入力。**2.1 と直列に実行**（対話プロンプトの競合を防ぐ）。
- **Acceptance Criteria**:
  - パターン 1/3: プロンプトなし
  - パターン 2/4: プロンプト表示

### Task 2.3: エージェント選択 UI（2 回順次実行）
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 2.2（対話プロンプトは直列実行）
- **Description**: `select_agent(agents_array, default_index, role_name)` ヘルパー関数。main → review の順に呼び出す。
- **Acceptance Criteria**:
  - main → review の順でプロンプト表示
  - Enter → デフォルト値選択
  - TOOLS_ARG="${MAIN_AGENT},${REVIEW_AGENT}" が正しく構築される

## Phase 3: openspec init & 設定（Phase 2 完了後）

### Task 3.1: openspec init 呼び出し
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 2.1, 2.3
- **Description**: `openspec init . --tools $TOOLS_ARG` を実行
- **Acceptance Criteria**:
  - 非ゼロ終了の場合、エラーメッセージ + exit 1

### Task 3.2: config.yaml に name フィールドを追加
- **Priority**: P1
- **File**: `bin/specflow-init`
- **Depends on**: 3.1, 2.2
- **Description**: `inject_config_name(name)` ヘルパー関数

## Phase 4: specflow 固有セットアップ（Phase 3 完了後）

### Task 4.1: .specflow/config.env の生成
- **Priority**: P0
- **File**: `bin/specflow-init`
- **Depends on**: 3.2

### Task 4.2: .gitignore の冪等な更新
- **Priority**: P1
- **File**: `bin/specflow-init`
- **Depends on**: 4.1
- **Description**: `ensure_gitignore_entry(".specflow/config.env")`。`.specflow/config.env` のみ追加。他のエントリは一切追加しない。

### Task 4.3: .mcp.json / CLAUDE.md テンプレートコピー
- **Priority**: P1
- **Depends on**: 3.2

### Task 4.4: スラッシュコマンドインストール
- **Priority**: P1
- **Depends on**: 3.2

## Phase 5: ヘルプ・仕上げ

### Task 5.1: ヘルプメッセージ更新
- **Priority**: P1

### Task 5.2: 完了メッセージ更新
- **Priority**: P2

## Execution Order

```
1.1 (arg parse + --update early exit)
  → 1.2 (preflight)
    → 1.3 (path resolve, no mkdir)
      → 1.4 (validation)
        → 1.5 (mkdir + cd)
          → 2.1 (git init) → 2.2 (project name prompt) → 2.3 (agent selection)
            → 3.1 (openspec init) → 3.2 (name injection)
              → 4.1 (config.env) → 4.2 (.gitignore)
              → 4.3 (.mcp.json/CLAUDE.md)
              → 4.4 (slash commands)
                → 5.1 (help) + 5.2 (completion msg)
```

Note: 全ての対話プロンプト（2.2, 2.3）は直列実行。並行実行しない。
