---
description: speckit で Plan → Tasks を作成し、Codex でレビュー
handoffs:
  - label: 実装に進む
    agent: specflow.impl
    prompt: 実装を実行
  - label: Plan を修正
    agent: specflow.plan_fix
    prompt: Plan/Tasks のレビュー指摘を修正
  - label: 中止
    agent: specflow.reject
    prompt: 変更を破棄
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specflow/config.env` via Bash. If missing → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash. If missing → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Step 1: Plan

Read the file `.claude/commands/speckit.plan.md` and follow its complete workflow.

This will:
- Research unknowns and create research.md
- Design data models and contracts
- Generate the implementation plan (plan.md)

Report: `Step 1 complete — Plan created`

## Step 2: Tasks

Immediately after plan completes, read the file `.claude/commands/speckit.tasks.md` and follow its complete workflow.

This will:
- Generate dependency-ordered tasks from the plan and spec
- Create tasks.md with phases, priorities, and parallel markers

Report: `Step 2 complete — Tasks created`

## Step 3: Codex Plan/Tasks Review

### Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`.

Derive the plan and tasks file paths:
```
SPEC_DIR = dirname of FEATURE_SPEC
PLAN_FILE = SPEC_DIR/plan.md
TASKS_FILE = SPEC_DIR/tasks.md
```

Read all three files: `FEATURE_SPEC`, `PLAN_FILE`, `TASKS_FILE`.

### Review

Read `.specflow/review_plan_prompt.txt` for the review prompt.

Call the `codex` MCP server tool to review the plan and tasks. Pass the following as the prompt:

```
<review_plan_prompt.txt の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>

PLAN CONTENT:
<PLAN_FILE の内容>

TASKS CONTENT:
<TASKS_FILE の内容>
```

Parse the response as JSON.

Present the review:
```
Codex Plan/Tasks Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Category | Title | Detail |
|---|----------|----------|-------|--------|
| P1 | high | completeness | ... | ... |
| P2 | medium | ordering | ... | ... |
```

Report the review results.

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt to fix any issues found in the review.
- Do NOT suggest fixes or apply changes.
- Do NOT run any additional commands after presenting results.
- Do NOT offer to help with the next steps.
- Your response MUST end after the review table and summary.
- The handoff buttons (実装に進む / Plan を修正 / 中止) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
