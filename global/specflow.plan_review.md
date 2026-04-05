---
description: Codex plan/tasks review を実行し、結果に基づいて次のアクションを選択
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
     2. `/specflow.plan_review` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.plan_review` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`, `FEATURE_DIR`, and `BRANCH`.

Derive the plan and tasks file paths:
```
SPEC_DIR = dirname of FEATURE_SPEC
PLAN_FILE = SPEC_DIR/plan.md
TASKS_FILE = SPEC_DIR/tasks.md
```

Verify that `PLAN_FILE` and `TASKS_FILE` exist (via Read tool). If either file does not exist, display an error: `"plan.md または tasks.md が見つかりません。先に /specflow.plan を実行してください。"` → **STOP**.

Read all three files: `FEATURE_SPEC`, `PLAN_FILE`, `TASKS_FILE`.

## Step 1: Codex Plan/Tasks Review

Read `~/.config/specflow/global/review_plan_prompt.md` for the review prompt. If the file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_plan_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**.

Call the `codex` MCP server tool to review the plan and tasks. Pass the following as the prompt:

```
<review_plan_prompt.md の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>

PLAN CONTENT:
<PLAN_FILE の内容>

TASKS CONTENT:
<TASKS_FILE の内容>
```

Parse the response as JSON.

## Step 2: Present Review

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

**IMPORTANT:** Do NOT present next-action choices as text. 必ず `AskUserQuestion` のボタン UI を使うこと。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- If any tool call fails, report the error and ask the user how to proceed.
