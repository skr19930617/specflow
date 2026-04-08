## Why

既存プロジェクトに specflow を導入する際、`openspec/specs/` にベースラインの spec が存在しないため spec delta エラーが発生する。新規プロジェクトでは spec が段階的に作られるが、既存プロジェクトでは既にコードベースが存在しているため、spec を後から作成する手段が必要。

## What Changes

- `specflow.spec` コマンドを新設: プロジェクト一括で `openspec/specs/<capability>/spec.md` を生成する
  - コードベースの内部（関数、クラス、API エンドポイント等）まで解析し、capability を自動検出する
  - 検出した capability 一覧をユーザーに提示し、生成対象の選択・追加・削除を可能にする
  - 選択された capability ごとにインタラクティブな質問を行い、spec を生成する
  - OpenSpec CLI の spec 関連機能（`openspec instructions` 等）を優先的に使用し、CLI に機能がない場合のみエージェントが独自に spec を構成する
- specflow メインフロー（`/specflow`）に spec 未検出時のハンドオフを追加:
  - proposal 作成前（Step 3 の前）に `openspec/specs/` をチェック
  - spec が空の場合、`specflow.spec` コマンドへの誘導を AskUserQuestion で提示する

## Capabilities

### New Capabilities
- `spec-bootstrap`: 既存コードベースの深層解析（ファイル構造＋コード内部）とインタラクティブな質問により、プロジェクト全体の `openspec/specs/<capability>/spec.md` を一括生成するコマンド機能

### Modified Capabilities

## Impact

- `global/commands/specflow.spec.md` — 新規コマンド定義ファイル
- `global/commands/specflow.md` — proposal 作成前の spec 存在チェックとハンドオフロジック追加
- specflow ワークフロー全体 — spec delta エラーが解消され、既存プロジェクトでの導入がスムーズになる

## Acceptance Criteria

1. `/specflow.spec` を実行すると、コードベース内部まで解析して capability 候補を検出する
2. 検出した capability 一覧がユーザーに提示され、選択・追加・削除できる
3. 選択された capability ごとに質問を行い、`openspec/specs/<name>/spec.md` が生成される
4. OpenSpec CLI の instructions/template が存在する場合はそれを使用する
5. `/specflow` 実行時、`openspec/specs/` が空の場合に `/specflow.spec` への誘導が表示される
6. spec 生成後、通常の specflow フロー（proposal → design → apply）が正常に動作する
