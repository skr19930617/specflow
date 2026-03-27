---
description: GitHub issue から spec → clarify → Codex review → plan → implement → Codex review のワークフローを実行 (speckit 前提)
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

Before starting, verify the project is initialized:

1. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing: "`.specflow/config.env` が見つかりません。先に `specflow-init` を実行してください。" → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing: "speckit が見つかりません。speckit をインストールしてから再度実行してください。" → **STOP**.
3. Run `source .specflow/config.env` via Bash to load project config.

## Step 0: Setup

1. **Determine the issue URL:**
   - If `$ARGUMENTS` is non-empty and looks like a URL (contains `github` and `/issues/`), use it as the issue URL.
   - If `$ARGUMENTS` is empty or not a valid issue URL, ask the user: "GitHub issue URL を入力してください (例: `https://github.com/OWNER/REPO/issues/123`)" and **wait for their response**.
   - Validate the URL matches the pattern `https://<HOST>/<OWNER>/<REPO>/issues/<NUMBER>`. If invalid, ask the user to correct it.

2. **Create the state directory** via Bash:
   ```bash
   timestamp=$(date +%Y%m%d-%H%M%S)
   run_dir=".specflow/state/$timestamp"
   mkdir -p "$run_dir"
   echo "$run_dir"
   ```
   Remember the `run_dir` path for all subsequent steps (used for Codex review artifacts).

## Step 1: Fetch Issue [1/7]

Run via Bash:
```bash
specflow-fetch-issue "<ISSUE_URL>" > "<run_dir>/issue.json"
```

Read `<run_dir>/issue.json` and extract: title, body, url, number, state, author login, label names.

Report to the user:
```
[1/7] Issue fetched: #<number> — <title>
Author: <author> | State: <state> | Labels: <labels>
```

Show a brief summary of the issue body.

## Step 2: Create Spec via speckit [2/7]

Read the file `.claude/commands/speckit.specify.md` and follow its complete workflow, using the issue title and body as the feature description input.

This will:
- Create a feature branch
- Generate a spec file in the speckit directory structure (e.g., `specs/<number>-<short-name>/spec.md`)
- Run quality validation

Remember the `FEATURE_SPEC` path output by speckit — this is the spec file for all subsequent steps.

Report: `[2/7] Spec created via speckit.specify`

## Step 3: Clarify — 1st Round (human) [3/7]

Read the file `.claude/commands/speckit.clarify.md` and follow its complete workflow.

This will:
- Scan the spec for ambiguity across all taxonomy categories
- Ask the user up to 5 clarification questions **one at a time**
- The user answers each question interactively
- Integrate answers back into the spec file

Report: `[3/7] Clarify 1st round complete`

## Step 4: Codex Spec Review [4/7]

Check if `codex` is available:
```bash
command -v codex
```
If not found, inform the user that `codex` is not in PATH and offer to skip this step. If skipping, proceed directly to Step 6 (plan).

If `codex` is available:

Read `.specflow/review_spec_prompt.txt` for the review prompt.
Read the current `FEATURE_SPEC` file.

**Note:** `codex exec` は API 呼び出しを含むため、完了まで数分かかる場合があります。ユーザーに "Codex review を実行中です。数分かかる場合があります..." と伝えてから実行してください。

Step 1 — 入力ファイルを準備:
```bash
cat .specflow/review_spec_prompt.txt > "<run_dir>/spec-review-input.txt" && echo "" >> "<run_dir>/spec-review-input.txt" && echo "SPEC CONTENT:" >> "<run_dir>/spec-review-input.txt" && cat "<FEATURE_SPEC>" >> "<run_dir>/spec-review-input.txt"
```

Step 2 — Codex を実行 (Bash の `timeout` を 600000ms に設定、`run_in_background: true` で実行):
```bash
cat "<run_dir>/spec-review-input.txt" | codex exec --json > "<run_dir>/spec-review.jsonl" 2>&1 && specflow-parse-jsonl.py "<run_dir>/spec-review.jsonl" > "<run_dir>/spec-review.json"
```

Step 2 の完了通知を受け取ったら、`<run_dir>/spec-review.json` を Read で読み取る。

Present the review to the user:

```
[4/7] Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
| Q2 | medium | ... | ... | ... |
```

If decision is **APPROVE**: report "Spec approved by Codex" and proceed to Step 6.

If decision is **REQUEST_CHANGES** or **BLOCK**: proceed to Step 5.

## Step 5: Clarify — 2nd Round (Codex findings + human) [5/7]

Present the Codex review findings as additional context, then read the file `.claude/commands/speckit.clarify.md` and follow its workflow again.

When scanning the spec for ambiguity, **prioritize the Codex findings** as high-priority items to address. Include them in the clarification questions posed to the user.

After the user has answered all clarification questions and the spec is updated, present the choice to the user. **Do not proceed automatically — wait for the user to select an option.**

The user must choose one:
- **plan** — Codex review の結果に満足。plan 作成に進む
- **re-review** — もう一度 Codex review を実行する (Step 4 に戻る)

**Wait for the user's selection before proceeding.**

- If **plan**: proceed to Step 6.
- If **re-review**: go back to Step 4.

## Step 6: Plan → Tasks → Implement (auto) [6/7]

This step runs **automatically without user intervention** between sub-steps.

### 6a: Plan

Read the file `.claude/commands/speckit.plan.md` and follow its complete workflow.

This will:
- Run `setup-plan.sh` to prepare plan structure
- Generate research.md, data-model.md, contracts, and other plan artifacts
- Fill the implementation plan

### 6b: Tasks

Immediately after plan completes, read the file `.claude/commands/speckit.tasks.md` and follow its complete workflow.

This will:
- Generate dependency-ordered `tasks.md` from the plan artifacts

### 6c: Implement

Immediately after tasks completes, read the file `.claude/commands/speckit.implement.md` and follow its complete workflow.

This will:
- Execute all tasks phase by phase
- Create/modify source files as specified

Report: `[6/7] Plan → Tasks → Implement complete`

## Step 7: Codex Implementation Review [7/7]

This step runs **automatically** after implementation completes.

Check if `codex` is available:
```bash
command -v codex
```
If not found, skip to the approval menu below (without review findings).

If `codex` is available:

Read `.specflow/review_impl_prompt.txt` for the review prompt.
Read the `FEATURE_SPEC` file.

**Note:** `codex exec` は API 呼び出しを含むため、完了まで数分かかる場合があります。ユーザーに "Codex implementation review を実行中です。数分かかる場合があります..." と伝えてから実行してください。

Step 1 — 入力ファイルを準備:
```bash
cat .specflow/review_impl_prompt.txt > "<run_dir>/impl-review-input.txt" && echo "" >> "<run_dir>/impl-review-input.txt" && echo "CURRENT GIT DIFF:" >> "<run_dir>/impl-review-input.txt" && git diff -- . ':(exclude).specflow' ':(exclude).specify' >> "<run_dir>/impl-review-input.txt" && echo "" >> "<run_dir>/impl-review-input.txt" && echo "SPEC CONTENT:" >> "<run_dir>/impl-review-input.txt" && cat "<FEATURE_SPEC>" >> "<run_dir>/impl-review-input.txt"
```

Step 2 — Codex を実行 (Bash の `timeout` を 600000ms に設定、`run_in_background: true` で実行):
```bash
cat "<run_dir>/impl-review-input.txt" | codex exec --json > "<run_dir>/impl-review.jsonl" 2>&1 && specflow-parse-jsonl.py "<run_dir>/impl-review.jsonl" > "<run_dir>/impl-review.json"
```

Step 2 の完了通知を受け取ったら、`<run_dir>/impl-review.json` を Read で読み取る。

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

Then the user must choose one. **Do not proceed automatically — wait for the user to select an option.**

- **approve** — 実装を承認して終了
- **fix F1 F3** — 指定した指摘のみ修正 (例: `fix F1 F3`)
- **fix all** — すべての指摘を修正
- **reject** — 実装を破棄して終了
- **change-spec** — spec を修正して Step 3 からやり直す

**Wait for the user's selection before proceeding.**

Handle each choice:
- **approve**: Report "Implementation approved." and **END**.
- **fix** / **fix all**: Apply the specified fixes, then re-run Step 7 (Codex review loop).
- **reject**: Report "Implementation rejected." and **END**.
- **change-spec**: Go back to Step 3 (clarify 1st round) to revise the spec.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` except under the `state/` subdirectory.
- Codex review artifacts (issue.json, *-review.jsonl, *-review.json) go into `<run_dir>`.
- Spec, plan, tasks, and implementation files are managed by speckit in `.specify/` and `specs/` directories.
- If any Bash command fails, report the error to the user and ask how to proceed. Do NOT silently continue.
- At choice points (Step 5 and Step 7), truly **wait** for the user to make a selection. Do not proceed automatically.
- When reading speckit command files, follow their instructions faithfully, including running their prerequisite scripts.
