---
description: GitHub issue から spec 作成 → clarify → Codex review → clarify を実行
handoffs:
  - label: Plan に進む
    agent: specflow.build
    prompt: Plan → Tasks → Implement を実行
  - label: もう一度 Review
    agent: specflow.review
    prompt: Codex spec review を再実行
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

## Step 0: Setup

1. **Determine the issue URL:**
   - If `$ARGUMENTS` is non-empty and looks like a URL (contains `github` and `/issues/`), use it as the issue URL.
   - If `$ARGUMENTS` is empty or not a valid issue URL, ask the user: "GitHub issue URL を入力してください (例: `https://github.com/OWNER/REPO/issues/123`)" and **wait for their response**.
   - Validate the URL matches the pattern `https://<HOST>/<OWNER>/<REPO>/issues/<NUMBER>`. If invalid, ask the user to correct it.

## Step 1: Fetch Issue [1/7]

Run via Bash:
```bash
specflow-fetch-issue "<ISSUE_URL>" > /tmp/specflow-issue.json
```

Read `/tmp/specflow-issue.json` and extract: title, body, url, number, state, author login, label names.

Report to the user:
```
[1/7] Issue fetched: #<number> — <title>
Author: <author> | State: <state> | Labels: <labels>
```

Show a brief summary of the issue body.

## Step 2: Create Spec via speckit [2/7]

Read the file `.claude/commands/speckit.specify.md` and follow its complete workflow, using the issue title and body as the feature description input.

This will:
- Create a feature branch
- Generate a spec file in the speckit directory structure (e.g., `specs/<number>-<short-name>/spec.md`)
- Run quality validation

Remember the `FEATURE_SPEC` path output by speckit — this is the spec file for all subsequent steps.

Report: `[2/7] Spec created via speckit.specify`

## Step 3: Clarify — 1st Round (human) [3/7]

Read the file `.claude/commands/speckit.clarify.md` and follow its complete workflow.

This will:
- Scan the spec for ambiguity across all taxonomy categories
- Ask the user up to 5 clarification questions **one at a time**
- The user answers each question interactively
- Integrate answers back into the spec file

Report: `[3/7] Clarify 1st round complete`

## Step 4: Codex Spec Review [4/7]

Read `.specflow/review_spec_prompt.txt` for the review prompt.
Read the current `FEATURE_SPEC` file.

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.txt の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON (the review prompt instructs the model to return strict JSON with `decision`, `questions`, and `summary` fields).

Present the review:
```
[4/7] Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
| Q2 | medium | ... | ... | ... |
```

If decision is **APPROVE**: report "Spec approved" and **END** (handoff buttons will let user proceed to plan).

If decision is **REQUEST_CHANGES** or **BLOCK**: proceed to Step 5.

## Step 5: Clarify — 2nd Round (review findings + human) [5/7]

Present the review findings as additional context, then read the file `.claude/commands/speckit.clarify.md` and follow its workflow again.

When scanning the spec for ambiguity, **prioritize the review findings** as high-priority items to address.

After clarification is complete, report the summary and **END**. The handoff buttons will let the user choose: "Plan に進む" or "もう一度 Review".

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only (config and review prompts).
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
