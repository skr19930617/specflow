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

Use the orchestrator to discover the next ready artifact, then generate its content.

### Artifact Loop

Repeat the following until all `applyRequires` artifacts are complete:

1. Run the orchestrator:
   ```bash
   specflow-design-artifacts next <CHANGE_ID>
   ```

2. Capture stdout as `ARTIFACT_JSON`. Parse as JSON.

3. Handle result by `ARTIFACT_JSON.status`:

   **`"complete"`** — All required artifacts are done. Exit the loop and proceed to Step 3.

   **`"ready"`** — An artifact is ready for generation:
   - `ARTIFACT_JSON.artifactId`: the artifact to create
   - `ARTIFACT_JSON.outputPath`: where to write the file
   - `ARTIFACT_JSON.template`: structure template
   - `ARTIFACT_JSON.instruction`: generation instructions
   - `ARTIFACT_JSON.dependencies`: list of `{id, path, done}` dependency artifacts

   Actions:
   a. Read each dependency artifact file listed in `ARTIFACT_JSON.dependencies` for context.
   b. Create the artifact file at `ARTIFACT_JSON.outputPath` using `template` as the structure.
   c. Apply `instruction` as constraints when writing the artifact content. Do **NOT** copy `instruction` verbatim into the file.
   d. Report progress: `Created <artifactId>`
   e. Continue the loop (call `next` again to get the next artifact).

   **`"blocked"`** — No artifacts are ready and none are complete:
   - `ARTIFACT_JSON.blocked`: array of blocked artifact IDs
   - Report which artifacts are blocked and ask the user how to proceed.
   - If the user cannot resolve, **STOP**.

   **`"error"`** — The orchestrator encountered an error:
   - Display `ARTIFACT_JSON.error` and **STOP**.

## Step 3: Verify Completion

Run:
```bash
openspec status --change "<CHANGE_ID>" --json
```

Verify that every artifact listed in `applyRequires` has `status: "done"`.
If any are incomplete, report which artifacts are missing and ask the user how to proceed.

## Step 4: Validate

Run the orchestrator:
```bash
specflow-design-artifacts validate <CHANGE_ID>
```

Capture stdout as `VALIDATE_JSON`. Parse as JSON.

Handle result by `VALIDATE_JSON.status`:

**`"valid"`** — Validation passed. Report success and continue to Step 5.

**`"invalid"`** — Validation found issues. Present the validation results to the user. Let the user decide whether to fix them or continue.

**`"error"`** — Display `VALIDATE_JSON.error` and **STOP**.

## Step 5: Codex Design Review

Invoke the design review workflow:

```
Skill(skill: "specflow.review_design")
```

This will:
- Call `specflow-review-design review <CHANGE_ID>` via Bash
- Handle ledger recovery if needed
- Present the review results
- Show handoff options (実装に進む / Auto-fix / 手動修正 / Reject)

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
- Artifact generation (Step 2) is driven by calling `specflow-design-artifacts next` in a loop. The LLM generates artifact content; the orchestrator manages the dependency graph and readiness.
- Validation (Step 4) is delegated to `specflow-design-artifacts validate`.
