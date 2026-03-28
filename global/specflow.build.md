---
description: speckit で Plan → Tasks → Implement を実行し、Codex で実装レビュー
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

## Plan → Tasks → Implement [6/7]

This runs **automatically** without user intervention between sub-steps.

### Plan

Read the file `.claude/commands/speckit.plan.md` and follow its complete workflow.

### Tasks

Immediately after plan completes, read the file `.claude/commands/speckit.tasks.md` and follow its complete workflow.

### Implement

Immediately after tasks completes, read the file `.claude/commands/speckit.implement.md` and follow its complete workflow.

Report: `[6/7] Plan → Tasks → Implement complete`

## Codex Implementation Review [7/7]

This runs **automatically** after implementation completes.

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
[7/7] Codex Implementation Review

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
- The handoff buttons (Approve / Fix / Reject) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.
