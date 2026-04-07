---
description: Codex spec review を実行し、ledger 更新・low severity auto-apply・handoff を管理
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
     2. `/specflow.spec_review` を再度実行
     ```
     → **STOP**.
2. Read `openspec/config.yaml`. Extract any relevant settings. If parse fails, display error and **STOP**.

## Setup

Resolve `FEATURE_DIR` from the current change id:
- If `$ARGUMENTS` contains a change id, set `FEATURE_DIR=openspec/changes/<id>`.
- Otherwise, detect the active change from the current branch name or prompt the user.

Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.

Set `FEATURE_SPEC` to `<FEATURE_DIR>/specs/*/spec.md` (glob for the first match) or `<FEATURE_DIR>/proposal.md` as fallback.

Verify that `FEATURE_SPEC` exists (via Read tool). If the file does not exist, display an error: `"spec が見つかりません。先に /specflow または /opsx:propose を実行してください。"` → **STOP**.

## Step 1: Codex Spec Review

Read `~/.config/specflow/global/review_spec_prompt.md` for the review prompt. If the file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_spec_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**.
Read the current `FEATURE_SPEC` file.

Read the issue body from `/tmp/specflow-issue.json` if available (skip silently if not found).

Call the `codex` MCP server tool to review the spec. Pass the following as the prompt:

```
<review_spec_prompt.md の内容>

ISSUE BODY:
<issue body の内容（available な場合。なければ "(not available)" と記載）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON (the review prompt instructs the model to return strict JSON with `decision`, `findings`, and `summary` fields).

If the JSON parse fails (Codex returned invalid JSON), display an error: `"⚠ Codex review の JSON パースに失敗しました。ledger 更新をスキップします。"` and skip the ledger update step entirely. Present whatever raw response was received and proceed to the handoff.

## Step 1.5: Update Review Ledger

**This step runs BEFORE presenting findings to the user.** Only execute if Codex returned valid JSON.

### Ledger Read / Create

1. Use `FEATURE_DIR` resolved in Setup.
2. Attempt to Read `FEATURE_DIR/review-ledger-spec.json`.
   - **If file does not exist**: Create a new ledger: `{ "feature_id": "<change id from FEATURE_DIR>", "phase": "spec", "current_round": 0, "status": "all_resolved", "max_finding_id": 0, "findings": [], "round_summaries": [] }` (Note: the change id is the directory name of `FEATURE_DIR`, e.g. `openspec/changes/my-change` → `my-change`)
   - **If file exists but JSON parse fails**: Rename the corrupt file to `review-ledger-spec.json.corrupt` via Bash (`mv`). Attempt to Read `review-ledger-spec.json.bak`. If bak succeeds, use it and display: `"⚠ review-ledger-spec.json が破損していました。バックアップから復旧しました（破損ファイルは .corrupt に退避）"`. If bak also fails, use `AskUserQuestion` to ask `"新規 ledger を作成しますか？ (既存データは失われます)"` with options "新規作成" / "中止". On "中止", stop the workflow. On "新規作成", create a fresh empty ledger: `{ "feature_id": "<change id from FEATURE_DIR>", "phase": "spec", "current_round": 0, "status": "all_resolved", "max_finding_id": 0, "findings": [], "round_summaries": [] }` and continue normal processing. This is NOT a "clean read" — do not create a backup from this empty ledger.
   - **If file exists and valid JSON**: Use it. This is a "clean read" — backup will be created from this content before writing.

### Ledger Validation

3. Check all high-severity findings with `accepted_risk` or `ignored` status: if `notes` field is empty or whitespace-only, auto-revert to `status: "open"` and display `"⚠ high severity finding の override には notes が必須です: {id}"`.

### Round Pre-processing

4. Increment `current_round` by 1. Initialize a sequence counter `seq = 0` for this round's new finding IDs.

### Finding Matching (Unified Pool)

5. Build the **candidate pool**: all existing findings where `status` ≠ `resolved`.

6. **Step 1 — Same match** (`file` + `category` + `severity` exact):
   - For each Codex finding, search candidates with matching `file`, `category`, `severity`.
   - 1:1 → same. N:M → normalize titles (lowercase + whitespace collapse + trim) and match exact. Remaining → pair by index order. 余った Codex findings → Step 2.
   - **Matched active (open/new)**: set `status` = `"open"`, `relation` = `"same"`, `latest_round` = current_round.
   - **Matched override (accepted_risk/ignored)**: preserve `status`, set `relation` = `"same"`, `latest_round` = current_round.

7. **Step 2 — Reframed match** (`file` + `category` match, `severity` differs):
   - For unmatched Codex findings, search unmatched candidates with matching `file` + `category` but different `severity`. 1:1 index-order pairing.
   - **Old finding** (active or override): set `status` = `"resolved"`, `relation` = `"reframed"` (keep original severity).
   - **New finding**: `seq++`, `id` = `R{current_round}-F{seq (zero-padded 2 digits)}`, `origin_round` = current_round, `latest_round` = current_round, `status` = `"open"`, `relation` = `"reframed"`, `supersedes` = old finding's id. Copy severity/category/file/title/detail/suggested_resolution from Codex finding. `notes` = `""`.

8. **Step 3 — Remaining**:
   - Unmatched Codex findings → new: `seq++`, `id` = `R{current_round}-F{seq zero-padded to 2 digits, e.g. 01, 02, 10}`, `origin_round` = current_round, `latest_round` = current_round, `status` = `"new"`, `relation` = `"new"`, `supersedes` = null, `notes` = `""`.
   - Unmatched active candidates (open/new) → `status` = `"resolved"` (keep `relation` as previous value, do NOT update `latest_round`).
   - Unmatched override candidates → preserve status unchanged.

### Zero-Findings Edge Case

9. If Codex returned 0 findings: skip matching. Set all active (open/new) findings to `status` = `"resolved"`. Override findings are preserved.

### Round Summary (Snapshot)

10. Compute end-of-round snapshot counts from the full `findings[]`:
    - `total`: count of all findings
    - `open`: count where status = "open"
    - `new`: count where status = "new"
    - `resolved`: count where status = "resolved"
    - `overridden`: count where status in ["accepted_risk", "ignored"]
    - `by_severity`: for each of high/medium/low: { open, resolved, new, overridden }
    Append `{ "round": current_round, "total": ..., "open": ..., "new": ..., "resolved": ..., "overridden": ..., "by_severity": ... }` to `round_summaries[]`.

### Top-Level Status Derivation

11. Compute `status`:
    - `"has_open_high"`: if ANY high-severity finding has status in ["open", "new", "accepted_risk", "ignored"]
    - `"all_resolved"`: if ALL findings have status = "resolved", OR findings is empty
    - `"in_progress"`: otherwise

### Override Warnings

12. For each high-severity finding with status `accepted_risk` or `ignored` (with valid notes): display `"⚠ high severity finding が override されています: {id}"`.

### Persist max_finding_id

13. Compute `max_finding_id` from the current findings array: `max(findings.map(f => extractNumber(f.id)))` where `extractNumber("R1-F03") = 3`. If findings is empty, set to 0. Write this value as `"max_finding_id"` in the ledger JSON. This field MUST be present in every ledger file from initialization onward.

### Backup and Write

14. If the ledger was a "clean read" (not recovered from backup): Write the pre-update ledger content to `review-ledger-spec.json.bak` via Write tool.
15. Write the updated ledger JSON (including `max_finding_id`) to `review-ledger-spec.json` via Write tool.

### Ledger Summary Display

16. Display before the findings table:
    ```
    Review Ledger: Round {current_round} | Status: {status} | Findings: {new} new, {open} open, {resolved} resolved
    ```
    If `round_summaries` has more than 1 entry, show a compact progress table:
    ```
    | Round | Total | Open | New | Resolved | Overridden |
    |-------|-------|------|-----|----------|------------|
    | 1     | 5     | 0    | 0   | 3        | 2          |
    | 2     | 7     | 2    | 2   | 3        | 2          |
    ```
    Then show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`

## Step 1.6: Generate current-phase.md

**This step runs after the review-ledger-spec has been fully updated, backed up, and persisted to disk.**

1. Read the just-written `FEATURE_DIR/review-ledger-spec.json`.
2. Extract: `feature_id` (or derive from directory name), `current_round`, `status`, `findings[]`.
3. Compute each field:
   - **Phase**: If `current_round == 1` → `spec-review`; else → `spec-fix-review`. Fallback: `spec-review`.
   - **Round**: `current_round`. Fallback: `1`.
   - **Status**: Direct read from `status`. Fallback: `in_progress`.
   - **Open High Findings**: Filter `findings[]` where `severity == "high"` AND `status in ["new", "open"]`. Format: `<count> 件 — "<title1>", "<title2>"`. If none: `0 件`. Fallback: `0 件`.
   - **Accepted Risks**: Filter `findings[]` where `status in ["accepted_risk", "ignored"]`. Format each as `<title> (<status>, notes: "<notes>")`. If none: `none`. Fallback: `none`.
   - **Latest Changes**: Run `git log --oneline -5 $(git merge-base HEAD ${BASE_BRANCH:-main})..HEAD` via Bash. Format each line as `  - <hash> <subject>`. If the command fails or returns empty output, use: `(no commits yet)`.
   - **Next Recommended Action**: If Open High Findings count > 0 → `/specflow.spec_fix`; else → `/specflow.plan`. Fallback: `/specflow.spec_fix`.
4. **Malformed/missing ledger recovery** (if the ledger read in step 1 fails):
   - First: attempt partial recovery — extract any readable top-level fields from the file.
   - Second: supplement missing fields with in-memory data from the just-completed Codex review (findings, decision).
   - Third: use spec-defined fallback values listed above.
   - If `findings[]` is missing from both sources: set `0 件 (ledger findings unavailable)` and `none (ledger findings unavailable)`.
   - Append parenthetical note to any fallback value (e.g., `in_progress (ledger parse error)`).
5. Write `FEATURE_DIR/current-phase.md` using the Write tool (complete overwrite):

```markdown
# Current Phase: <feature_id>

- Phase: <phase>
- Round: <round>
- Status: <status>
- Open High Findings: <open_high_findings>
- Accepted Risks: <accepted_risks>
- Latest Changes:
<latest_changes lines, each prefixed with "  - ">
- Next Recommended Action: <next_action>
```

Report: `current-phase.md generated`

## Step 1.7: Low Severity Auto-Apply

**This step runs after ledger update and current-phase generation.** Only execute if Codex returned valid JSON.

For each finding in the updated ledger where `severity == "low"` AND `status in ["new", "open"]`:

1. Read the current `FEATURE_SPEC` file.
2. Apply the fix described in the finding's `suggested_resolution` field (if present) or `detail` field to the spec file.
3. Write the updated spec file via Write tool.
4. Update the finding's `status` to `"resolved"` in the in-memory ledger.
5. Display: `"✅ Auto-applied low severity fix: {id} — {title}"`

After processing all low-severity findings:

6. If any findings were auto-applied, recompute `max_finding_id`, `status`, and the latest `round_summaries` entry to reflect the resolved findings.
7. Write the updated ledger JSON to `review-ledger-spec.json` via Write tool (overwrite — no additional backup needed since Step 1.5 already created the backup).
8. Display summary: `"Auto-applied {count} low severity finding(s). Remaining actionable: {remaining_count}"`

**Do NOT re-run Codex review after auto-applying.** Medium and high severity findings are left for user manual handling.

9. If any findings were auto-applied, regenerate `FEATURE_DIR/current-phase.md` using the same logic as Step 1.6 (to reflect the post-auto-apply ledger state).

If no low-severity actionable findings exist, skip this step silently.

## Step 2: Present Review

After the ledger update and auto-apply, present the Codex review findings:
```
Codex Spec Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | Category | File | Title | Detail | Suggested Resolution | Status |
|---|----------|----------|------|-------|--------|---------------------|--------|
| F1 | high | ... | ... | ... | ... | ... | open |
| F2 | medium | ... | ... | ... | ... | ... | open |
| F3 | low | ... | ... | ... | ... | ... | resolved (auto-applied) |
```

Report the review results.

## Handoff: 次のアクション選択

レビュー結果を表示した後、必ず `AskUserQuestion` ツールを使って次のアクションを選択させる。

```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "Plan に進む"
      description: "Plan → Tasks を作成しレビュー"
    - label: "Spec を修正"
      description: "レビュー指摘に基づいて Spec を修正し再レビュー"
    - label: "中止"
      description: "変更を破棄して終了"
```

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「Plan に進む」 → `Skill(skill: "specflow.plan")`
- 「Spec を修正」 → `Skill(skill: "specflow.spec_fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text. 必ず `AskUserQuestion` のボタン UI を使うこと。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, review-ledger-spec, current-phase) are managed in `openspec/changes/<change id>/`.
- The spec review ledger file is `review-ledger-spec.json` (NOT `review-ledger.json` which is for impl reviews).
- If any tool call fails, report the error and ask the user how to proceed.
