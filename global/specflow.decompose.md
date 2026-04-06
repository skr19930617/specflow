---
description: specの複雑さを分析し、issue-linked specはGitHub sub-issueに分解、inline specは警告を表示
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing:
     ```
     ❌ speckit が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow.decompose` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.decompose` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Step 1: Read Spec and Determine Mode

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` and parse the JSON output to get `FEATURE_SPEC` and `FEATURE_DIR`.
2. Read the `FEATURE_SPEC` file.
3. Check if `/tmp/specflow-issue.json` exists (via Read tool).
   - **If it exists and contains a valid `url` and `number` field**:
     - **Stale state check**: Extract the issue `number` from the JSON. Find the spec's `**Input**:` line. Check if the Input line starts with a pattern that references the issue as the **primary source** — specifically: `GitHub Issue #<number>` or `Issue #<number>` or contains `issues/<number>` as a URL path segment. Do NOT match bare `#<number>` that could appear inside a quoted title (e.g., `"Follow-up to #39"` should not match issue 39 as the primary source). If the primary source pattern does not match, the JSON is stale from a previous run. Treat as `MODE = inline` and display: `"⚠️ /tmp/specflow-issue.json is stale (issue #<number> is not the primary source in current spec's Input). Treating as inline spec."`. Run `rm -f /tmp/specflow-issue.json` via Bash to clean up.
     - If the issue matches: set `MODE = issue_linked`. Extract `PARENT_ISSUE_NUMBER`, `REPO` (as `owner/repo`), and the issue body.
   - **If it does not exist or is invalid**: set `MODE = inline`.

Note: Parent issue accessibility is validated later in Step 4, after the user confirms the decomposition proposal. This ensures no GitHub API calls are made before the user has a chance to cancel (FR-007).

## Step 2: AI Analysis

Analyze the spec content to identify independent functional areas. Determine one of three outcomes:

**Instructions for analysis:**
Read the spec file and identify logically independent functional areas — groups of requirements that could be implemented and tested separately without depending on each other.

**Outcome (a) — "decompose"**: The spec contains **2 or more** clearly independent functional areas. For each area, produce a structured sub-feature:
- `phase_number`: sequential ordering (1, 2, 3...)
- `title`: short descriptive title
- `description`: scoped description of what this sub-feature covers
- `requirements`: list of FR-IDs from the spec that belong to this sub-feature
- `acceptance_criteria`: list of testable acceptance criteria for this sub-feature
- `phase_total`: total number of sub-features

**Outcome (b) — "no-action"**: The spec is well-scoped — it covers a single functional area or its areas are too tightly coupled to split meaningfully.
→ Report: `"Spec is appropriately scoped. No decomposition needed."` → **STOP**.

**Outcome (c) — "no-clear-split"**: The spec covers multiple topics but they are heavily interconnected, making independent implementation impractical.
→ Report: `"Spec areas are interconnected. Recommend implementing as a single unit."` → **STOP**.

Only outcome (a) proceeds to Step 3.

## Step 3: Present Proposal (Issue-Linked) / Warn (Inline)

### If `MODE = inline`:

If outcome (a) — spec has multiple independent areas:
Display a warning:
```
⚠️ This spec is large and contains multiple independent functional areas:

| # | Area | Requirements |
|---|------|-------------|
| 1 | <area title> | <FR-IDs> |
| 2 | <area title> | <FR-IDs> |

Consider splitting this into separate `/specflow` invocations, one per area.
No GitHub issues will be created (spec was not created from a GitHub issue URL).
```
→ **STOP**.

### If `MODE = issue_linked`:

Generate a `run_timestamp` by running:
```bash
date +%Y%m%d-%H%M%S
```
Store this value — it will be reused for retries.

Present the decomposition proposal using `AskUserQuestion`:

Display:
```
## Decomposition Proposal for Issue #<PARENT_ISSUE_NUMBER>

The spec contains <N> independent functional areas:

| Phase | Title | Requirements | Acceptance Criteria |
|-------|-------|-------------|-------------------|
| 1 | <title> | <FR-IDs> | <criteria summary> |
| 2 | <title> | <FR-IDs> | <criteria summary> |
...
```

Then use `AskUserQuestion` with options:
- **"Confirm — create <N> sub-issues"**: Proceed to Step 4
- **"Cancel"**: Report `"No issues created."` → **STOP**

## Step 4: Validate Parent and Create Sub-Issues

**First, validate the parent issue** (this is the first GitHub API call in the flow — after user confirmation per FR-007):

Run via Bash:
```bash
gh issue view <PARENT_ISSUE_NUMBER> --repo <REPO> --json state
```
- If the command fails (issue deleted or unreachable): display error and **STOP**:
  ```
  ❌ Parent issue #<number> is not accessible. Please provide a valid issue URL.
  ```
- If the issue is closed: proceed normally (closed issues are valid decomposition targets).
- If the issue is open: proceed normally.

**Then, construct the JSON payload** matching the Data Contract input schema. **Always include `"skip_comment": true`** in the payload — the slash command will handle posting the summary comment after all issues are confirmed created (either on first success or after retry). This prevents duplicate per-batch comments.

```json
{
  "parent_issue_number": <PARENT_ISSUE_NUMBER>,
  "repo": "<REPO>",
  "run_timestamp": "<RUN_TIMESTAMP>",
  "sub_features": [
    {
      "phase_number": 1,
      "title": "<title>",
      "description": "<scoped description>",
      "requirements": ["FR-001", "FR-002"],
      "acceptance_criteria": ["Criteria 1", "Criteria 2"],
      "phase_total": <N>
    }
  ]
}
```

Write the JSON payload to a temporary file and pipe it to the helper script. This avoids shell quoting issues with apostrophes or special characters in titles/descriptions:
```bash
cat /tmp/specflow-decompose-payload.json | specflow-create-sub-issues
```

**IMPORTANT**: Use the Write tool to create `/tmp/specflow-decompose-payload.json` with the JSON content. Do NOT use `echo` or shell string interpolation to pass JSON — this breaks on content containing apostrophes, quotes, or shell metacharacters.

## Step 5: Report Results

Read the JSON output from the helper script.

### If all issues created successfully (`failed` array is empty):

Post the summary comment on the parent issue (since `skip_comment: true` was passed to the helper). Run via Bash:
```bash
gh issue comment <PARENT_ISSUE_NUMBER> --repo <REPO> --body "<formatted comment listing all sub-issues in phase order>"
```

The comment body should list all created sub-issues in phase order:
```
## Decomposition Sub-Issues

This issue has been decomposed into the following sub-issues:

- **Phase 1**: #<number> — <title>
- **Phase 2**: #<number> — <title>
...

_Decomposition run: <RUN_TIMESTAMP>_
```

If the comment posting fails, display: `"⚠️ Summary comment could not be posted on parent issue #<number>. Please add the sub-issue links manually."`

Report:
```
✅ Decomposition complete — <N> sub-issues created for #<PARENT_ISSUE_NUMBER>

| Phase | Issue | Title |
|-------|-------|-------|
| 1 | #<number> | <title> |
| 2 | #<number> | <title> |
...

Summary comment posted on parent issue: <✅ or ⚠️ Failed>
```

### If partial failure (`failed` array is non-empty):

Check `summary_comment_posted` — if false and there are created issues, note it in the report.

Use `AskUserQuestion` to present the partial result:

Question text:
```
⚠️ Partial failure — <created_count> created, <failed_count> failed.
<if summary_comment_posted is false: "⚠️ Summary comment was NOT posted on parent issue.">

Created:
<list of created issues with URLs>

Failed:
<list of failed items with error messages>
```

Options:
- **"Retry failed items"**: Construct a new payload with ONLY the failed items as `sub_features`, **reusing the original `run_timestamp`**, with `"skip_comment": true`. Re-run Step 4 with this retry payload. After the retry completes, combine `created` arrays from both the original run and the retry. If all issues are now created, post the consolidated summary comment (same as the all-success path above). This ensures FR-008 is satisfied with a single complete summary.
- **"Cancel (keep created)"**: Report the partial result and **STOP**.

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- The `run_timestamp` MUST be generated once per decomposition run and reused for all retries within the same run.
- If any tool call fails, report the error and ask the user how to proceed.
