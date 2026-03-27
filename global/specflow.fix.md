---
description: レビュー指摘を修正し、再度 OpenAI review を実行
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

## Re-run OpenAI Implementation Review

Read `.specflow/review_impl_prompt.txt` and `FEATURE_SPEC`.

Get the current git diff:
```bash
git diff -- . ':(exclude).specflow' ':(exclude).specify'
```

Call the `openai` MCP server tool to review the implementation. Pass the following as the prompt:

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
OpenAI Implementation Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
```

Report the review results and **END**. The handoff buttons will let the user choose the next action.
