---
description: 実装を承認し、コミット → Push → PR 作成
---

## User Input

```text
$ARGUMENTS
```

## Quality Gate

1. speckit の feature ディレクトリを取得する:
   ```bash
   .specify/scripts/bash/check-prerequisites.sh --json --paths-only
   ```
   JSON 出力から `FEATURE_DIR` を取得する。

2. review-ledger.json を読み込む:
   - `FEATURE_DIR/review-ledger.json` を Read ツールで読み込む。
   - **ファイルが存在しない場合** → 以下を表示して **STOP**:
     ```
     ## Quality Gate: BLOCKED
     review-ledger.json が見つかりません。先に impl/fix フェーズで review を実行してください。
     ```
   - **JSON パースに失敗した場合** → 以下を表示して **STOP**:
     ```
     ## Quality Gate: BLOCKED
     review-ledger.json のパースに失敗しました。ファイルを確認してください。
     ```
   - **`status` フィールドが存在しない場合** → 以下を表示して **STOP**:
     ```
     ## Quality Gate: BLOCKED
     review-ledger.json に status フィールドがありません。ledger の形式を確認してください。
     ```

3. `status` フィールドで gate 判定を行う:
   - `status` が `has_open_high` の場合 → **停止**。以下を表示して **STOP**:
     ```
     ## Quality Gate: BLOCKED

     review-ledger.json に未解決の high finding があります。
     `/specflow.fix` で修正してから再度 `/specflow.approve` を実行してください。
     ```
     続けて、`findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding を抽出し、以下のテーブル形式で表示する:
     ```
     | ID | Title | Status | Detail |
     |----|-------|--------|--------|
     | R1-F01 | ... | new | ... |
     ```
     `findings` が存在しない、または配列でない場合は、テーブル表示をスキップする。

   - `status` が `all_resolved` の場合 → **通過**。以下を表示:
     ```
     ## Quality Gate: PASSED
     ```
   - `status` が `in_progress` の場合 → **通過**。以下を表示:
     ```
     ## Quality Gate: PASSED
     ```
   - `status` が上記以外の未知の値の場合 → **停止**。以下を表示して **STOP**:
     ```
     ## Quality Gate: BLOCKED
     不明な ledger status です。ファイルを確認してください。
     ```
     `findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding があればテーブル表示する。`findings` が存在しないまたは配列でない場合は、テーブル表示をスキップする。

## Commit

1. `git status` で変更ファイルを確認し一覧をユーザーに表示する。
2. `git diff --stat` で変更量を表示する。
3. speckit の spec ファイルを読み取る:
   ```bash
   .specify/scripts/bash/check-prerequisites.sh --json --paths-only
   ```
   `FEATURE_SPEC` を取得して spec の内容を読む。

4. spec の内容に基づいてコミットメッセージを生成する。フォーマット:
   ```
   <type>: <short summary> (#<issue-number>)

   <body — what was implemented and why>

   Issue: <issue-url>
   ```
   - `<type>` は feat / fix / refactor / docs / chore などから適切なものを選ぶ
   - issue-number と issue-url は spec ファイルの Source URL / Issue Number から取得する

5. 生成したコミットメッセージをユーザーに表示する。

6. コミットを実行:
   ```bash
   git add -A -- . ':(exclude).specflow'
   ```
   続いて `git commit` を実行する。

## Push & Pull Request

1. 現在のブランチ名を取得:
   ```bash
   git branch --show-current
   ```

2. リモートに同名ブランチで push:
   ```bash
   git push -u origin <branch-name>
   ```

3. デフォルトブランチを取得:
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```

4. PR のタイトルと本文を生成する:
   - **タイトル**: コミットメッセージの1行目をそのまま使う
   - **本文**: 以下のフォーマット
     ```markdown
     ## Summary
     <spec の Acceptance Criteria や実装内容を箇条書きで 3-5 行>

     ## Issue
     Closes <issue-url>
     ```

5. `gh pr create` で PR を作成する:
   ```bash
   gh pr create --title "<title>" --body "<body>" --base <default-branch>
   ```

6. PR 作成後、PR の URL をユーザーに表示する。

Report: "Implementation approved, committed, and PR created: `<PR-URL>`" → **END**.
