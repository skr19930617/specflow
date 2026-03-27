---
description: Codex spec review を再実行し、clarify 2nd round を行う
handoffs:
  - label: Plan に進む
    agent: specflow.build
    prompt: Plan → Tasks → Implement を実行
  - label: もう一度 Codex Review
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

Create a temp directory:
```bash
mktemp -d /tmp/specflow.XXXXXX
```
Remember the output path as `<tmpdir>`.

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`.

## Codex Spec Review

Check if `codex` is available:
```bash
command -v codex
```
If not found, report "Codex not found — skipping." and **END**.

Read `.specflow/review_spec_prompt.txt` and `FEATURE_SPEC`.

ユーザーに "Codex review を実行中です。数分かかる場合があります..." と伝えてから実行。

Step 1 — 入力ファイルを準備:
```bash
cat .specflow/review_spec_prompt.txt > "<tmpdir>/spec-review-input.txt" && echo "" >> "<tmpdir>/spec-review-input.txt" && echo "SPEC CONTENT:" >> "<tmpdir>/spec-review-input.txt" && cat "<FEATURE_SPEC>" >> "<tmpdir>/spec-review-input.txt"
```

Step 2 — Codex を実行 (Bash の `timeout` を 600000ms に設定、`run_in_background: true` で実行):
```bash
cat "<tmpdir>/spec-review-input.txt" | codex exec --json > "<tmpdir>/spec-review.jsonl" 2>&1 && specflow-parse-jsonl.py "<tmpdir>/spec-review.jsonl" > "<tmpdir>/spec-review.json"
```

完了通知を受け取ったら `<tmpdir>/spec-review.json` を Read で読み取る。

Present the review:
```
Codex Spec Review (re-run)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
```

If **APPROVE**: report "Spec approved by Codex" and **END**.

If **REQUEST_CHANGES** or **BLOCK**: proceed to Clarify below.

## Clarify — 2nd Round (Codex findings + human)

Present the Codex review findings as additional context, then read the file `.claude/commands/speckit.clarify.md` and follow its workflow.

**Prioritize the Codex findings** as high-priority items in the clarification questions.

After clarification is complete, report the summary and **END**. The handoff buttons will let the user choose the next step.
