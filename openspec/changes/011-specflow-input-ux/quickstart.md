# Quickstart: specflow 起動時の入力形式改善

## 概要

`/specflow` コマンドの Step 1（入力受付）を、AskUserQuestion ボタン方式からテキスト案内方式に変更する。また、issue URL だけでなくインライン仕様記述も受け付けるようにする。

## 変更対象ファイル

1. `global/specflow.md` — Step 1 セクションの書き換え（メイン変更）

## 変更しないファイル

- `global/specflow.spec_review.md` — spec review は入力方式に依存しない
- `global/specflow.plan.md` — plan は spec 作成後のフローで変更不要
- `.specflow/` 配下 — read-only
- `.specify/` 配下 — specflow 本体は変更不要

## 実装手順

1. `global/specflow.md` の Step 1 を修正:
   - AskUserQuestion 呼び出しを削除
   - テキスト案内メッセージを表示する指示に変更
   - 入力分類ロジック（issue URL vs インライン仕様記述 vs 空入力）を追加
2. インライン仕様記述時の分岐を Step 2〜3 に追加:
   - issue URL の場合: 従来通り Step 2 (Fetch Issue) → Step 3
   - インライン仕様の場合: Step 2 スキップ → Step 3 (specflow.specify に直接渡す)
3. Step 5 の Codex spec review で、インライン仕様の場合は issue body なしでレビューする分岐を追加

## テスト方法

- `/specflow` を引数なしで実行 → テキスト案内が表示されることを確認
- issue URL を入力 → issue 取得 → spec 作成フローが動作することを確認
- インライン仕様テキストを入力 → issue 取得スキップ → spec 作成フローが動作することを確認
- `/specflow <url>` を実行 → プロンプトなしで issue 取得に進むことを確認
