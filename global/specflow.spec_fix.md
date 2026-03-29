---
description: Spec のレビュー指摘を修正し、再度 Codex spec review を実行
handoffs:
  - label: Plan に進む
    agent: specflow.plan
    prompt: Plan → Tasks を作成しレビュー
  - label: Spec を修正
    agent: specflow.spec_fix
    prompt: Spec のレビュー指摘を再修正
  - label: 中止
    agent: specflow.reject
    prompt: 変更を破棄
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

Also read the original GitHub issue body if available (check for `/tmp/specflow-issue.json`).

## Step 1: Apply Spec Fixes

Read the current `FEATURE_SPEC` file.

Based on the review findings from the previous step (the user has just seen them), update the spec to address all findings:
- Resolve ambiguities flagged by the review
- Add missing acceptance criteria
- Fix contradictions
- Clarify edge cases

If any finding requires user input to resolve (e.g., a product decision), use `AskUserQuestion` to ask the user directly. Keep questions minimal — only ask when the answer cannot be inferred from the issue or existing spec.

Report what was fixed.

## Step 2: Re-run Codex Spec Review

Read `.specflow/review_spec_prompt.txt` and the updated `FEATURE_SPEC`.

Read the original issue body from `/tmp/specflow-issue.json` if available.

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.txt の内容>

ISSUE BODY:
<issue body の内容（available な場合）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON.

Present the review:
```
Codex Spec Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
```

Report the review results.

## CRITICAL STOP RULES

**You MUST stop here. Do NOT continue beyond this point.**

- Do NOT attempt further fixes based on the re-review results.
- Do NOT start another fix cycle automatically.
- Do NOT run any additional commands after presenting results.
- Do NOT suggest next steps or describe what buttons will appear.
- Your response MUST end after the review table and summary.
- The handoff buttons (Plan に進む / Spec を修正 / 中止) will appear AUTOMATICALLY.

**IMPORTANT:** Do NOT present next-action choices as text. Do NOT suggest commands to run. Simply end your response — the handoff buttons will appear automatically.
