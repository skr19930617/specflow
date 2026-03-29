---
description: レビュー指摘を修正し、再度 Codex review を実行
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
Parse the JSON output to get `FEATURE_SPEC`. Read the spec file.

## Apply Fixes

Read the current `git diff` to understand the implementation state:
```bash
git diff -- . ':(exclude).specflow' ':(exclude).specify'
```

Read the spec file for acceptance criteria context.

Based on the review findings from the previous step (the user has just seen them), apply fixes to address all findings:
- Correctness issues
- Completeness gaps
- Quality problems
- Scope violations

Report what was fixed.

## Re-run Codex Implementation Review

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
Codex Implementation Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
```

Report the review results.

## Handoff: 次のアクション選択

レビュー結果を表示した後、必ず `AskUserQuestion` ツールを使って次のアクションを選択させる。

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "Approve & Commit"
      description: "実装を承認してコミット・PR 作成"
    - label: "Fix All"
      description: "指摘をすべて再修正して再レビュー"
    - label: "Reject"
      description: "全変更を破棄して終了"
```

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「Approve & Commit」 → `Skill(skill: "specflow.approve")`
- 「Fix All」 → `Skill(skill: "specflow.fix")`
- 「Reject」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text.必ず `AskUserQuestion` のボタン UI を使うこと。
