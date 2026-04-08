# Proposal: READMEを改善するコマンドの追加

**Change ID**: add-readme-command
**Status**: Draft
**Created**: 2026-04-07
**Issue**: https://github.com/skr19930617/specflow/issues/56

## Purpose

プロジェクトの技術スタックを解析し、人気のあるOSS風のREADMEを自動生成・更新する slash コマンド `/specflow.readme` を追加する。バッジ、絵文字、セクション構成などを活用し、プロフェッショナルなREADMEを生成する。

## Background

- 現状、specflow で初期化したプロジェクトには `CLAUDE.md` はあるが、README の自動生成・改善機能がない
- OpenSpec CLI には `openspec validate`, `openspec show`, `openspec instructions` 等があるが、**プロジェクトの tech stack を解析する専用コマンドは存在しない**。そのため、プロジェクト解析は新規の bash スクリプト `specflow-analyze` で独自に実装する。ただし、`openspec/config.yaml` や `openspec/changes/` などの OpenSpec 成果物は解析対象に含める
- 人気のある OSS プロジェクトは、バッジ（CI/CD、カバレッジ、ライセンス等）、絵文字付きセクション見出し、インストール手順、使用例、コントリビューションガイドなど標準的な構成を持つ

## Decisions (Clarify Results)

1. **実装方式**: AI 委任方式。bash スクリプト（`specflow-analyze`）がプロジェクト情報を収集し、その結果を slash コマンドのプロンプト経由で Claude に渡して README を生成する。
2. **セクション構成**: 全部入り。バッジ, 概要, 機能, インストール, 使い方, 設定, アーキテクチャ, Contributing, License を含む。プロジェクト内容に応じて AI が不要なセクションを自動判断して省略。
3. **既存 README の扱い**: 確認付き上書き。既存 README を解析し改善版を生成。diff 表示後にユーザーが承認して適用。
4. **実行方法**: slash コマンド `/specflow.readme` として実装。bash スクリプト `bin/specflow-analyze` はプロジェクト解析のみ担当し、Claude が README の生成・書き込みを行う。
5. **解析範囲**: 幅広く収集。ファイル構造、パッケージマニフェスト（package.json, Cargo.toml, go.mod 等）、CI 設定、LICENSE、既存 README、git リモート URL、openspec 情報を全て収集し、AI が取捨選択する。

## Content Generation Rules (Grounding Policy)

Claude が README を生成する際、以下のルールに従う。

### Source-of-Truth ルール
- README の各セクション・バッジは、`specflow-analyze` が収集したエビデンスに**明示的に裏付けられる場合のみ**生成する
- エビデンスが不十分なセクションは省略する（推測で埋めない）
- 既存 README にユーザーが記述したセクションがある場合、そのセクションは原文を保持する（AI が勝手に書き換えない）
- **例外: テンプレートセクション** — 下表で「汎用テンプレートを挿入」と記載されたセクションは、エビデンスなしでも定型文を挿入してよい。これは推測ではなくプロジェクト非依存の定型コンテンツである

### セクション別エビデンス要件

| セクション | 必須エビデンス | エビデンスなし時の動作 |
|-----------|--------------|---------------------|
| バッジ（tech stack） | `specflow-analyze` の `languages` / `frameworks` フィールド | 省略 |
| バッジ（license） | LICENSE ファイルの存在 | 省略 |
| バッジ（CI） | `.github/workflows/` 等の CI 設定ファイル | 省略 |
| 概要 | パッケージマニフェストの description、または既存 README | プロジェクト名のみ表示し、ユーザーに記述を促す placeholder を挿入 |
| インストール | パッケージマニフェスト（package.json の scripts、Cargo.toml 等） | 省略 |
| 使い方 | パッケージマニフェストの bin/scripts、または既存 README | 省略 |
| 設定 | 設定ファイルの存在（.env.example, config.yaml 等） | 省略 |
| 機能 (Features) | `openspec/specs/` の capability spec、またはパッケージマニフェストの keywords/features フィールド | 省略 |
| アーキテクチャ | `openspec/specs/` が 2 つ以上存在する、または `src/` 配下に明確なモジュール分割がある場合 | 省略 |
| Contributing | CONTRIBUTING.md の存在 | 汎用テンプレートを挿入（テンプレートセクション例外） |
| License | LICENSE ファイル | 省略 |

### バッジ生成ルール

バッジは以下の 2 種類に分類し、それぞれ異なるルールを適用する。

**Static バッジ（tech stack, license 等）:**
- shields.io の static badge URL を使用（例: `https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white`）
- `specflow-analyze` の出力フィールドに基づいて生成。エビデンスがない言語・フレームワークのバッジは生成しない

**Dynamic バッジ（CI status）:**
- CI 設定ファイルが存在する場合のみ生成
- **GitHub Actions**: `.github/workflows/` 内の最初の workflow ファイル名を使用して `github/actions/workflow/status/{owner}/{repo}/{workflow}.yml` バッジを生成
- **GitLab CI**: `.gitlab-ci.yml` が存在する場合、`https://img.shields.io/gitlab/pipeline-status/{project-path}` バッジを生成
- **その他の CI**: CI 設定ファイルは存在するが上記に該当しない場合、CI バッジは省略（shields.io が直接サポートする CI のみ対象）
- リポジトリの owner/repo 情報は git remote URL から取得。取得できない場合は CI バッジを省略

## OpenSpec Integration Contract

### 統合方針
OpenSpec CLI には tech stack 解析の専用コマンドが存在しないため、`specflow-analyze` が独自にプロジェクト解析を行う。ただし、OpenSpec の成果物は解析対象として積極的に活用する。

### OpenSpec から読み取る情報
| データソース | 取得情報 | 用途 |
|------------|---------|------|
| `openspec/config.yaml` | プロジェクト名、context（tech stack, conventions） | README の概要・tech stack セクション |
| `openspec/specs/` | capability spec 一覧 | 機能セクションの生成 |
| `openspec/changes/` | active change 一覧 | 開発状況の把握（オプション） |

### OpenSpec が存在しない場合のフォールバック
- `openspec/config.yaml` が存在しない場合: OpenSpec 関連情報をスキップし、パッケージマニフェスト等の他のエビデンスのみで README を生成する
- `specflow-analyze` は OpenSpec の有無に関わらず動作する（OpenSpec は optional dependency）

## Architecture

### コンポーネント構成

```
/specflow.readme (slash コマンド)
  │
  ├── 1. bash: specflow-analyze を実行してプロジェクト情報を JSON で収集
  │     ├── ファイル構造 (tree)
  │     ├── パッケージマニフェスト (package.json, Cargo.toml, go.mod, etc.)
  │     ├── CI 設定 (.github/workflows/, .gitlab-ci.yml, etc.)
  │     ├── LICENSE ファイル
  │     ├── 既存 README.md
  │     ├── git リモート URL
  │     └── openspec/ 情報
  │
  ├── 2. Claude: 収集した情報を元に OSS 風 README を生成
  │     ├── shields.io バッジ (tech stack, license, CI status)
  │     ├── 絵文字付きセクション見出し
  │     └── プロジェクト固有の内容
  │
  └── 3. 適用: diff 表示 → ユーザー承認 → README.md に書き込み
```

### ファイル構成

| ファイル | 役割 |
|---------|------|
| `bin/specflow-analyze` | プロジェクト解析スクリプト（JSON 出力） |
| `global/commands/specflow.readme.md` | slash コマンド定義 |
| `bin/specflow-install` | インストールスクリプト（specflow-analyze の PATH 登録追加） |

## Scope

### 変更対象
- `bin/specflow-analyze` — 新規: プロジェクト解析スクリプト
- `global/commands/specflow.readme.md` — 新規: slash コマンド定義
- `bin/specflow-install` — 変更: `specflow-analyze` のインストール対応

### 変更内容
1. **プロジェクト解析スクリプト** (`specflow-analyze`): tech stack（言語、フレームワーク、ビルドツール）、ファイル構造、CI 設定、LICENSE、既存 README、git リモート URL、openspec 情報を JSON で出力
2. **slash コマンド** (`/specflow.readme`): `specflow-analyze` を実行し、結果を元に Claude が OSS 風 README を生成。既存 README がある場合は diff を表示してユーザー承認後に適用
3. **バッジ生成**: tech stack に応じた shields.io バッジを AI が自動選択・挿入
4. **インストール対応**: `specflow-install` に `specflow-analyze` を追加

## Out of Scope

- OpenSpec CLI 自体の変更
- CLAUDE.md の自動生成・更新（既存の init で対応済み）
- GitHub Pages や Wiki の自動生成
- 多言語 README（i18n）対応
- Claude API の直接呼び出し（slash コマンド経由で Claude を利用するため不要）

## Completion Criteria

- `/specflow.readme` を実行すると、`specflow-analyze` がプロジェクト情報を収集し、Claude が README.md を生成する
- 既存の README.md がある場合、改善版を生成し diff 表示後にユーザー承認で適用
- 新規プロジェクトでは README.md を新規作成
- tech stack に応じた shields.io バッジが自動挿入される
- 絵文字付きセクション見出しが使用される
- `specflow-install` 実行後に `specflow-analyze` が PATH で利用可能になる
- `specflow-analyze` 単体でも JSON 出力として利用可能
- **エビデンスベース生成**: 各セクション・バッジは `specflow-analyze` の収集結果に裏付けられた情報のみで生成される（推測で埋めない）
- **エビデンス不足時**: 該当セクションが省略されるか、placeholder が挿入される
- **OpenSpec 非依存**: `openspec/config.yaml` が存在しないプロジェクトでも動作する
