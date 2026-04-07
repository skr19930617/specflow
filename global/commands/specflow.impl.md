---
description: specflow で実装を実行し、Codex で実装レビュー
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls openspec/config.yaml` via Bash to confirm OpenSpec is initialized.
   - If missing:
     ```
     ❌ `openspec/config.yaml` が見つかりません。

     次のステップで初期化してください:
     1. `openspec/config.yaml` を作成
     2. `/specflow.impl` を再度実行
     ```
     → **STOP**.
2. Read `openspec/config.yaml`. Extract `max_autofix_rounds` if present. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.

## Step 0.5: Read Current Phase Context

1. Determine `CHANGE_ID`:
   - If `$ARGUMENTS` contains a change id, use it.
   - Otherwise, derive from the current branch name or prompt the user.
2. Verify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.
3. Check if `openspec/changes/<CHANGE_ID>/current-phase.md` exists (via Read tool — if not found, proceed silently).
4. If the file exists: read it and display as a summary block:
   ```
   Current Phase Context:
   <contents of current-phase.md>
   ```
5. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."

## Step 1: Implement

Execute the implementation using `openspec/changes/<CHANGE_ID>/` artifacts:
1. Load `openspec/changes/<CHANGE_ID>/tasks.md` and `openspec/changes/<CHANGE_ID>/plan.md`.
2. Execute tasks phase-by-phase.
3. Mark completed tasks in `openspec/changes/<CHANGE_ID>/tasks.md`.
4. Validate implementation against `openspec/changes/<CHANGE_ID>/proposal.md`.

Report: `Step 1 complete — Implementation done`

## Step 2: Codex Implementation Review + Handoff

Read the file `global/specflow.impl_review.md` and follow its complete workflow.

This will:
- Read the review prompt, `openspec/changes/<CHANGE_ID>/proposal.md`, and git diff
- Call Codex MCP to review the implementation
- Update the review-ledger.json (finding matching, round tracking)
- Generate `openspec/changes/<CHANGE_ID>/current-phase.md`
- Present the review results
- Run auto-fix loop if unresolved high findings exist
- Show handoff options (Approve / Fix / Reject)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, plan, tasks, current-phase, review-ledger) are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
