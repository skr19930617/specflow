# Proposal: initコマンドの改善

**Change ID**: improve-init-command
**Status**: Draft
**Created**: 2026-04-07
**Issue**: https://github.com/skr19930617/specflow/issues/36

## Purpose

`specflow-init` コマンドを OpenSpec 準拠で改善し、プロジェクト名の指定・ディレクトリ引数によるカレントディレクトリ初期化・エージェント選択のインタラクティブ化を実現する。

## Background

現行の `specflow-init` は:
- プロジェクト名を受け取らない（git ルートを自動検出するのみ）
- ディレクトリを引数で指定できない
- エージェント（main / review）の選択がハードコードされている
- `.gitignore` の自動設定が行われない
- テンプレートから openspec/ をコピーしているが、`openspec init` CLI を呼んでいない

## Decisions (Clarify Results)

1. **プロジェクト名**: 引数なしの場合、ディレクトリ名から自動推定し確認プロンプトを表示。Enter で確定、または別名を入力。
2. **`.gitignore`**: `.specflow/config.env` のみを追加。openspec/ の成果物はすべてコミット対象。
3. **エージェント選択 UI**: 番号選択式（例: `1) claude  2) codex`）。デフォルト値あり、Enter だけで確定可能。
4. **OpenSpec init**: テンプレートコピーではなく、外部 `openspec init` CLI を呼び出して初期化する。
5. **`--dir` で git リポジトリなし**: `git init` を自動実行してから初期化を進行。
6. **サブディレクトリ init 禁止**: 初期化対象は必ず git リポジトリルートでなければならない。既存リポジトリ内のサブディレクトリを `--dir` で指定した場合はエラー。

## CLI Behavior Matrix

以下の 4 パターンで動作を定義する。

### パターン 1: `specflow-init <project-name>`
- カレントディレクトリに `<project-name>/` ディレクトリを**新規作成**
- 作成したディレクトリ内で `git init` を実行
- 作成したディレクトリ内で `openspec init` を実行（エージェント選択結果を `--tools` で渡す）
- specflow 固有の設定（`.specflow/config.env`, `.mcp.json`, `CLAUDE.md`, スラッシュコマンド）をセットアップ

### パターン 2: `specflow-init --dir <path>`
- `<path>` で指定されたディレクトリに移動して初期化（ディレクトリが存在しなければ作成）
- git リポジトリがなければ `git init` を自動実行
- **制約**: `<path>` が既存 git リポジトリ内のサブディレクトリの場合はエラー終了（`"Error: <path> is inside an existing git repository. Initialize at the repository root instead."`）
- プロジェクト名はディレクトリ名から推定し、確認プロンプトで確定

### パターン 3: `specflow-init --dir <path> <project-name>`
- パターン 2 と同じディレクトリ処理（サブディレクトリ制約を含む）
- `<project-name>` をプロジェクト名として使用（プロンプトなし）

### パターン 4: `specflow-init` (引数なし)
- カレントディレクトリ（git ルート）で初期化（現行動作を維持）
- プロジェクト名はディレクトリ名をデフォルト値として対話プロンプトで確認

### 共通動作
- 既に `openspec/config.yaml` が存在する場合は「already initialized」でエラー終了（現行動作を維持）
- `--update` モードは引き続き独立して動作（プロジェクト名・エージェント選択には影響しない）
- `.gitignore` の更新先は常に初期化対象ディレクトリ（= git ルート）の `.gitignore`

## OpenSpec Init Integration

### 実行フロー
specflow-init は `openspec init` CLI を外部コマンドとして呼び出して openspec/ ディレクトリを初期化する。

1. エージェント選択で選ばれた main/review エージェントを `openspec init` の `--tools` オプションにマッピング
2. `openspec init [path] --tools <main>,<review>` を実行
3. `openspec init` が `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/` を作成
4. specflow 固有のセットアップ（`.specflow/config.env`, `.mcp.json`, `CLAUDE.md`, スラッシュコマンド）は specflow-init が直接行う

### エージェント → openspec --tools マッピング
| specflow エージェント | openspec --tools 値 |
|----------------------|---------------------|
| claude (main)        | `claude`            |
| codex (review)       | `codex`             |

実行例:
```bash
openspec init . --tools claude,codex
```

### openspec init 失敗時
- `openspec` コマンドが見つからない場合: `"Error: openspec CLI is not installed. Run 'npm install -g openspec' first."` でエラー終了
- `openspec init` が非ゼロ終了した場合: エラーメッセージを表示してエラー終了

## Agent Configuration

### 有効値（このリリース）
| ロール | 有効値 | デフォルト |
|--------|--------|-----------|
| main   | `claude` | `claude` |
| review | `codex`  | `codex`  |

### 永続化先
- **`.specflow/config.env`** で specflow 固有のエージェント設定を管理
- `openspec init --tools` で openspec 側にもエージェント情報を渡す（openspec 側の永続化は openspec CLI が行う）
- specflow のワークフローコマンド（plan, impl, review 等）は `.specflow/config.env` を `source` して `SPECFLOW_MAIN_AGENT` / `SPECFLOW_REVIEW_AGENT` 環境変数を読み取る

### config.env の出力形式
```bash
# specflow agent configuration
# Edit these values to change your agents
SPECFLOW_MAIN_AGENT=claude
SPECFLOW_REVIEW_AGENT=codex
```

### エージェント選択フロー
1. 番号選択式で main エージェントを選択（デフォルト: 1=claude）
2. 番号選択式で review エージェントを選択（デフォルト: 1=codex）
3. 選択結果を `.specflow/config.env` に書き出し
4. 選択結果を `openspec init --tools` に渡す

### 将来の拡張
- エージェント定義は bash の配列で管理（例: `MAIN_AGENTS=("claude" "aider")`）
- 新しいエージェントの追加は配列にエントリを追加するだけで対応可能
- openspec の `--tools` オプションが対応する値のリストは `openspec init --help` から取得可能

## .gitignore 更新ルール

1. `.gitignore` の更新先は常に初期化対象ディレクトリ（= git ルート）の `.gitignore`
2. `.gitignore` が存在しない場合: 新規作成し `.specflow/config.env` エントリを追加
3. `.gitignore` が存在する場合:
   - `.specflow/config.env` がすでに含まれていれば何もしない（冪等性）
   - 含まれていなければ末尾に追加
4. `.specflow/config.env` 以外のエントリは追加しない

## Scope

### 変更対象
- `bin/specflow-init` — 引数パース・インタラクティブ設定・openspec init CLI 呼び出し
- `.specflow/config.env` — エージェント設定の永続化先
- `.gitignore` — `.specflow/config.env` エントリの冪等な追加

### 変更内容
1. **プロジェクト名の指定**: `specflow-init <project-name>` で新規ディレクトリを作成して初期化。引数なしならディレクトリ名をデフォルト値として対話プロンプト表示。
2. **ディレクトリ引数**: `specflow-init --dir <path>` で指定ディレクトリに初期化。ディレクトリが存在しなければ作成。git リポジトリがなければ `git init` を自動実行。サブディレクトリ init は禁止。
3. **エージェント選択**: 番号選択式の対話 UI で main エージェント（デフォルト: claude）と review エージェント（デフォルト: codex）を選択。
4. **OpenSpec init 呼び出し**: テンプレートコピーではなく `openspec init --tools <agents>` を呼び出し。
5. **設定の永続化**: `.specflow/config.env` に `SPECFLOW_MAIN_AGENT` / `SPECFLOW_REVIEW_AGENT` を書き出し。
6. **`.gitignore` 設定**: `.specflow/config.env` のみを冪等に `.gitignore` に追加。
7. **将来の拡張性**: エージェント定義を bash 配列で管理し、新しいエージェントの追加を容易にする。

## Out of Scope

- 新しいエージェント（claude / codex 以外）の追加実装
- OpenSpec 自体のスキーマ定義の変更
- specflow のワークフローコマンド（plan, impl 等）の変更
- CI/CD 関連の変更

## Completion Criteria

- `specflow-init my-project` で `./my-project/` ディレクトリが作成され、内部で `openspec init --tools claude,codex` が実行される
- `specflow-init` 引数なしでディレクトリ名をデフォルト値として対話プロンプトが表示される
- `specflow-init --dir <path>` で指定ディレクトリに初期化が動作する（ディレクトリなしなら作成、git なしなら自動 git init）
- `specflow-init --dir <path>` でサブディレクトリ（既存リポジトリ内）を指定した場合はエラー終了
- `specflow-init --dir <path> my-project` で指定ディレクトリにプロジェクト名付きで初期化される
- 番号選択式プロンプトで main / review エージェントを選択できる
- 選択結果が `.specflow/config.env` に `SPECFLOW_MAIN_AGENT` / `SPECFLOW_REVIEW_AGENT` として永続化される
- 選択結果が `openspec init --tools` に渡される
- `.specflow/config.env` を手動編集してエージェントを後から変更できる
- `.gitignore` に `.specflow/config.env` が冪等に追加される（既に存在すれば追加しない）
- `openspec` CLI がインストールされていない場合は適切なエラーメッセージが表示される
- `--update` モードが引き続き正常に動作する
