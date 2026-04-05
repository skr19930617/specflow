---
description: speckit で Plan → Tasks を作成し、Codex でレビュー
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing:
     ```
     ❌ speckit が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow.plan` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.plan` を再度実行
     ```
     → **STOP**.
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

Read the file `global/specflow.plan_review.md` and follow its complete workflow.

This will:
- Read the review prompt, spec, plan, and tasks files
- Call Codex MCP to review the plan and tasks
- Present the review results
- Show handoff options (実装に進む / Plan を修正 / 中止)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- Spec, plan, tasks are managed by speckit in `.specify/` and `specs/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading speckit command files, follow their instructions faithfully.
