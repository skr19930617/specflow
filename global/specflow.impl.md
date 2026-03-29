---
description: speckit で実装を実行し、Codex で実装レビュー
handoffs:
  - label: Approve & Commit
    agent: specflow.approve
    prompt: 実装を承認してコミット・PR 作成
  - label: Fix All
    agent: specflow.fix
    prompt: 指摘をすべて修正
  - label: Reject (全変更破棄)
    agent: specflow.reject
    prompt: 実装を破棄
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specflow/config.env` via Bash. If missing → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash. If missing → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Step 1: Implement

Read the file `.claude/commands/speckit.implement.md` and follow its complete workflow.

This will:
- Load tasks.md and plan.md
- Execute tasks phase-by-phase
- Mark completed tasks in tasks.md
- Validate implementation against spec

Report: `Step 1 complete — Implementation done`

## Step 2: Codex Implementation Review

### Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`.

### Review

Read `.specflow/review_impl_prompt.txt` and `FEATURE_SPEC`.

Get the current git diff:
```bash
git diff -- . ':(exclude).specflow' ':(exclude).specify'
```

Call the `codex` MCP server tool to review the implementation. Pass the following as the prompt:

```
<review_impl_prompt.txt の内容>

CURRENT GIT DIFF:
<git diff の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON.

Present the review:
```
Codex Implementation Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
| F2 | medium | src/bar.ts | ... | ... |
```

Report the review results.

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt to fix any issues found in the review.
- Do NOT suggest fixes or apply changes.
- Do NOT run any additional commands after presenting results.
- Do NOT offer to help with the next steps.
- Your response MUST end after the review table and summary.
- The handoff buttons (Approve & Commit / Fix All / Reject) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
