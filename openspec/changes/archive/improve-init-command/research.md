# Research: improve-init-command

## openspec CLI

- `openspec init [path] --tools <tools>` で初期化
- `--tools`: カンマ区切りで AI ツールを指定（claude, codex, cursor 等）
- `[path]` は初期化先ディレクトリ（省略時はカレント）
- プロジェクト名を渡すオプションは**ない** → init 後に config.yaml の name フィールドを上書きする必要あり
- `--force`: レガシーファイルの自動クリーンアップ
- `--profile`: config プロファイルの指定

## 現行 specflow-init の構造

1. `--update` フラグ解析（コマンド更新のみモード）
2. `$CONFIG_DIR/template` の存在チェック（specflow-install 済みか）
3. git ルート検出 → `cd $ROOT`
4. `openspec/config.yaml` 存在チェック（already initialized）
5. テンプレート取得（`$SPECFLOW_TEMPLATE_REPO` or ローカル `$CONFIG_DIR/template`）
6. ファイルコピー: `.mcp.json`, `CLAUDE.md`, `openspec/` ディレクトリ
7. スラッシュコマンドのインストール

## 主要な変更点

- openspec/ の初期化をテンプレートコピーから `openspec init` CLI 呼び出しに変更
- 引数パース: `<project-name>`, `--dir <path>`, `--update` の 3 系統
- インタラクティブ設定: プロジェクト名確認、エージェント選択
- .specflow/config.env の生成
- .gitignore の冪等な更新
- サブディレクトリ init の検出と拒否

## テンプレートの扱い

- `openspec init` CLI が openspec/ を作成するため、テンプレートから openspec/ コピーは不要になる
- `.mcp.json`, `CLAUDE.md`, スラッシュコマンドのインストールは引き続き specflow-init が担当
- `.specflow/config.env` は specflow-init が新規作成

## config.yaml name フィールド

- `openspec init` はプロジェクト名オプションを持たない
- `openspec init` 後に `openspec/config.yaml` を読み込み、`name:` 行を追加/上書きする
- sed or awk で先頭に `name: <project-name>` を挿入する方式
