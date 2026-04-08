## 1. Archive セクションの移動

- [x] 1.1 `global/commands/specflow.approve.md` の Archive セクション（`## Archive` 以降）を Commit セクション（`## Commit`）の直前に移動する
- [x] 1.2 移動した Archive セクションのエラーハンドリング記述を更新する: 「PR was already created」→ 警告表示して commit 以降を続行

## 2. 説明文の更新

- [x] 2.1 ファイル先頭の description を現在の「実装を承認し、コミット → Push → PR 作成」から実行順序を反映した記述に更新する
- [x] 2.2 Archive セクション内の「After the PR is created」の記述を「After Approval Summary is generated」に修正する

## 3. 検証

- [x] 3.1 変更後のセクション順序が Quality Gate → Approval Summary → Archive → Commit → Push & PR の順になっていることを確認する
