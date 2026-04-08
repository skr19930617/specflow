## 1. specflow.spec コマンド定義

- [x] 1.1 `global/commands/specflow.spec.md` を新規作成し、コマンドのフロントマター（description）を定義する
- [x] 1.2 Prerequisites セクションを記述（openspec 初期化チェック）
- [x] 1.3 Step 1: コードベース解析ロジックを記述（Glob でディレクトリ構造スキャン → 設定ファイル読み取り → 主要ソースファイル内部読み取り → capability 候補抽出）
- [x] 1.4 Step 2: capability 一覧提示と選択ロジックを記述（AskUserQuestion multiSelect で検出結果を提示、追加・削除可能）
- [x] 1.5 Step 3: capability ごとのインタラクティブ質問フローを記述（スコープ確認 → 主要要件 → 制約の順で AskUserQuestion を使用）
- [x] 1.6 Step 4: spec ファイル生成ロジックを記述（capability 名正規化 → OpenSpec CLI 優先 → canonical fallback template 使用 → `mkdir -p` によるディレクトリ保証）
- [x] 1.7 Step 5: 完了報告と次のアクションのハンドオフ（生成結果のサマリー表示）

## 2. specflow メインフローの修正

- [x] 2.1 `global/commands/specflow.md` に Step 2.5（spec 存在チェック）を追加: Glob で `openspec/specs/*/spec.md` の存在を確認（ディレクトリではなくファイルベース）
- [x] 2.2 spec が0件の場合の AskUserQuestion 分岐を記述（「specflow.spec を実行」/「スキップして続行」の選択肢）
- [x] 2.3 spec が1件以上の場合は通常フローを中断せずに続行するロジックを確認

## 3. CLAUDE.md・ドキュメント更新

- [x] 3.1 `CLAUDE.md` の specflow Slash Commands テーブルに `/specflow.spec` を追加
- [x] 3.2 フロー説明に spec bootstrap の位置づけを追記
