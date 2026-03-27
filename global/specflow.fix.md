---
description: Codex の指摘を修正し、再度 Codex review を実行
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

## Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`. Read the spec file.

Create a temp directory:
```bash
mktemp -d /tmp/specflow.XXXXXX
```
Remember the output path as `<tmpdir>`.

## Apply Fixes

Read the current `git diff` to understand the implementation state:
```bash
git diff -- . ':(exclude).specflow' ':(exclude).specify'
```

Read the spec file for acceptance criteria context.

Based on the Codex review findings from the previous step (the user has just seen them), apply fixes to address all findings:
- Correctness issues
- Completeness gaps
- Quality problems
- Scope violations

Report what was fixed.

## Re-run Codex Implementation Review

Check if `codex` is available:
```bash
command -v codex
```
If not found, report "Codex not found — skipping re-review." and **END**.

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
Codex Implementation Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
```

Report the review results and **END**. The handoff buttons will let the user choose the next action.
