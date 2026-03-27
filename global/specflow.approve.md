---
description: 実装を承認し、コミット → Push → PR 作成
---

## User Input

```text
$ARGUMENTS
```

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
