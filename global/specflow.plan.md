---
description: speckit で Plan → Tasks を作成し、Codex でレビュー
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

## Handoff: 次のアクション選択

レビュー結果を表示した後、必ず `AskUserQuestion` ツールを使って次のアクションを選択させる。

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "実装に進む"
      description: "speckit で実装を実行"
    - label: "Plan を修正"
      description: "レビュー指摘に基づいて Plan/Tasks を修正し再レビュー"
    - label: "中止"
      description: "変更を破棄して終了"
```

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「実装に進む」 → `Skill(skill: "specflow.impl")`
- 「Plan を修正」 → `Skill(skill: "specflow.plan_fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text.必ず `AskUserQuestion` のボタン UI を使うこと。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
