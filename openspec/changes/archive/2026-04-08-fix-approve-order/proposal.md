## Why

`/specflow.approve` コマンドの実行順序に問題がある。現在は Commit → Push → PR 作成 → Archive の順で実行されるが、archive が最後に行われるため、コミットされた diff に archive 前の openspec artifacts がそのまま含まれてしまう。Archive を Commit の前に実行することで、archive 済みの状態でコミット・PR 作成が行われるようにする。

## What Changes

- `/specflow.approve` コマンド内の実行順序を変更: Archive セクションを Commit セクションの前（Approval Summary 生成後）に移動
- Archive 実行後にコミット → Push → PR 作成の順序で処理を行うように修正
- Archive 失敗時のエラーハンドリング: 失敗しても警告を表示して commit 以降のフローを続行する（非ブロッキング）
- Archive 後の `git add -A` により、artifacts の移動（削除+追加）がコミット diff に含まれる（意図した動作）

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

(なし — 実行順序の変更のみで、各機能の要件自体は変わらない)

## Impact

- 影響ファイル: `global/commands/specflow.approve.md`
- 動作変更: approve 実行時、archive が commit より先に実行されるようになる
- 副作用: コミットに含まれる diff が archive 後の状態を反映する（openspec artifacts が archive ディレクトリに移動済み）
