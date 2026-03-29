---
description: Plan/Tasks のレビュー指摘を修正し、再度 Codex review を実行
handoffs:
  - label: 実装に進む
    agent: specflow.impl
    prompt: 実装を実行
  - label: Plan を修正
    agent: specflow.plan_fix
    prompt: Plan/Tasks のレビュー指摘を再修正
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

## Setup

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

## Step 1: Apply Plan/Tasks Fixes

Based on the review findings from the previous step (the user has just seen them), apply fixes to address all findings:
- Completeness gaps (missing acceptance criteria coverage)
- Ordering issues (incorrect task dependencies)
- Granularity problems (tasks too large or too small)
- Feasibility concerns (technically unsound approaches)
- Scope violations (unnecessary work)
- Consistency issues (tasks not matching plan design decisions)

Update `PLAN_FILE` and/or `TASKS_FILE` as needed. If a finding requires fundamental restructuring, re-run the relevant speckit command (speckit.plan or speckit.tasks).

Report what was fixed.

## Step 2: Re-run Codex Plan/Tasks Review

Read `.specflow/review_plan_prompt.txt` for the review prompt.
Read the updated `FEATURE_SPEC`, `PLAN_FILE`, and `TASKS_FILE`.

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
Codex Plan/Tasks Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Category | Title | Detail |
|---|----------|----------|-------|--------|
| P1 | high | completeness | ... | ... |
```

Report the review results.

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt further fixes based on the re-review results.
- Do NOT start another fix cycle automatically.
- Do NOT run any additional commands after presenting results.
- Do NOT suggest next steps or describe what buttons will appear.
- Your response MUST end after the review table and summary.
- The handoff buttons (実装に進む / Plan を修正 / 中止) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.
