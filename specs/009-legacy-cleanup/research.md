# Research: レガシーコードのリファクタリング

**Date**: 2026-04-03 | **Branch**: 009-legacy-cleanup

## R1: 削除対象ファイルの特定

### 調査方法
全ファイル（`.git/`, `.specify/`, `specs/`, `.claude/` を除く）に対して、basename による grep クロスリファレンス検索を実施。

### 結果
**リポジトリ内に参照元ゼロのファイルは存在しない。** 全ファイルが少なくとも1つの他ファイルから参照されている。

過去に削除済みのレガシーファイル（git history で確認）:
- `bin/specflow` — 旧 CLI エントリーポイント（コミット 2601400 で削除済み）
- `bin/specflow-parse-jsonl.py` — JSONL パーサー（コミット 2601400 で削除済み）
- `global/codex-config.toml` — Codex 設定（コミット 2601400 で削除済み）
- `global/specflow.review.md` — 旧レビューコマンド（コミット 9d0551c で削除済み）

**Decision**: 現時点で削除すべきファイルはない。主な作業はドキュメント・スクリプトの不整合修正。
**Rationale**: 過去のクリーンアップで主要なレガシーファイルは削除済み。残っている不整合の修正が本 issue の主目的。

## R2: template/ と .specflow/ の不整合

### 発見
`template/.specflow/` に存在するが `README.md` のファイル構成セクションに記載がないファイル:
- `review_impl_rereview_prompt.txt` — `global/specflow.fix.md` から参照されている正規ファイル

### 影響
- `specflow-init` で新規プロジェクトにコピーされるが、README に記載がないため存在が分かりにくい
- 既存プロジェクト（本リポジトリ含む）の `.specflow/` には手動コピーしない限り存在しない

**Decision**: README のファイル構成に `review_impl_rereview_prompt.txt` を追記する。
**Rationale**: 正規ファイルであり、specflow.fix.md のワークフローに必要。

## R3: specflow-init 完了メッセージの不整合

### 発見
`bin/specflow-init` 行 136-138 の完了メッセージ:
```
.specflow/config.env
.specflow/review_spec_prompt.txt
.specflow/review_impl_prompt.txt
```

実際にテンプレートからコピーされるファイル（5 ファイル）:
```
.specflow/config.env
.specflow/review_spec_prompt.txt
.specflow/review_plan_prompt.txt          ← メッセージに記載なし
.specflow/review_impl_prompt.txt
.specflow/review_impl_rereview_prompt.txt ← メッセージに記載なし
```

**Decision**: 完了メッセージを実際のファイル一覧と一致させる。
**Rationale**: FR-006 の要件（表示メッセージと実際のコピー内容の一致）を満たすため。

## R4: specflow-install の古いシンボリックリンク問題

### 発見
現在の `specflow-install` は `bin/specflow-*` のグロブで全スクリプトのシンボリックリンクを作成するが、以前のバージョンでリンクされた `~/bin/specflow`（`-` なし）等の古いリンクを掃除する機能がない。

### 影響
旧バージョンからアップデートしたユーザーの `~/bin/` に壊れたシンボリックリンクが残る可能性がある。

**Decision**: `specflow-install` に `~/bin/specflow*` のうち壊れたシンボリックリンク（ターゲットが存在しない）を検出・自動削除するステップを追加する。
**Rationale**: FR-008 の要件を満たすため。自動削除にする（壊れたリンクに有用性はないため）。

## R5: README.md の更新箇所特定

### 発見
README.md のファイル構成セクション（行 193-223）に以下の不足・不整合:
1. `template/.specflow/review_plan_prompt.txt` の説明がない（行 214 の後に追記が必要）
2. `template/.specflow/review_impl_rereview_prompt.txt` の記載がない

その他のセクション（セットアップ手順、コマンド一覧等）は現行のファイル構成と整合している。

**Decision**: ファイル構成セクションに 2 ファイルの記載を追加する。
**Alternatives considered**: 全セクションの完全リライト → 不要（他セクションは整合している）
