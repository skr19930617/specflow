---
description: specflow で Plan → Tasks を作成し、Codex でレビュー
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls openspec/config.yaml` via Bash to confirm OpenSpec is initialized.
   - If missing:
     ```
     ❌ `openspec/config.yaml` が見つかりません。

     次のステップで初期化してください:
     1. `openspec/config.yaml` を作成
     2. `/specflow.plan` を再度実行
     ```
     → **STOP**.
2. Determine the current change id from the branch name. Set `CHANGE_ID` accordingly. All artifacts are read from and written to `openspec/changes/<CHANGE_ID>/`.

## Step 1: Plan

Read `openspec/changes/<CHANGE_ID>/proposal.md` and create the implementation plan:
1. Research unknowns and write `openspec/changes/<CHANGE_ID>/research.md`.
2. Design data models and contracts.
3. Generate the implementation plan at `openspec/changes/<CHANGE_ID>/plan.md`.

Report: `Step 1 complete — Plan created`

## Step 2: Tasks

Immediately after plan completes, generate tasks from the plan and proposal:
1. Read `openspec/changes/<CHANGE_ID>/plan.md` and `openspec/changes/<CHANGE_ID>/proposal.md`.
2. Generate dependency-ordered tasks with phases, priorities, and parallel markers.
3. Write `openspec/changes/<CHANGE_ID>/tasks.md`.

Report: `Step 2 complete — Tasks created`

## Step 3: Codex Plan/Tasks Review

Read the file `global/specflow.plan_review.md` and follow its complete workflow.

This will:
- Read the review prompt and `openspec/changes/<CHANGE_ID>/` artifacts (proposal, plan, tasks)
- Call Codex MCP to review the plan and tasks
- Present the review results
- Show handoff options (実装に進む / Plan を修正 / 中止)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, research, plan, tasks) are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
