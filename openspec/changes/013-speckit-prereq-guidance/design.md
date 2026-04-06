<!-- Historical Migration
  Source: specs/013-specflow-prereq-guidance/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: specflow 前提条件チェック時のガイダンス改善

**Branch**: `013-specflow-prereq-guidance` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-specflow-prereq-guidance/spec.md`

## Summary

specflow コマンド群の Prerequisites セクションに含まれるエラーメッセージを改善し、specflow 未インストール時は `npx specy init`、specflow 未初期化時は `/specflow.setup` をコマンド付きステップ形式で案内する。README にもセットアップ手順を追加する。

## Technical Context

**Language/Version**: Markdown (Claude Code slash commands)
**Primary Dependencies**: なし（マークダウンファイルの文言修正のみ）
**Storage**: N/A
**Testing**: 手動検証（specflow 未インストール / specflow 未初期化の各状態でコマンド実行）
**Target Platform**: Claude Code CLI
**Project Type**: CLI tool (slash command collection)
**Performance Goals**: N/A
**Constraints**: FR-006 — 既存チェックロジック（チェック項目・停止動作）を変更しない。ただし specflow.md のチェック順序（config.env → specflow）は他の 9 ファイル（specflow → config.env）と一致させて統一する（FR-004 のチェック順序定義に合致させるための修正）
**Scale/Scope**: 10 ファイルのエラーメッセージ修正 + README 更新

## Constitution Check

Constitution は未設定（テンプレートのまま）のため、gate チェックなし。

## Project Structure

### Documentation (this feature)

```text
specs/013-specflow-prereq-guidance/
├── plan.md              # This file
├── research.md          # 影響範囲調査
├── data-model.md        # N/A（データモデル変更なし）
├── quickstart.md        # 変更パターンと検証方法
└── tasks.md             # タスクリスト（/specflow.tasks で生成）
```

### Source Code (repository root)

```text
global/
├── specflow.md              # 詳細形式 Prerequisites 修正
├── specflow.plan.md         # 短縮形式 Prerequisites 修正
├── specflow.spec_fix.md     # 短縮形式 Prerequisites 修正
├── specflow.plan_fix.md     # 短縮形式 Prerequisites 修正
├── specflow.impl.md         # 短縮形式 Prerequisites 修正（+ config 行保持）
├── specflow.fix.md          # 短縮形式 Prerequisites 修正
├── specflow.spec_review.md  # 短縮形式 Prerequisites 修正
├── specflow.plan_review.md  # 短縮形式 Prerequisites 修正
├── specflow.impl_review.md  # 短縮形式 Prerequisites 修正（+ config 行保持）
└── specflow.approve.md      # Step 0.5 内のチェック修正

README.md                    # Prerequisites セクション追加
```

**Structure Decision**: 既存ファイルの修正のみ。新規ファイル・ディレクトリの作成なし。

## Implementation Strategy

### アプローチ: テンプレート方式

全 10 ファイルの Prerequisites セクションを統一的なフォーマットに更新する。

**エラーメッセージテンプレート（Failure State 1: specflow 未インストール）:**
```
❌ specflow が見つかりません。

次のステップでインストールしてください:
1. `npx specy init` を実行
2. `/specflow` を再度実行
```

**エラーメッセージテンプレート（Failure State 2: specflow 未初期化）:**
```
❌ `.specflow/config.env` が見つかりません。

次のステップで初期化してください:
1. `/specflow.setup` を実行
2. `/specflow` を再度実行
```

### 修正パターン

**パターン A（短縮形式 — 7 ファイル）:**
specflow.plan.md, specflow.spec_fix.md, specflow.plan_fix.md, specflow.fix.md, specflow.spec_review.md, specflow.plan_review.md, specflow.approve.md

3 行の Prerequisites セクションをステップ形式エラーメッセージ付きに更新。

**パターン B（短縮形式 + config 読み取り — 2 ファイル）:**
specflow.impl.md, specflow.impl_review.md

パターン A + 4 行目の `SPECFLOW_MAX_AUTOFIX_ROUNDS` 読み取りを保持。

**パターン C（詳細形式 + 順序統一 — 1 ファイル）:**
specflow.md

既に詳細なエラーメッセージを含むが、ステップ形式に更新。さらに、チェック順序を他ファイルと統一（現状 config.env → specflow を specflow → config.env に変更）し、FR-004 のチェック順序定義に合致させる。

**パターン D（README）:**
Prerequisites セクションを追加。Failure State → Command Mapping を記載。

## Complexity Tracking

複雑性の低い feature のため、追跡不要。
