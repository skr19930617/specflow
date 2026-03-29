---
description: レビュー指摘を修正し、再度 Codex review を実行
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

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt further fixes based on the re-review results.
- Do NOT start another fix cycle automatically.
- Do NOT run any additional commands after presenting results.
- Do NOT suggest next steps or describe what buttons will appear.
- Your response MUST end after the review table and summary.
- The handoff buttons (Approve / Fix All / Reject) will appear AUTOMATICALLY and allow the user to choose whether to fix again, approve, or reject.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.
