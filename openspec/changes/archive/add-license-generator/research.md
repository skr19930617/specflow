# Research: ライセンスコマンド実装

## 既存コマンドパターン

`specflow.readme.md` を参考にした既存パターン:
- YAML frontmatter (`description` フィールド)
- `$ARGUMENTS` でユーザー入力を受け取る
- Prerequisites で `specflow-analyze` の存在確認
- `specflow-analyze .` でプロジェクト解析 → JSON 出力
- `AskUserQuestion` で UI 操作
- Write ツールでファイル生成

## GitHub Licenses API

- エンドポイント: `https://api.github.com/licenses/{key}`
- 認証不要（パブリック API）
- レスポンス: `{ "key": "mit", "spdx_id": "MIT", "body": "MIT License\n\nCopyright (c) [year] [fullname]..." }`
- `body` フィールドにライセンス全文が含まれる
- プレースホルダー: MIT, BSD, ISC は `[year]`, `[fullname]` を含む。GPL, Apache, AGPL, Unlicense は含まない
- コマンド内で `gh api /licenses/{key}` または `WebFetch` で取得可能

## AskUserQuestion の制約

- `options` は最大4つまで（7種類を一度に表示できない）
- 解決策: 2回の AskUserQuestion に分割するか、カテゴリで分類
  - 案1: 「寛容系」(MIT, Apache, BSD, ISC) と「コピーレフト系」(GPL, AGPL) と「パブリックドメイン」(Unlicense)
  - 案2: おすすめを含む上位4つ + 「その他を表示」で2段階選択
  - 案3: 全7種類の説明テーブルを表示し、おすすめに (Recommended) マーク付きで最初のオプションにする。残りは4つに収める工夫が必要
- **最適解**: AskUserQuestion のオプションに「その他」が自動追加されるため、上位3-4種類をボタンで表示し、テーブルで全7種類を表示。ユーザーが「その他」で任意のライセンス名を入力できる

## マニフェスト更新の実装方法

- `package.json`: Read → JSON パース → `license` フィールドを Edit で更新
- `Cargo.toml`: Read → `[package]` セクションの `license` 行を Edit で更新
- `pyproject.toml`: Read → `[project]` セクションの `license` を確認。文字列形式のみ更新
