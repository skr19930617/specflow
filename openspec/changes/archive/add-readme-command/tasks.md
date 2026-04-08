# Tasks: add-readme-command

**Change ID**: add-readme-command
**Created**: 2026-04-07

## Phase 1: specflow-analyze スクリプト

### Task 1.1: スクリプト骨格と git remote 解析 ✅
**Priority**: P0 (blocker)
**Depends on**: none
**Parallel**: no

- `bin/specflow-analyze` を作成（`#!/usr/bin/env bash`, `set -euo pipefail`）
- jq 存在チェック（なければ警告を stderr に出力し簡易 JSON モードで動作）
- git remote URL から owner/repo を抽出
- 空の JSON オブジェクトを構築開始

**Acceptance**: `specflow-analyze` 実行で `{"project_name": "...", "git_remote": {...}}` が stdout に出力される

### Task 1.2: パッケージマニフェスト・lockfile 検出 ✅
**Priority**: P0
**Depends on**: 1.1
**Parallel**: no

- package.json, Cargo.toml, go.mod, pyproject.toml, Gemfile, build.gradle, pom.xml, composer.json の存在チェック
- 検出したマニフェストから description, scripts, bin, dependencies, keywords/features を抽出
- lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock 等) からパッケージマネージャを推定
- `languages`, `frameworks`, `package_manager`, `scripts`, `bin_entries`, `keywords` フィールドを JSON に追加

**Acceptance**: Node.js プロジェクトで `languages: ["JavaScript"]`, `package_manager: "npm"` 等が出力される

### Task 1.3: CI 設定・LICENSE・設定ファイル検出 ✅
**Priority**: P0
**Depends on**: 1.1
**Parallel**: Task 1.2 と並行可能

- `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/config.yml` 等をスキャン
- workflow ファイルをアルファベット順でソートし、ファイル名と拡張子を記録
- LICENSE ファイルを読み取り、ライセンスタイプを判定 (MIT, Apache-2.0, etc.)
- 設定ファイル一覧 (.env.example, *.config.*, etc.) を収集
- CONTRIBUTING.md の有無チェック（存在すれば全文読み取り）
- `ci`, `license`, `config_files`, `contributing` フィールドを JSON に追加

**Acceptance**: GitHub Actions プロジェクトで `ci.provider: "github-actions"`, `ci.workflows: [{"name": "ci", "extension": ".yml"}]` が出力される

### Task 1.4: OpenSpec 情報・既存 README・ファイル構造 ✅
**Priority**: P0
**Depends on**: 1.1
**Parallel**: Task 1.2, 1.3 と並行可能

- `openspec/config.yaml` が存在すれば読み取り（project_name, context）
- `openspec/specs/` の capability spec 一覧
- `openspec/changes/` の active change 一覧
- 既存 `README.md` を読み取り（存在しなければ null）
- `tree -L 2 --gitignore -I .git` でファイル構造取得（tree なければ `find . -maxdepth 2` フォールバック）
- `openspec`, `existing_readme`, `file_structure` フィールドを JSON に追加

**Acceptance**: OpenSpec ありプロジェクトで `openspec.has_config: true`, `openspec.specs: [...]` が出力される。OpenSpec なしプロジェクトで `openspec.has_config: false`

### Task 1.5: JSON 出力の統合とバリデーション ✅
**Priority**: P0
**Depends on**: 1.2, 1.3, 1.4
**Parallel**: no

- 各検出結果を統合した完全な JSON オブジェクトを stdout に出力
- jq ありの場合: jq で JSON 構築
- jq なしの場合: printf による簡易 JSON 生成
- エラー時は stderr にメッセージを出力し exit 1
- `chmod +x bin/specflow-analyze`

**Acceptance**: `specflow-analyze | jq .` がバリデーション OK。全フィールドが存在する

## Phase 2: slash コマンド

### Task 2.1: specflow.readme.md 骨格 ✅
**Priority**: P0
**Depends on**: Phase 1 完了
**Parallel**: no

- `global/commands/specflow.readme.md` を作成
- frontmatter: `description: プロジェクト解析に基づいて OSS 風 README を生成・更新`
- Prerequisites: `specflow-analyze` の存在チェック
- Step 1: `specflow-analyze` を Bash ツールで実行し JSON を取得

**Acceptance**: `/specflow.readme` 実行で `specflow-analyze` が呼ばれ JSON が取得できる

### Task 2.2: README 生成プロンプト構築 ✅
**Priority**: P0
**Depends on**: 2.1
**Parallel**: no

- JSON 解析結果からプロンプトを構築
- Grounding Policy（エビデンステーブル）をプロンプトに埋め込み
- バッジ生成ルール（Static/Dynamic 分類）をプロンプトに含める
- 絵文字付きセクション見出しの指示
- 既存 README がある場合:
  - `##` 見出しでセクション分割
  - セクション-エビデンス対応テーブルで各セクションを「改善」/「保持」に分類
  - 改善セクション内のコンテンツを「生成対象ブロック」/「保護対象ブロック」に分類（サブセクションだけでなく自由記述テキストも対象）
  - 分類結果（改善/保持/保護対象ブロック）と既存全文をプロンプトに含める
  - エビデンス対応テーブルをプロンプトに埋め込み
  - 「保持セクション・保護対象ブロック（自由記述テキスト・サブセクション）は原文を一字一句変更するな」と明示指示
  - 「判定が曖昧な場合は保護対象とせよ」と保守的アプローチを指示

**Acceptance**: プロンプトに JSON 解析結果、Grounding Policy、バッジルール、セクション-エビデンス対応テーブル、混在コンテンツ保護ルールが含まれる。既存 README がある場合は3段階分類（改善/保持/保護）が含まれる

### Task 2.3: 承認フローと書き込み ✅
**Priority**: P0
**Depends on**: 2.2
**Parallel**: no

- 生成された README を表示
- 既存 README がある場合: 全文 diff を表示（行数制限なし）
- AskUserQuestion で承認（「適用」/「再生成」/「キャンセル」）
- 承認後に Write ツールで README.md に書き込み
- 「再生成」選択時: フィードバックをプロンプトに追加して再生成

**Acceptance**: 承認フローが動作し、README.md が書き込まれる

## Phase 3: 検証

### Task 3.1: 自プロジェクトでの動作確認
**Priority**: P1
**Depends on**: Phase 2 完了
**Parallel**: no

- spec-scripts リポジトリ自体で `/specflow.readme` を実行
- 生成された README の品質確認:
  - バッジが tech stack に基づいている
  - エビデンスなしセクションが省略されている
  - 絵文字付きセクション見出し
  - shields.io バッジ URL が有効

**Acceptance**: spec-scripts プロジェクトで適切な README が生成される
