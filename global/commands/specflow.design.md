---
description: specflow で Design artifacts を生成し、Codex でレビュー
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.
   - If missing:
     ```
     ❌ `openspec/` ディレクトリが見つかりません。

     次のステップで初期化してください:
     1. `openspec/config.yaml` を作成
     2. `/specflow.design` を再度実行
     ```
     → **STOP**.
2. Determine the current change id from the branch name. Set `CHANGE_ID` accordingly. All artifacts are read from and written to `openspec/changes/<CHANGE_ID>/`.

## Step 1: Check Status

Run:
```bash
openspec status --change "<CHANGE_ID>" --json
```

Parse the JSON output to get:
- `applyRequires`: array of artifact IDs needed before implementation
- `artifacts`: list with status and dependencies

If the command fails, report the error and **STOP**.

## Step 2: Generate Artifacts in Dependency Order

Loop through artifacts that are `ready` (all dependencies satisfied):

For each ready artifact:
1. Run:
   ```bash
   openspec instructions <artifact-id> --change "<CHANGE_ID>" --json
   ```
2. Read any dependency artifacts referenced in the instructions for context.
3. Create the artifact file using `template` from the instructions as the structure.
4. Apply `context` and `rules` from the instructions as constraints when writing the artifact content. Do **NOT** copy `context` or `rules` verbatim into the file.
5. Report progress: `Created <artifact-id>`

After each artifact is created, re-run:
```bash
openspec status --change "<CHANGE_ID>" --json
```
to refresh which artifacts are now `ready`.

Continue until all `applyRequires` artifacts are complete.

## Step 3: Verify Completion

Run:
```bash
openspec status --change "<CHANGE_ID>" --json
```

Verify that every artifact listed in `applyRequires` has `status: "done"`.
If any are incomplete, report which artifacts are missing and ask the user how to proceed.

## Step 4: Validate

Run:
```bash
openspec validate "<CHANGE_ID>" --type change --json
```

Present validation results to the user.
If issues are found, let the user decide whether to fix them or continue.

## Step 5: Codex Design Review

Read the file `global/specflow.review_design.md` and follow its complete workflow.

This will:
- Read the review prompt and `openspec/changes/<CHANGE_ID>/` artifacts
- Call Codex MCP to review the design artifacts
- Present the review results
- Show handoff options (実装に進む / Design を修正 / 中止)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
