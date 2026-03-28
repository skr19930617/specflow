---
description: Codex spec review を再実行し、clarify 2nd round を行う
handoffs:
  - label: Plan に進む
    agent: specflow.build
    prompt: Plan → Tasks → Implement を実行
  - label: もう一度 Review
    agent: specflow.review
    prompt: Codex spec review を再実行
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

## Codex Spec Review

Read `.specflow/review_spec_prompt.txt` and `FEATURE_SPEC`.

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.txt の内容>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON.

Present the review:
```
Codex Spec Review (re-run)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
```

If **APPROVE**: report "Spec approved" and **END**.

If **REQUEST_CHANGES** or **BLOCK**: proceed to Clarify below.

## Clarify — 2nd Round (review findings + human)

Present the review findings as additional context, then read the file `.claude/commands/speckit.clarify.md` and follow its workflow.

**Prioritize the review findings** as high-priority items in the clarification questions.

After clarification is complete, report the summary and **END**. The handoff buttons will let the user choose the next step.
