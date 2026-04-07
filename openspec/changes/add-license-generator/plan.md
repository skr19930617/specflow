# Implementation Plan: specflow.license コマンド

## 概要

`global/commands/specflow.license.md` に Markdown ベースのスラッシュコマンドを1ファイル作成する。既存の `specflow.readme.md` と同じパターンに従い、`specflow-analyze` → UI 表示 → ユーザー選択 → ファイル生成の流れを実装する。

## 成果物

| ファイル | 種類 | 説明 |
|---------|------|------|
| `global/commands/specflow.license.md` | 新規作成 | スラッシュコマンド定義（唯一の成果物） |

## 設計

### コマンド構造

```
---
description: プロジェクト解析に基づいてライセンスファイルを生成
---

## User Input
$ARGUMENTS

## Prerequisites
- specflow-analyze の存在確認

## Step 1: Analyze Project
- specflow-analyze . を実行
- JSON 出力を ANALYZE_RESULT に格納

## Step 2: Existing License Check
- ANALYZE_RESULT.license が非 null → 上書き確認
- マニフェストの既存 license フィールドも参考情報として表示

## Step 3: Display License Options
- 7種類のライセンス説明テーブルを表示
- おすすめロジックに基づき推奨を提示

## Step 4: License Selection (2-stage)
- Stage 1: AskUserQuestion でカテゴリ選択（寛容系 / コピーレフト系 / パブリックドメイン）
- Stage 2: AskUserQuestion でカテゴリ内の個別ライセンス選択
- おすすめを (Recommended) 付きで配置

## Step 5: Author & Year
- git config user.name で取得
- 不在時は AskUserQuestion フリーテキスト

## Step 6: Fetch License Text
- gh api /licenses/{key} でライセンス全文取得
- [year] / [fullname] プレースホルダー置換

## Step 7: Write LICENSE
- Write ツールで LICENSE ファイルを生成

## Step 8: Update Manifests
- package.json / Cargo.toml / pyproject.toml の license フィールド更新

## Step 9: Report
- 結果報告
```

### AskUserQuestion の制約対応（2段階グループ選択）

AskUserQuestion は最大4オプション。7種類のライセンスを2段階の固定ボタン選択で対応:

**ステージ1: カテゴリ選択**
1. 全7種類の説明テーブルをコンソールに表示
2. おすすめライセンスを理由とともに提示
3. AskUserQuestion で以下の3カテゴリから選択:
   - 「寛容系ライセンス」— MIT, Apache 2.0, BSD 2-Clause, ISC
   - 「コピーレフト系ライセンス」— GPL 3.0, AGPL 3.0
   - 「パブリックドメイン」— Unlicense
   - おすすめカテゴリに (Recommended) を付与

**ステージ2: 個別ライセンス選択**
- 選択されたカテゴリの全ライセンスを AskUserQuestion のボタンで表示（最大4つ以内に収まる）
  - 寛容系: MIT / Apache 2.0 / BSD 2-Clause / ISC（4つ）
  - コピーレフト系: GPL 3.0 / AGPL 3.0（2つ）
  - パブリックドメイン: Unlicense（1つ → 確認のみ）
- おすすめライセンスに (Recommended) を付与
- Rust プロジェクトの場合は寛容系カテゴリ内で MIT と Apache 2.0 の両方に推奨理由を表示

この設計により、全7種類が固定ボタン選択で完結し、フリーテキスト入力に依存しない。

### おすすめロジックの実装

Markdown の条件分岐（If/Otherwise）で実装:
1. `ANALYZE_RESULT.license` が非 null → 上書き確認フローへ
2. `ANALYZE_RESULT.package_manager == "npm"` OR languages に JS/TS → MIT 推奨
3. languages に "Rust" → MIT OR Apache 2.0 推奨
4. languages に "Go" → BSD 2-Clause 推奨
5. frameworks が非空 → MIT 推奨
6. デフォルト → MIT 推奨

### GitHub API 呼び出し

```bash
gh api /licenses/{key} --jq '.body'
```

- `gh` CLI は specflow の前提ツール（README に記載済み）
- 認証済み（`gh auth login` が前提）
- `--jq '.body'` でライセンス全文のみ抽出

### マニフェスト更新ロジック

各ファイルに対して:
1. Read ツールでファイルを読む
2. 対象テーブル/セクションが存在するか確認
3. 既存の license フィールドがある場合:
   - SPDX が同一 → スキップ
   - SPDX が異なる → AskUserQuestion で確認
   - pyproject.toml でテーブル形式 → スキップ + 警告
4. Edit ツールで license フィールドを更新

## リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| GitHub API レート制限 | ライセンス取得失敗 | エラー表示でリトライ案内 |
| gh CLI 未インストール | API 呼び出し失敗 | Prerequisites で which gh チェック |
| マニフェストの複雑なフォーマット | Edit 失敗 | Read で構造確認後に Edit |

## 依存関係

- `specflow-analyze` — プロジェクト解析
- `gh` CLI — GitHub Licenses API アクセス
- 既存の AskUserQuestion / Read / Write / Edit / Bash ツール
