---
description: Plan/Tasks のレビュー指摘を修正し、再度 Codex review を実行
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
     2. `/specflow.plan_fix` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.plan_fix` を再度実行
     ```
     → **STOP**.
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

## Handoff: 次のアクション選択

レビュー結果を表示した後、必ず `AskUserQuestion` ツールを使って次のアクションを選択させる。

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "実装に進む"
      description: "speckit で実装を実行"
    - label: "Plan を修正"
      description: "レビュー指摘に基づいて Plan/Tasks を再修正し再レビュー"
    - label: "中止"
      description: "変更を破棄して終了"
```

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「実装に進む」 → `Skill(skill: "specflow.impl")`
- 「Plan を修正」 → `Skill(skill: "specflow.plan_fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text.必ず `AskUserQuestion` のボタン UI を使うこと。
