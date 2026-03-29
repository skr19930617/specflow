---
description: GitHub issue から spec 作成 → clarify → Codex spec review を実行
handoffs:
  - label: Plan に進む
    agent: specflow.plan
    prompt: Plan → Tasks を作成しレビュー
  - label: Spec を修正
    agent: specflow.spec_fix
    prompt: Spec のレビュー指摘を修正
  - label: 中止
    agent: specflow.reject
    prompt: 変更を破棄
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

Before starting, verify the project is initialized:

1. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing: "`.specflow/config.env` が見つかりません。先に `specflow-init` を実行してください。" → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing: "speckit が見つかりません。speckit をインストールしてから再度実行してください。" → **STOP**.
3. Run `source .specflow/config.env` via Bash to load project config.

## Step 1: Setup

1. **Determine the issue URL:**
   - If `$ARGUMENTS` is non-empty and looks like a URL (contains `github` and `/issues/`), use it as the issue URL.
   - If `$ARGUMENTS` is empty or not a valid issue URL, ask the user: "GitHub issue URL を入力してください (例: `https://github.com/OWNER/REPO/issues/123`)" and **wait for their response**.
   - Validate the URL matches the pattern `https://<HOST>/<OWNER>/<REPO>/issues/<NUMBER>`. If invalid, ask the user to correct it.

## Step 2: Fetch Issue

Run via Bash:
```bash
specflow-fetch-issue "<ISSUE_URL>" > /tmp/specflow-issue.json
```

Read `/tmp/specflow-issue.json` and extract: title, body, url, number, state, author login, label names.

Report to the user:
```
Step 2: Issue fetched — #<number> — <title>
Author: <author> | State: <state> | Labels: <labels>
```

Show a brief summary of the issue body.

## Step 3: Create Spec via speckit

Read the file `.claude/commands/speckit.specify.md` and follow its complete workflow, using the issue title and body as the feature description input.

This will:
- Create a feature branch
- Generate a spec file in the speckit directory structure (e.g., `specs/<number>-<short-name>/spec.md`)
- Run quality validation

Remember the `FEATURE_SPEC` path output by speckit — this is the spec file for all subsequent steps.

Report: `Step 3 complete — Spec created`

## Step 4: Clarify

### Clarify Override: AskUserQuestion でボタン表示

Read the file `.claude/commands/speckit.clarify.md` and follow its complete workflow, **but apply these overrides** for ALL user-facing questions:

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

Read `.specflow/review_spec_prompt.txt` for the review prompt.
Read the current `FEATURE_SPEC` file.
Read the issue body from `/tmp/specflow-issue.json`.

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.txt の内容>

ISSUE BODY:
<issue body の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON (the review prompt instructs the model to return strict JSON with `decision`, `questions`, and `summary` fields).

Present the review:
```
Step 5: Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
| Q2 | medium | ... | ... | ... |
```

Report the review results.

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt to fix any issues found in the review.
- Do NOT suggest fixes or apply changes.
- Do NOT run any additional commands after presenting results.
- Do NOT offer to help with the next steps.
- Your response MUST end after the review table and summary.
- The handoff buttons (Plan に進む / Spec を修正 / 中止) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response after reporting the results — the handoff buttons will appear automatically.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only (config and review prompts).
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
