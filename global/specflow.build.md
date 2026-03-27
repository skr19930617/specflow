---
description: speckit で Plan → Tasks → Implement を実行し、Codex で実装レビュー
handoffs:
  - label: Approve & Commit
    agent: specflow.approve
    prompt: 実装を承認してコミット・PR 作成
  - label: Fix All
    agent: specflow.fix
    prompt: Codex の指摘をすべて修正
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

## Plan → Tasks → Implement [6/7]

This runs **automatically** without user intervention between sub-steps.

### Plan

Read the file `.claude/commands/speckit.plan.md` and follow its complete workflow.

### Tasks

Immediately after plan completes, read the file `.claude/commands/speckit.tasks.md` and follow its complete workflow.

### Implement

Immediately after tasks completes, read the file `.claude/commands/speckit.implement.md` and follow its complete workflow.

Report: `[6/7] Plan → Tasks → Implement complete`

## Codex Implementation Review [7/7]

This runs **automatically** after implementation completes.

### Setup

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

### Review

Check if `codex` is available:
```bash
command -v codex
```
If not found, report "Codex not found — skipping implementation review." and **END**.

Read `.specflow/review_impl_prompt.txt` and `FEATURE_SPEC`.

ユーザーに "Codex implementation review を実行中です。数分かかる場合があります..." と伝えてから実行。

Step 1 — 入力ファイルを準備:
```bash
cat .specflow/review_impl_prompt.txt > "<tmpdir>/impl-review-input.txt" && echo "" >> "<tmpdir>/impl-review-input.txt" && echo "CURRENT GIT DIFF:" >> "<tmpdir>/impl-review-input.txt" && git diff -- . ':(exclude).specflow' ':(exclude).specify' >> "<tmpdir>/impl-review-input.txt" && echo "" >> "<tmpdir>/impl-review-input.txt" && echo "SPEC CONTENT:" >> "<tmpdir>/impl-review-input.txt" && cat "<FEATURE_SPEC>" >> "<tmpdir>/impl-review-input.txt"
```

Step 2 — Codex を実行 (Bash の `timeout` を 600000ms に設定、`run_in_background: true` で実行):
```bash
cat "<tmpdir>/impl-review-input.txt" | codex exec --json > "<tmpdir>/impl-review.jsonl" 2>&1 && specflow-parse-jsonl.py "<tmpdir>/impl-review.jsonl" > "<tmpdir>/impl-review.json"
```

完了通知を受け取ったら `<tmpdir>/impl-review.json` を Read で読み取る。

Present the review:
```
[7/7] Codex Implementation Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
| F2 | medium | src/bar.ts | ... | ... |
```

Report the review results and **END**. The handoff buttons will let the user choose: "Approve & Commit", "Fix All", or "Reject".
