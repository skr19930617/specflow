---
description: GitHub issue から spec → review → plan → implement → review のワークフローを実行
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

Before starting, verify the project is initialized:

1. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing, tell the user: "`.specflow/config.env` が見つかりません。先に `specflow-init` を実行してください。" and **STOP**.
2. Run `source .specflow/config.env` via Bash to load project config.

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
   Remember the `run_dir` path for all subsequent steps.

## Step 1: Fetch Issue [1/8]

Run via Bash:
```bash
specflow-fetch-issue "<ISSUE_URL>" > "<run_dir>/issue.json"
```

Read `<run_dir>/issue.json` and extract: title, body, url, number, state, author login, label names.

Report to the user:
```
[1/8] Issue fetched: #<number> — <title>
Author: <author> | State: <state> | Labels: <labels>
```

Show the issue body summary (first few lines or key points).

## Step 2: Build Spec [2/8]

Create `<run_dir>/spec.md` with this structure:

```markdown
# Spec Seed from GitHub Issue

- Source URL: <url>
- Issue Number: <number>
- Title: <title>
- Author: <author>
- State: <state>
- Labels: <labels>

## Original Issue Body

<full body content from issue>

## Clarification Notes

<!-- To be refined -->

## Acceptance Criteria

<!-- To be refined -->
```

Write this file to `<run_dir>/spec.md` using the Write tool.

Report: `[2/8] Spec seed created`

## Step 3: Clarify Spec [3/8]

Read the spec from `<run_dir>/spec.md`. Improve it by:
- Identifying missing assumptions and making them explicit
- Tightening ambiguous language
- Expanding the **Clarification Notes** section with inferred decisions
- Expanding the **Acceptance Criteria** section with concrete, testable criteria

Update `<run_dir>/spec.md` with the refined version.

Report: `[3/8] Spec clarified`

Then show a summary of what was clarified/added, and present options to the user:

> **Spec の clarify が完了しました。** 次のアクションを選んでください:
> - **continue** — Codex spec review に進む
> - **skip-review** — Codex review をスキップして plan に進む
> - または自由にフィードバックを入力 (spec をさらに修正します)

**Wait for user response.** If they provide feedback, refine the spec and ask again. If they say "continue" or "skip-review", proceed accordingly.

## Step 4: Codex Spec Review [4/8]

(Skip this step if the user chose "skip-review" in Step 3.)

First, check if `codex` is available:
```bash
command -v codex
```
If not found, inform the user that `codex` is not in PATH and offer to skip the review. If user agrees, proceed to Step 6.

If `codex` is available, run via Bash:
```bash
{ cat .specflow/review_spec_prompt.txt; echo; echo "SPEC CONTENT:"; cat "<run_dir>/spec.md"; } | codex exec --json > "<run_dir>/spec-review.jsonl" && specflow-parse-jsonl.py "<run_dir>/spec-review.jsonl" > "<run_dir>/spec-review.json"
```

Read `<run_dir>/spec-review.json` and parse the JSON.

Present the review to the user in a formatted way:

```
[4/8] Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Title | Detail | Suggested Resolution |
|---|----------|-------|--------|---------------------|
| Q1 | high | ... | ... | ... |
| Q2 | medium | ... | ... | ... |
```

- If decision is **APPROVE**: report "Spec approved by Codex" and proceed to Step 6 (skip Step 5).
- If decision is **REQUEST_CHANGES** or **BLOCK**: proceed to Step 5.

## Step 5: Resolve Spec Findings [5/8]

For each finding from the Codex review:
1. Address the concern by updating the relevant section of the spec
2. Preserve the original issue's intent

Update `<run_dir>/spec.md` with the resolved spec.

Present the changes to the user:

> **[5/8] Spec の指摘を解決しました:**
> - Q1 (high): <how it was resolved>
> - Q2 (medium): <how it was resolved>
>
> 次のアクションを選んでください:
> - **continue** — plan 作成に進む
> - またはフィードバックを入力

**Wait for user input** before proceeding.

## Step 6: Plan and Tasks [6/8]

Read `<run_dir>/spec.md` for the finalized spec.

**Check for speckit** via Bash:
```bash
ls .specify/scripts/bash/setup-plan.sh 2>/dev/null && echo "SPECKIT_FOUND" || echo "SPECKIT_NOT_FOUND"
```

**If speckit is found:**
- Ask the user: "このプロジェクトには speckit がインストールされています。planning に speckit を使いますか? (yes = `/speckit.plan` + `/speckit.tasks` を使用, no = 組み込みの planning を使用)"
- If yes: Tell the user to run `/speckit.plan` followed by `/speckit.tasks`, then come back and type **continue** to proceed to Step 7. **STOP here and wait.**
- If no: Use built-in planning below.

**Built-in specflow planning** (or if speckit not found):

Read the project's `CLAUDE.md` (if present) for tech stack context.

Generate `<run_dir>/plan.md` containing:
- Technical approach
- Architecture decisions
- File changes needed
- Dependencies / libraries
- Risk areas

Generate `<run_dir>/tasks.md` containing:
- Ordered, dependency-aware task list
- Each task: ID (T001, T002...), description, target files
- Phases: Setup → Core → Integration → Polish

Write both files and report:
```
[6/8] Plan and tasks generated
- Plan: <run_dir>/plan.md
- Tasks: <run_dir>/tasks.md (<N> tasks)
```

Present plan and tasks to the user, then:

> 次のアクションを選んでください:
> - **continue** — 実装を開始
> - **stop** — ここで一旦停止
> - またはフィードバックを入力 (plan/tasks を修正します)

**Wait for user response.**

## Step 7: Implement [7/8]

Read `<run_dir>/tasks.md`, `<run_dir>/plan.md`, and `<run_dir>/spec.md`.

Execute tasks phase by phase:
- Implement changes as specified in the tasks
- After completing each task, update `<run_dir>/tasks.md` marking it as done (`- [x]`)
- Report progress after each phase

When all tasks are complete:
```
[7/8] Implementation complete
- <N> tasks completed
- Files changed: <list of modified/created files>
```

## Step 8: Codex Implementation Review [8/8]

First, check if `codex` is available:
```bash
command -v codex
```
If not found, inform the user and offer to skip. If skipping, go straight to the approval menu below (without review findings).

If `codex` is available, run via Bash:
```bash
{ cat .specflow/review_impl_prompt.txt; echo; echo "CURRENT GIT DIFF:"; git diff -- . ':(exclude).specflow'; echo; echo "SPEC CONTENT:"; cat "<run_dir>/spec.md"; } | codex exec --json > "<run_dir>/impl-review.jsonl" && specflow-parse-jsonl.py "<run_dir>/impl-review.jsonl" > "<run_dir>/impl-review.json"
```

Read `<run_dir>/impl-review.json` and parse the JSON.

Present the review:

```
[8/8] Codex Implementation Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
| F2 | medium | src/bar.ts | ... | ... |
```

Then present the interactive menu:

> 次のアクションを選んでください:
> 1. **approve** — 実装を承認
> 2. **fix F1 F3** — 指定した指摘のみ修正 (例: `fix F1 F3`)
> 3. **fix all** — すべての指摘を修正
> 4. **reject** — 実装を破棄
> 5. **change-spec** — spec を修正して Step 3 からやり直す
> - または自由にインストラクションを入力

**Wait for user response.** Handle each choice:

- **approve**: Report "Implementation approved. Run dir: `<run_dir>`" and **END**.
- **fix** / **fix all**: Apply the specified fixes, then re-run Step 8 (loop).
- **reject**: Report "Implementation rejected." and **END**.
- **change-spec**: Ask the user for spec changes, update `<run_dir>/spec.md`, then go back to Step 3.
- **free-form text**: Treat as instructions, apply them, then re-run Step 8.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` except under the `state/` subdirectory.
- All intermediate artifacts (issue.json, spec.md, plan.md, tasks.md, review files) go into `<run_dir>`.
- If any Bash command fails, report the error to the user and ask how to proceed. Do NOT silently continue.
- `.specflow/state/` is gitignored — treat artifacts there as ephemeral working files.
- At every step where user input is requested, truly **wait** for the user's response. Do not proceed automatically.
