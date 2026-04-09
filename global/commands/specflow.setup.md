---
description: CLAUDE.md をインタラクティブに設定（Tech Stack, Commands, Code Style）
---
## Overview

プロジェクトの CLAUDE.md をインタラクティブに設定する。
ユーザーに質問しながら Tech Stack、Commands、Code Style セクションを埋める。

## Prerequisites

1. Run `ls CLAUDE.md` via Bash to confirm CLAUDE.md exists.
   - If missing: "`CLAUDE.md` が見つかりません。先に `specflow-init` を実行してください。" → **STOP**.

2. Read the current `CLAUDE.md` file to understand existing content.

## Step 1: Analyze Project [1/4]

Automatically detect what you can from the project:

1. Check for common config files to infer the tech stack:
   - `package.json` → Node.js / npm project (read to get dependencies, scripts)
   - `tsconfig.json` → TypeScript
   - `pyproject.toml` or `requirements.txt` → Python
   - `Cargo.toml` → Rust
   - `go.mod` → Go
   - `Gemfile` → Ruby
   - `*.csproj` or `*.sln` → C# / .NET
   - `build.gradle` or `pom.xml` → Java / Kotlin

2. Check for build/test/lint tooling:
   - Read `package.json` scripts if present
   - Check for `Makefile`, `justfile`, `taskfile.yml`
   - Check for `.eslintrc*`, `prettier.config.*`, `biome.json`
   - Check for CI config (`.github/workflows/`, `.gitlab-ci.yml`)

3. Check for existing code style patterns:
   - Linter configs
   - `.editorconfig`
   - Existing code conventions (sample a few source files)

Report what you found:

```
[1/4] プロジェクト解析完了

検出:
  言語: TypeScript 5.x
  フレームワーク: React 19, Next.js 15
  ランタイム: Node.js 22
  パッケージマネージャ: pnpm
  テスト: vitest
  リンター: ESLint, Prettier
  ...
```

## Step 2: Tech Stack の確認 [2/4]

検出した内容をもとに、ユーザーに確認する:

**質問:**
「Tech Stack を以下で設定します。追加・修正があれば教えてください。」

検出した tech stack を箇条書きで提示する。

ユーザーの回答を待つ。修正があれば反映する。

## Step 3: Commands の確認 [3/4]

検出したビルド・テスト・リントコマンドをもとに確認:

**質問:**
「以下のコマンドを CLAUDE.md に設定します。追加・修正があれば教えてください。」

```
ビルド:  npm run build
テスト:  npm test
リント:  npm run lint
フォーマット: npm run format
```

ユーザーの回答を待つ。

さらに聞く:
「他に Claude が知っておくべきコマンド（デプロイ、DB マイグレーション、コード生成など）はありますか？なければ Enter で進みます。」

## Step 4: Code Style の確認 [4/4]

検出したスタイル設定をもとに確認:

**質問:**
「コーディング規約について、以下を確認させてください:」

1. 「命名規則に特別なルールはありますか？（例: コンポーネントは PascalCase、ユーティリティは camelCase）」
2. 「インポート順序のルールはありますか？」
3. 「コメント言語は日本語・英語どちらですか？」
4. 「その他 Claude に守ってほしいコーディングルールがあれば教えてください。なければ Enter で進みます。」

各質問をまとめて聞き、ユーザーの回答を待つ。

## Step 5: CLAUDE.md を更新

ユーザーの回答をもとに CLAUDE.md を更新する。

**更新ルール:**

- `## specflow Integration` セクション（先頭〜`## Tech Stack` の直前）は **変更しない**
- `## Tech Stack` セクションの HTML コメント (`<!-- ... -->`) を削除し、実際の内容で置き換える
- `## Commands` セクションも同様に置き換える
- `## Code Style` セクションも同様に置き換える
- `## MANUAL ADDITIONS` セクションは **変更しない**（既存内容があればそのまま残す）
- 既にユーザーが記入済みの内容がある場合、上書き前に確認する

更新後、差分を表示してユーザーに確認:

```
CLAUDE.md を更新しました:

  ## Tech Stack
  - TypeScript 5.x
  - React 19, Next.js 15
  - Node.js 22 LTS
  - pnpm

  ## Commands
  - ビルド: pnpm build
  - テスト: pnpm test
  - リント: pnpm lint

  ## Code Style
  - ESLint + Prettier で自動フォーマット
  - コメントは日本語
  ...
```

## Important Rules

- CLAUDE.md の `## specflow Integration` セクションは絶対に変更しない。
- `## MANUAL ADDITIONS` セクションの既存内容を消さない。
- 検出結果を鵜呑みにせず、必ずユーザーに確認してから書き込む。
- ユーザーが「わからない」「あとで」と言ったセクションはコメントのまま残す。
- 既に記入済みの CLAUDE.md に対して実行された場合、既存内容を表示して上書きするか確認する。
