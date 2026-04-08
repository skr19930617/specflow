---
description: 既存コードベースを解析し、openspec/specs/ にベースライン spec を一括生成
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.
   - If missing:
     ```
     ❌ `openspec/` ディレクトリが見つかりません。

     次のステップで初期化してください:
     1. `openspec/config.yaml` を作成
     2. `/specflow.spec` を再度実行
     ```
     → **STOP**.

## Step 1: コードベース解析

プロジェクトのコードベースを解析し、capability 候補を検出する。

### 1a. ディレクトリ構造スキャン

Glob ツールで以下のパターンをスキャンする:
- `src/**/*`, `lib/**/*`, `app/**/*`, `pkg/**/*`, `cmd/**/*`
- `**/*.ts`, `**/*.js`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.java`, `**/*.kt`, `**/*.swift`, `**/*.rb`, `**/*.php`

結果からプロジェクトのディレクトリ構造を把握する。

### 1b. 設定ファイルの読み取り

Read ツールで以下の設定ファイルを読み取る（存在するもののみ）:
- `package.json`, `tsconfig.json`
- `go.mod`, `go.sum`
- `Cargo.toml`
- `pyproject.toml`, `setup.py`, `requirements.txt`
- `build.gradle`, `pom.xml`
- `Gemfile`, `composer.json`
- `CLAUDE.md`, `README.md`

### 1c. 主要ソースファイルの内部読み取り

設定ファイルとディレクトリ構造から、以下の種類のファイルを特定し Read ツールで内容を確認する:
- エントリポイント（main.ts, index.ts, main.go, app.py 等）
- ルーター/コントローラー（routes/, controllers/, handlers/ 配下）
- モデル/スキーマ定義（models/, schemas/, types/ 配下）
- 設定/ミドルウェア（config/, middleware/ 配下）

### 1d. capability 候補の抽出

解析結果から capability 候補をグルーピングする。各 capability には:
- **名前**: ケバブケースの識別子（例: `user-auth`, `data-export`, `api-gateway`）
- **概要**: 1-2 文の説明
- **関連ファイル**: この capability に関連する主要ファイルパス

capability の粒度は「独立してテスト・変更可能な機能単位」を目安とする。

Report: `Step 1 complete — <N> capability 候補を検出`

### 1e. capability 候補が 0 件の場合

capability 候補が検出されなかった場合（プロジェクト構造が最小限、または認識可能なパターンがない場合）:

```
AskUserQuestion:
  question: "⚠️ capability 候補を自動検出できませんでした。手動で capability を定義してください。\n\ncapability 名をカンマ区切りで入力してください（例: user-auth, data-export）"
  options: (なし — 自由入力)
```

ユーザーの入力をカンマで分割し、各値をトリムして capability リストを構築する。空の入力の場合は再度プロンプトを表示する。

構築した capability リストで Step 3 に進む（Step 2 の選択ステップはスキップ）。

## Step 2: capability 選択

検出した capability 一覧をユーザーに提示し、生成対象を選択させる。

`AskUserQuestion` の multiSelect モードを使用する:

```
AskUserQuestion:
  question: "以下の capability が検出されました。spec を生成する対象を選択してください。"
  multiSelect: true
  options:
    - label: "<capability-1-name>"
      description: "<capability-1-summary>"
    - label: "<capability-2-name>"
      description: "<capability-2-summary>"
    ...
```

**注意**: AskUserQuestion の options は最大 4 つ。候補が 5 つ以上ある場合は、優先度の高い上位 3 つを options に含め、4 つ目を「その他（追加入力）」とする。追加入力で残りの capability を指定可能にする。

ユーザーが「その他」を選んだ場合、自由入力で capability 名を追加できる。

Report: `Step 2 complete — <N> capability を選択`

## Step 3: capability ごとのインタラクティブ質問

選択された各 capability について、以下の質問を AskUserQuestion で1つずつ提示する。

### 質問 1: スコープ確認

```
AskUserQuestion:
  question: "<capability-name> のスコープ: この capability がカバーする範囲を確認します。以下の推定は正しいですか？\n\n推定スコープ: <コード解析から推定したスコープの説明>\n関連ファイル: <detected files>"
  options:
    - label: "正しい"
      description: "推定スコープで spec を生成する"
    - label: "修正する"
      description: "スコープを修正してから spec を生成する"
```

「修正する」を選んだ場合、自由入力でスコープの修正を受け付ける。

### 質問 2: 主要要件

```
AskUserQuestion:
  question: "<capability-name> の主要要件: コード解析から以下の要件を推定しました。追加・修正はありますか？\n\n<推定要件リスト>"
  options:
    - label: "このまま進む"
      description: "推定要件で spec を生成する"
    - label: "追加・修正する"
      description: "要件を追加・修正する"
```

### 質問 3: 制約・前提条件

```
AskUserQuestion:
  question: "<capability-name> の制約: 依存関係、パフォーマンス要件、セキュリティ要件などの制約はありますか？"
  options:
    - label: "特になし"
      description: "制約なしで spec を生成する"
    - label: "制約を追加"
      description: "制約を記述する"
```

Report: `Step 3 complete — <capability-name> の質問完了`

## Step 4: spec ファイル生成

選択された各 capability について spec ファイルを生成する。

### 4a. capability 名の正規化

入力された capability 名を正規化する:
1. 小文字化
2. スペース・アンダースコアをハイフンに置換
3. 連続ハイフンを単一ハイフンに
4. 先頭末尾のハイフンを除去

重複する正規化後の名前がある場合、警告を表示して統合する。

### 4b. ディレクトリ作成

```bash
mkdir -p openspec/specs/<normalized-name>
```

### 4c. spec ファイル生成（CLI 優先 + フォールバック）

**CLI プローブ**: まず OpenSpec CLI のテンプレートを取得を試みる:

```bash
openspec templates --json
```

JSON 出力の `specs` キーにテンプレートパスが存在する場合:
1. そのテンプレートファイルを Read ツールで読み取る
2. テンプレートの構造に従って spec を生成する（ただしベースライン spec はデルタ形式ではないため、`## ADDED Requirements` ヘッダは `## Requirements` に読み替える）

CLI テンプレートが取得できない場合（コマンド失敗、`specs` キーなし等）、以下の **canonical fallback template** を使用する:

```markdown
# <capability-name> Specification

## Purpose
<capability の目的を1-2文で記述>

## Requirements
### Requirement: <requirement name>
<requirement description using SHALL/MUST>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <expected outcome>
```

Step 3 の質問回答とコード解析の結果を統合して、各セクションを具体的に記述する。

### 4d. spec 検証

生成した各 spec ファイルに対して構造検証を実行する:

```bash
openspec validate "<normalized-name>" --type spec --json
```

validation エラーがある場合:
- エラー内容をユーザーに表示
- `AskUserQuestion` で「修正する」/「スキップ」を選択させる
- 「修正する」を選んだ場合、エラーを修正して再度 validate

Report: `Step 4 complete — openspec/specs/<name>/spec.md を生成`

## Step 5: 完了報告とハンドオフ

生成結果のサマリーを表示する:

```
## Spec Bootstrap 完了

| # | Capability | Path | Status |
|---|-----------|------|--------|
| 1 | <name> | openspec/specs/<name>/spec.md | ✅ |
| 2 | <name> | openspec/specs/<name>/spec.md | ✅ |

生成された spec: <N> 件
```

`AskUserQuestion` で次のアクションを提示:

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "specflow に進む"
      description: "/specflow で change の proposal 作成に進む"
    - label: "spec を修正"
      description: "生成された spec を手動で編集する"
    - label: "終了"
      description: "spec bootstrap を終了する"
```

- 「specflow に進む」 → 完了メッセージを表示して終了。ユーザーが `/specflow` を実行できる状態にする。
- 「spec を修正」 → 修正対象の spec を選択させ、編集後に再度ハンドオフを表示。
- 「終了」 → 完了メッセージを表示して終了。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Baseline spec は `openspec/specs/<name>/spec.md` に配置する（`openspec/changes/` ではない）。
- `openspec new spec` コマンドは現在サポートされていないため、`mkdir -p` で直接ディレクトリを作成する。
- spec のフォーマットは既存の `openspec/specs/*/spec.md` と互換性を保つこと。
- If any tool call fails, report the error and ask the user how to proceed.
