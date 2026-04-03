# Quickstart: レガシーコードのリファクタリング

**Branch**: 009-legacy-cleanup

## 実装手順サマリー

### 1. README.md のファイル構成セクション更新
- `template/.specflow/` に `review_impl_rereview_prompt.txt` の行を追加
- 行 214 の後（`review_plan_prompt.txt` の次）に記載

### 2. bin/specflow-init の完了メッセージ修正
- 行 136-138 のファイル一覧を、template/.specflow/ の実際の内容と一致させる
- `review_plan_prompt.txt` と `review_impl_rereview_prompt.txt` を追加

### 3. bin/specflow-install に古いシンボリックリンク掃除を追加
- セクション 2（bin/ scripts → ~/bin）の末尾に追加
- `~/bin/specflow*` のうち壊れたシンボリックリンクを検出・削除
- 削除したリンクの名前を表示

### 検証手順
1. `specflow-install` を実行 → エラーなし
2. `~/bin/` に壊れたリンクがないことを確認
3. README.md のファイル構成が実際の構造と一致することを確認
