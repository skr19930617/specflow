---
description: GitHub issue URL またはインライン仕様記述から spec 作成 → clarify → Codex spec review を実行
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

Before starting, verify the project is initialized:

1. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm specflow prerequisites are installed.
   - If missing:
     ```
     ❌ specflow prerequisites が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash to load project config.

## Step 1: Setup — 入力取得と分類

<!-- Input modes:
  (1) /specflow <issue-url>  → 引数が issue URL → プロンプトなしで issue 取得
  (2) /specflow <text>       → 引数が URL 以外 → プロンプトなしでインライン仕様記述
  (3) /specflow              → 引数なし → テキスト案内を表示しユーザー入力を待つ
-->

1. **入力テキストの取得（共通エントリポイント）:**
   - If `$ARGUMENTS` is non-empty, use it as `INPUT_TEXT` (do NOT display a prompt).
   - If `$ARGUMENTS` is empty, display the following message and **wait for the user's next message**:
     ```
     GitHub issue URL を入力するか、仕様をテキストで記述してください。
     例:
     - Issue URL: https://github.com/OWNER/REPO/issues/123
     - インライン仕様: 「ユーザー認証機能を追加する」
     ```
     Use the user's response as `INPUT_TEXT`.

2. **入力分類（統一ロジック — 引数・プロンプト両方に適用）:**
   - If `INPUT_TEXT` is empty or whitespace-only → re-display the prompt message above and wait again (loop until non-empty input is received).
   - If `INPUT_TEXT` matches the pattern `https://<HOST>/<OWNER>/<REPO>/issues/<NUMBER>` (i.e., a URL containing `/issues/` followed by a number) → set `MODE = issue_url` and store `INPUT_TEXT` as the issue URL.
   - Otherwise → set `MODE = inline_spec` and store `INPUT_TEXT` as the feature description.

## Step 2: Fetch Issue (MODE = issue_url のみ)

**If `MODE = inline_spec`**: Remove any stale issue context by running `rm -f /tmp/specflow-issue.json` via Bash, then skip this step entirely and proceed to Step 3.

**If `MODE = issue_url`**:

Run via Bash:
```bash
specflow-fetch-issue "<ISSUE_URL>" > /tmp/specflow-issue.json
```

If the command fails (non-zero exit code, empty output, or the JSON contains an error):
- Display the error: `"Issue 取得に失敗しました: <error details>。URL を確認して再入力してください。"`
- Re-display the text prompt from Step 1 and **wait for the user's next message**.
- Use the new response as `INPUT_TEXT` and re-run the classification logic from Step 1 point 2 (the user may enter a different URL or switch to inline spec).

If successful, read `/tmp/specflow-issue.json` and extract: title, body, url, number, state, author login, label names.

Report to the user:
```
Step 2: Issue fetched — #<number> — <title>
Author: <author> | State: <state> | Labels: <labels>
```

Show a brief summary of the issue body.

## Step 3: Create Spec via specflow

Read the file `.claude/commands/specflow.specify.md` and follow its complete workflow.

**Feature description input depends on MODE:**
- **`MODE = issue_url`**: Use the issue title and body (fetched in Step 2) as the feature description input.
- **`MODE = inline_spec`**: Use `INPUT_TEXT` (the user's inline specification text) directly as the feature description input.

This will:
- Create a feature branch
- Generate a spec file in the specflow directory structure (e.g., `openspec/changes/<number>-<short-name>/spec.md`)
- Run quality validation

Remember the `FEATURE_SPEC` path output by specflow — this is the spec file for all subsequent steps.

Report: `Step 3 complete — Spec created`

## Step 4: Clarify

### Clarify Override: AskUserQuestion でボタン表示

Read the file `.claude/commands/specflow.clarify.md` and follow its complete workflow, **but apply these overrides** for ALL user-facing questions:

- **選択式の質問:** マークダウンテーブルで選択肢を並べて「A/B/C で回答してください」と書く代わりに、`AskUserQuestion` ツールを使う。各選択肢をボタンオプションとして渡す。推奨オプションとその理由を質問テキストに含める。自由回答が適切な場合は「その他（短い回答）」をオプションに追加する。
- **自由回答の質問:** `AskUserQuestion` ツールで質問を提示する（ボタンなし、フリーテキスト入力）。提案する回答を質問テキストに含める。
- マークダウンの選択肢テーブルは **表示しない**。「A/B/C で回答してください」とは **書かない**。

This will:
- Scan the spec for ambiguity across all taxonomy categories
- Ask the user up to 5 clarification questions **one at a time** via AskUserQuestion buttons
- The user answers each question by clicking a button or typing a short answer
- Integrate answers back into the spec file

Report: `Step 4 complete — Clarify done`

## Step 5: Codex Spec Review

Read the file `global/specflow.spec_review.md` and follow its complete workflow.

This will:
- Read the review prompt and spec file
- Call Codex MCP to review the spec
- Present the review results
- Show handoff options (Plan に進む / Spec を修正 / 中止)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only (config and review prompts).
- Spec, plan, tasks are managed by specflow in `.specify/` and `openspec/changes/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading specflow command files, follow their instructions faithfully.
