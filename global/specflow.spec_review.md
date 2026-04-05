---
description: Codex spec review を実行し、結果に基づいて次のアクションを選択
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
     2. `/specflow.spec_review` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.spec_review` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`, `FEATURE_DIR`, and `BRANCH`.

Verify that `FEATURE_SPEC` exists (via Read tool). If the file does not exist, display an error: `"spec.md が見つかりません。先に /specflow または /speckit.specify を実行してください。"` → **STOP**.

## Step 1: Codex Spec Review

Read `~/.config/specflow/global/review_spec_prompt.md` for the review prompt. If the file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_spec_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**.
Read the current `FEATURE_SPEC` file.

Read the issue body from `/tmp/specflow-issue.json` if available (skip silently if not found).

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.md の内容>

ISSUE BODY:
<issue body の内容（available な場合。なければ "(not available)" と記載）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON (the review prompt instructs the model to return strict JSON with `decision`, `questions`, and `summary` fields).

## Step 2: Present Review

Present the review:
```
Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
| Q2 | medium | ... | ... | ... |
```

Report the review results.

## Handoff: 次のアクション選択

レビュー結果を表示した後、必ず `AskUserQuestion` ツールを使って次のアクションを選択させる。

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "Plan に進む"
      description: "Plan → Tasks を作成しレビュー"
    - label: "Spec を修正"
      description: "レビュー指摘に基づいて Spec を修正し再レビュー"
    - label: "中止"
      description: "変更を破棄して終了"
```

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「Plan に進む」 → `Skill(skill: "specflow.plan")`
- 「Spec を修正」 → `Skill(skill: "specflow.spec_fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text. 必ず `AskUserQuestion` のボタン UI を使うこと。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- If any tool call fails, report the error and ask the user how to proceed.
