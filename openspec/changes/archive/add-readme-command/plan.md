# Plan: add-readme-command

**Change ID**: add-readme-command
**Created**: 2026-04-07

## Overview

`/specflow.readme` slash コマンドと `bin/specflow-analyze` スクリプトを実装する。
bash スクリプトがプロジェクト情報を JSON で収集し、slash コマンドが Claude に README 生成を委任する。

## Architecture

```
User → /specflow.readme → Bash(specflow-analyze) → JSON → Claude → README.md
                                                              ↓
                                                     diff 表示 → 承認 → Write
```

### コンポーネント

1. **`bin/specflow-analyze`** (bash script, ~200行)
   - プロジェクトルートで実行
   - JSON を stdout に出力
   - 終了コード: 0=成功, 1=エラー

2. **`global/commands/specflow.readme.md`** (slash command, ~150行)
   - `specflow-analyze` を Bash ツールで実行
   - JSON を解析し Claude にプロンプトとして渡す
   - 既存 README の有無で分岐（新規生成 / 改善版生成+diff）
   - AskUserQuestion で承認後に Write

## Existing README Merge Strategy

既存 README がある場合の保持・マージ戦略:

### 基本方針: 既存全文を保持ベースとする
AI は既存 README を**ベース**として扱い、セクション単位で「改善」「追加」「保持」のいずれかを行う。既存テキストのデフォルト動作は「保持」であり、明示的にエビデンスがあるセクションのみ改善対象とする。

### セクション-エビデンス対応テーブル
以下のテーブルで、既存 README のセクション見出しと specflow-analyze のエビデンスフィールドを対応付ける。

| README セクション見出しパターン | エビデンスフィールド | 動作 |
|------------------------------|-------------------|------|
| バッジ行（`![` で始まる行群） | `languages`, `frameworks`, `license`, `ci` | 改善: エビデンスに基づきバッジ行を再生成 |
| `# <project>` (h1 タイトル) | `project_name`, `description` | 改善: タイトルと説明文を更新 |
| `## Features` / `## 機能` | `openspec.specs`, `keywords` | 改善: エビデンスがあれば更新 |
| `## Installation` / `## インストール` | `package_manager`, `scripts` | 改善: パッケージマネージャに基づき更新 |
| `## Usage` / `## 使い方` | `bin_entries`, `scripts` | 改善: bin/scripts に基づき更新 |
| `## Configuration` / `## 設定` | `config_files` | 改善: 設定ファイル情報で更新 |
| `## Architecture` / `## アーキテクチャ` | `openspec.specs` (2+), `file_structure` | 改善: 構造情報で更新 |
| `## Contributing` | `contributing` | 改善: CONTRIBUTING.md があれば参照、なければ汎用テンプレート |
| `## License` | `license` | 改善: ライセンス情報で更新 |
| 上記に該当しない見出し | — | **保持**: 原文を一字一句変更しない |

### 混在コンテンツの保護ルール
「改善」対象セクション内にユーザーが追加したコンテンツがある場合、以下のルールで保護する。

#### 保護対象の定義
改善対象 `##` セクション内のコンテンツを以下の 2 種類に分類する:

1. **生成対象ブロック**: エビデンス対応テーブルの該当フィールドから生成できる内容（例: `## Installation` 内のインストールコマンド）
2. **保護対象ブロック**: 以下のいずれかに該当するもの
   - `###` 以下のサブセクションで、エビデンス対応テーブルに該当しないもの（例: `### Troubleshooting`）
   - `###` に包まれていない自由記述テキスト（段落、箇条書き、注意書きなど）で、生成対象ブロックの内容と明らかに異なるもの

#### 判定方法
AI がセクション内容を解析し、以下の手順で分類する:
1. 既存セクションの各段落・箇条書き・サブセクションを個別に識別
2. エビデンスから生成可能な内容（インストールコマンド、使用例等）を「生成対象」とマーク
3. それ以外のテキスト（注意書き、補足説明、トラブルシューティング等）を「保護対象」とマーク
4. 判定が曖昧な場合は**保護対象**とする（保守的アプローチ）

#### マージ順序
改善セクションの出力構成:
1. AI が生成した新しい内容（生成対象ブロック）
2. 保護対象の自由記述テキスト（元の順序を維持）
3. 保護対象のサブセクション（元の順序を維持）

#### 例
`## Installation` に以下の既存内容がある場合:
```
## Installation
npm install my-package    ← 生成対象（パッケージマネージャコマンド）

> Note: requires Node 18+  ← 保護対象（自由記述注意書き）

### Troubleshooting         ← 保護対象（サブセクション）
If you get error X...
```
→ AI は `npm install` 部分を `pnpm add` に更新し、Note と Troubleshooting は原文保持して末尾に付加

### マージ手順
1. 既存 README 全文を読み取り
2. `##` 見出しでセクション分割
3. 各セクションをエビデンス対応テーブルで分類（改善 / 保持）
4. 改善セクション内のコンテンツを「生成対象ブロック」と「保護対象ブロック」に分類（自由記述テキスト・サブセクションの両方を対象）
5. 改善セクション: AI が生成対象ブロックを再生成し、保護対象ブロック（自由記述 + サブセクション）を元の順序で末尾に付加
6. 保持セクションは原文をそのまま挿入
7. エビデンスがあるが既存にないセクションは適切な位置に新規追加
8. 全体を結合して最終 README を生成

### プロンプトへの指示
slash コマンドのプロンプトに以下を含める:
- 既存 README の全文
- セクション分類結果（改善 / 保持 / 保護サブセクション）
- エビデンス対応テーブル
- 「保持セクション・保護対象ブロック（自由記述テキスト・サブセクション）は原文を一字一句変更するな」という明示的指示
- 「判定が曖昧な場合は保護対象とせよ」という保守的アプローチの指示

## Data Model

### specflow-analyze 出力 JSON スキーマ

```json
{
  "project_name": "string",
  "description": "string | null",
  "languages": ["string"],
  "frameworks": ["string"],
  "package_manager": "string | null",
  "build_tools": ["string"],
  "test_tools": ["string"],
  "ci": {
    "provider": "string | null",
    "workflows": [{ "name": "string", "extension": "string" }]
  },
  "license": "string | null",
  "git_remote": {
    "owner": "string | null",
    "repo": "string | null",
    "url": "string | null"
  },
  "openspec": {
    "has_config": "boolean",
    "project_name": "string | null",
    "context": "string | null",
    "specs": ["string"],
    "active_changes": ["string"]
  },
  "existing_readme": "string | null",
  "file_structure": "string",
  "bin_entries": ["string"],
  "scripts": { "key": "value" },
  "config_files": ["string"],
  "contributing": "string | null",
  "keywords": ["string"]
}
```

## Implementation Phases

### Phase 1: specflow-analyze (bin/specflow-analyze)

bash スクリプト。プロジェクト情報を JSON 収集して stdout 出力。

**検出順序:**
1. git remote URL → owner/repo
2. パッケージマニフェスト検出 (package.json, Cargo.toml, go.mod, pyproject.toml, etc.)
3. lockfile → パッケージマネージャ推定
4. tsconfig.json / 言語拡張子 → 言語一覧
5. dependencies → フレームワーク検出
6. scripts / bin → ビルド/テストツール, 実行可能ファイル
7. CI 設定検出 (.github/workflows/, .gitlab-ci.yml)
8. LICENSE ファイル解析
9. openspec/ 情報読み取り (config.yaml, specs/, changes/)
10. 既存 README.md 読み取り
11. ファイル構造 (tree -L 2, .git 除外)
12. 設定ファイル一覧 (.env.example, *.config.* 等)
13. CONTRIBUTING.md の有無と内容（存在すれば全文読み取り）
14. パッケージマニフェストの keywords / features フィールド

**jq 依存:**
- JSON 構築に jq を使用
- jq がない場合: printf + エスケープで簡易 JSON 生成（フォールバック）

### Phase 2: specflow.readme.md (global/commands/specflow.readme.md)

slash コマンド定義。

**フロー:**
1. `specflow-analyze` を実行し JSON を取得
2. JSON をパースして README 生成プロンプトを構築
3. エビデンステーブル（proposal.md の Grounding Policy）をプロンプトに含める
4. 既存 README がある場合:
   a. `##` 見出しでセクション分割
   b. セクション-エビデンス対応テーブルで「改善」/「保持」に分類
   c. 改善セクション内の `###` サブセクションを「改善」/「保護」に分類
   d. 分類結果（改善/保持/保護サブセクション）、エビデンス対応テーブル、既存全文をプロンプトに含める
   e. 「保持セクション・保護サブセクションは原文を一字一句変更するな」と指示
5. Claude が README を生成
6. 既存 README がある場合: 全文 diff を表示し AskUserQuestion で承認
7. 新規の場合: 生成結果を表示し AskUserQuestion で承認
8. 承認後に Write ツールで README.md に書き込み

### Phase 3: テスト・検証

- 複数プロジェクトタイプでの動作確認
  - Node.js/TypeScript プロジェクト
  - 言語検出なしプロジェクト（bash のみ）
  - OpenSpec ありプロジェクト
  - OpenSpec なしプロジェクト

## Risks & Mitigations

| リスク | 影響 | 対策 |
|-------|------|------|
| jq 未インストール | specflow-analyze が動作しない | printf フォールバック実装 |
| tree 未インストール | ファイル構造取得失敗 | `find . -maxdepth 2` フォールバック |
| 大きな README | diff が見づらい | 全文 diff を表示。Claude の出力で自然にページングされるため制限不要。ユーザーはスクロールで全体を確認可能 |
| 複数 workflow ファイル | どれを CI バッジにするか不明 | アルファベット順最初のファイルを使用 |

## Dependencies

- `jq` (推奨、フォールバックあり)
- `tree` (推奨、フォールバックあり)
- `git` (必須)
- OpenSpec CLI (オプション — specflow-analyze は直接ファイル読み取りで動作)
