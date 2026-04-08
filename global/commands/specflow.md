---
description: GitHub issue URL またはインライン仕様記述から spec 作成 → clarify → Codex spec review を実行
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

Before starting, verify the project is initialized:

1. Run `ls openspec/config.yaml` via Bash to confirm OpenSpec is initialized.
   - If missing:
     ```
     ❌ OpenSpec が初期化されていません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.

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

**Feature description input depends on MODE:**
- **`MODE = issue_url`**: Use the issue title and body (fetched in Step 2) as the feature description input.
- **`MODE = inline_spec`**: Use `INPUT_TEXT` (the user's inline specification text) directly as the feature description input.

Using the feature description, create a spec via the following workflow:
1. Create a feature branch from the current base branch (the branch name determines the change id).
2. Generate a proposal file at `openspec/changes/<change-id>/proposal.md` using the spec template.
3. Run quality validation on the generated spec.

Set `CHANGE_ID` to the branch name (or the change id output by specflow). All subsequent steps use `openspec/changes/<CHANGE_ID>/` as the artifact directory.

Report: `Step 3 complete — Spec created`

## Step 4: Complexity Check

<!-- Lightweight analysis to detect multi-area specs before Clarify.
     Uses the same classification criteria as specflow.decompose Step 2,
     but does NOT produce full sub-feature structuring. -->

Read the spec file at `openspec/changes/<CHANGE_ID>/proposal.md` and analyze it for independent functional areas — groups of requirements that could be implemented and tested separately without depending on each other.

**Classification:**
- **Outcome (a) "decompose"**: The spec contains **2 or more** clearly independent functional areas.
- **Outcome (b) "no-action"**: The spec is well-scoped — single functional area.
- **Outcome (c) "no-clear-split"**: Multiple topics but heavily interconnected.

### If outcome is (b) or (c):

Report: `Step 4 complete — Spec is well-scoped, proceeding to Clarify`
→ Proceed to Step 5.

### If outcome is (a):

Use `AskUserQuestion` to present the detected areas and let the user decide:

**Question text:**
```
⚠️ このspecには複数の独立した機能領域が含まれています:

<detected areas as bullet list, e.g.:
- 領域1: <area title>
- 領域2: <area title>
>

サブ機能に分解しますか？分解すると、各領域を個別の issue/spec として実装・テストできます。
```

**Options:**
- **"分解する (Decompose)"**
- **"このまま続行 (Continue as-is)"**

#### If user selects "分解する (Decompose)":

- **If `MODE = issue_url`**:
  Read the file `global/commands/specflow.decompose.md` and follow its complete workflow starting from Step 1.
  → **STOP** after the decompose flow completes.

- **If `MODE = inline_spec`**:
  Display:
  ```
  ⚠️ インラインspecには GitHub issue が紐づいていないため、自動的なsub-issue作成はできません。

  以下の独立した機能領域が検出されました:

  | # | 領域 | 概要 |
  |---|------|------|
  | 1 | <area title> | <brief description> |
  | 2 | <area title> | <brief description> |

  各領域ごとに `/specflow` を個別に実行することを推奨します。
  ```
  → **STOP**.

#### If user selects "このまま続行 (Continue as-is)":

Report: `Step 4 complete — Continuing with full spec`
→ Proceed to Step 5.

## Step 5: Clarify

### Clarify Override: AskUserQuestion でボタン表示

Run the clarify workflow on the spec generated in Step 3, **applying these overrides** for ALL user-facing questions:

- **選択式の質問:** マークダウンテーブルで選択肢を並べて「A/B/C で回答してください」と書く代わりに、`AskUserQuestion` ツールを使う。各選択肢をボタンオプションとして渡す。推奨オプションとその理由を質問テキストに含める。自由回答が適切な場合は「その他（短い回答）」をオプションに追加する。
- **自由回答の質問:** `AskUserQuestion` ツールで質問を提示する（ボタンなし、フリーテキスト入力）。提案する回答を質問テキストに含める。
- マークダウンの選択肢テーブルは **表示しない**。「A/B/C で回答してください」とは **書かない**。

This will:
- Scan the spec for ambiguity across all taxonomy categories
- Ask the user up to 5 clarification questions **one at a time** via AskUserQuestion buttons
- The user answers each question by clicking a button or typing a short answer
- Integrate answers back into `openspec/changes/<CHANGE_ID>/proposal.md`

Report: `Step 5 complete — Clarify done`

## Step 6: Codex Spec Review

Read the file `global/specflow.spec_review.md` and follow its complete workflow.

This will:
- Read the review prompt and spec file
- Call Codex MCP to review the spec
- Present the review results
- Show handoff options (Plan に進む / Spec を修正 / 中止)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, plan, tasks) are managed in `openspec/changes/<change-id>/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading specflow command files, follow their instructions faithfully.
