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

### Clarify Override: AskUserQuestion でボタン表示

Present the review findings as additional context, then read the file `.claude/commands/speckit.clarify.md` and follow its workflow, **but apply these overrides** for ALL user-facing questions:

- **選択式の質問:** マークダウンテーブルで選択肢を並べて「A/B/C で回答してください」と書く代わりに、`AskUserQuestion` ツールを使う。各選択肢をボタンオプションとして渡す。推奨オプションとその理由を質問テキストに含める。自由回答が適切な場合は「その他（短い回答）」をオプションに追加する。
- **自由回答の質問:** `AskUserQuestion` ツールで質問を提示する（ボタンなし、フリーテキスト入力）。提案する回答を質問テキストに含める。
- マークダウンの選択肢テーブルは **表示しない**。「A/B/C で回答してください」とは **書かない**。

**Prioritize the review findings** as high-priority items in the clarification questions.

After clarification is complete, report the summary and **IMMEDIATELY END YOUR RESPONSE**.

**CRITICAL:** Do NOT suggest next steps. Do NOT present choices as text. Do NOT continue with any further actions. The handoff buttons will appear automatically after you end.
