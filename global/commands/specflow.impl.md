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
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.impl` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.
4. Read `SPECFLOW_MAX_AUTOFIX_ROUNDS` from the sourced config. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.

## Step 0.5: Read Current Phase Context

1. Resolve `FEATURE_DIR` from the current change id:
   - If `$ARGUMENTS` contains a change id, set `FEATURE_DIR=openspec/changes/<id>`.
   - Otherwise, detect the active change from the current branch name or prompt the user.
2. Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.
3. Check if `FEATURE_DIR/current-phase.md` exists (via Read tool — if not found, proceed silently).
4. If the file exists: read it and display as a summary block:
   ```
   Current Phase Context:
   <contents of current-phase.md>
   ```
5. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."

## Step 1: Implement

Read the file `.claude/commands/specflow.implement.md` and follow its complete workflow.

This will:
- Load tasks.md and plan.md
- Execute tasks phase-by-phase
- Mark completed tasks in tasks.md
- Validate implementation against spec

Report: `Step 1 complete — Implementation done`

## Step 2: Codex Implementation Review + Handoff

Read the file `global/specflow.impl_review.md` and follow its complete workflow.

This will:
- Read the review prompt, spec, and git diff
- Call Codex MCP to review the implementation
- Update the review-ledger.json (finding matching, round tracking)
- Generate current-phase.md
- Present the review results
- Run auto-fix loop if unresolved high findings exist
- Show handoff options (Approve / Fix / Reject)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- Spec, plan, tasks are managed by specflow in `openspec/changes/`.
- If any tool call fails, report the error and ask the user how to proceed.
- When reading specflow command files, follow their instructions faithfully.
