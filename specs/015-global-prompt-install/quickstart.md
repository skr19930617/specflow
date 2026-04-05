# Quickstart: 015-global-prompt-install

## 概要

`.specflow/review_*_prompt.txt` を `global/review_*_prompt.md` に移動し、全スラッシュコマンドの参照パスを更新する。

## 前提条件

- specflow リポジトリのクローン
- `specflow-install` の実行権限

## 変更対象ファイル

### 新規作成（移動 + 変換）
- `global/review_spec_prompt.md`
- `global/review_plan_prompt.md`
- `global/review_impl_prompt.md`
- `global/review_impl_rereview_prompt.md`

### 更新（参照パス変更）
- `global/specflow.spec_review.md`
- `global/specflow.spec_fix.md`
- `global/specflow.plan_review.md`
- `global/specflow.plan_fix.md`
- `global/specflow.impl_review.md`
- `global/specflow.fix.md`

### 削除
- `template/.specflow/review_spec_prompt.txt`
- `template/.specflow/review_plan_prompt.txt`
- `template/.specflow/review_impl_prompt.txt`
- `template/.specflow/review_impl_rereview_prompt.txt`

### 更新（出力メッセージ）
- `bin/specflow-init`

## 検証手順

1. `specflow-install` を実行し `~/.config/specflow/global/` に `.md` prompt が配置されることを確認
2. 新規プロジェクトで `specflow-init` を実行し `.specflow/` に prompt ファイルが含まれないことを確認
3. `/specflow.spec_review` を実行し `global/review_spec_prompt.md` が読み込まれることを確認
