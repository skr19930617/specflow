---
description: レビュー指摘を修正し、再度 Codex review を実行
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
     2. `/specflow.fix` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.fix` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.

## Setup

Resolve `FEATURE_DIR` from the current change id:
- If `$ARGUMENTS` contains a change id (excluding `autofix`), set `FEATURE_DIR=openspec/changes/<id>`.
- Otherwise, detect the active change from the current branch name or prompt the user.

Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.

Set `FEATURE_SPEC` to `<FEATURE_DIR>/specs/*/spec.md` (glob for the first match) or `<FEATURE_DIR>/proposal.md` as fallback. Read the spec file.

## Step 0.5: Read Current Phase Context

1. Use `FEATURE_DIR` resolved in Setup.
2. Check if `FEATURE_DIR/current-phase.md` exists (via Read tool — if not found, proceed silently).
3. If the file exists: read it and display as a summary block:
   ```
   Current Phase Context:
   <contents of current-phase.md>
   ```
4. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."

## Apply Fixes

Source `config.env` to load `DIFF_EXCLUDE_PATTERNS` and `DIFF_WARN_THRESHOLD` (default: 1000).

Generate the filtered diff to understand the implementation state:
```bash
specflow-filter-diff -- . ':(exclude).specflow' ':(exclude)*/review-ledger.json' ':(exclude)*/review-ledger.json.bak' ':(exclude)*/review-ledger.json.corrupt' ':(exclude)*/current-phase.md' > /tmp/specflow-filtered-diff.txt 2>/tmp/specflow-filter-summary.json
```

Read `/tmp/specflow-filter-summary.json` and parse the JSON.

**Filter Summary Display**: If `excluded_count > 0`, display the filter summary (same format as specflow.impl_review.md). If `excluded_count == 0`, skip.

If there are `warnings` in the JSON (non-empty array), display each warning.

Read the filtered diff from `/tmp/specflow-filtered-diff.txt`.

Read the spec file for acceptance criteria context.

Based on the review findings from the previous step (the user has just seen them), apply fixes to address all findings:
- Correctness issues
- Completeness gaps
- Quality problems
- Scope violations

Report what was fixed.

## Re-run Codex Implementation Review

### Ledger Detection and Prompt Switching

Use `FEATURE_DIR` resolved in Setup.

Attempt to Read `FEATURE_DIR/review-ledger.json` to determine which review prompt to use:

- **Branch A: No ledger file** — file does not exist → use initial review prompt (`review_impl_prompt.md`), unchanged behavior. Set `REREVIEW_MODE = false`.
- **Branch B: Valid ledger** — file exists, JSON parses successfully, `findings` array present → use re-review prompt (`review_impl_rereview_prompt.md`). Set `REREVIEW_MODE = true`. Extract `PREVIOUS_FINDINGS` from ledger `findings` array (only findings where status is NOT "resolved" — i.e., status in ["open", "new", "accepted_risk", "ignored"]). Extract `MAX_FINDING_ID` from ledger (if present), or derive from `max(findings.map(f => extractNumber(f.id)))`, or 0 if empty.
- **Branch C: Empty findings** — file exists, JSON valid, but `findings` array is empty → use re-review prompt with empty `PREVIOUS_FINDINGS` array, `MAX_FINDING_ID = 0`. Set `REREVIEW_MODE = true`.
- **Branch D: Corrupt/malformed ledger** — file exists but JSON parse fails or required fields missing → use re-review prompt with empty `PREVIOUS_FINDINGS`, `MAX_FINDING_ID = 0`. Set `REREVIEW_MODE = true`, `LEDGER_ERROR = true`. Display: `"⚠ review-ledger.json が破損しています。空の前回 findings で re-review を実行します。"`.
- **Branch E: Missing max_finding_id** — file exists, JSON valid, findings present, but `max_finding_id` field absent → derive from findings. Log: `"⚠ max_finding_id が見つかりません。findings から導出しました。"`. Proceed as Branch B.

Read `FEATURE_SPEC`.

Generate the filtered diff for review:
```bash
specflow-filter-diff -- . ':(exclude).specflow' ':(exclude)*/review-ledger.json' ':(exclude)*/review-ledger.json.bak' ':(exclude)*/review-ledger.json.corrupt' ':(exclude)*/current-phase.md' > /tmp/specflow-filtered-diff.txt 2>/tmp/specflow-filter-summary.json
```

Read `/tmp/specflow-filter-summary.json` and parse the JSON.

**Filter Summary Display**: If `excluded_count > 0`, display the filter summary. If there are `warnings`, display each. If `excluded_count == 0`, skip.

**Empty Diff Check**: Read `/tmp/specflow-filtered-diff.txt`. If empty, display: `"レビュー対象の変更がありません。"` → **STOP**.

**Line Count Warning**: If `total_lines` exceeds `DIFF_WARN_THRESHOLD`, Dual-Display Fallback Pattern に従う:

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Diff size warning — {total_lines} lines (threshold: {DIFF_WARN_THRESHOLD})

続行しますか？（テキスト入力またはボタンで回答）:
- **続行** → continue
- **中止** → abort
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**: "続行"/"中止" options.

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

If "中止", skip review → **STOP**.

Read the filtered diff from `/tmp/specflow-filtered-diff.txt`.

### Call Codex

**If `REREVIEW_MODE = false`** (no ledger, initial review prompt):

Read `~/.config/specflow/global/review_impl_prompt.md`. If the file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_impl_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**. Call the `codex` MCP server tool with:

```
<review_impl_prompt.md の内容>

CURRENT GIT DIFF:
<filtered diff の内容（/tmp/specflow-filtered-diff.txt）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

**If `REREVIEW_MODE = true`** (ledger exists, re-review prompt):

Read `~/.config/specflow/global/review_impl_rereview_prompt.md`. If the file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_impl_rereview_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**. Call the `codex` MCP server tool with:

```
<review_impl_rereview_prompt.md の内容>

PREVIOUS_FINDINGS:
<PREVIOUS_FINDINGS の JSON 配列>

MAX_FINDING_ID:
<MAX_FINDING_ID の値>

CURRENT GIT DIFF:
<filtered diff の内容（/tmp/specflow-filtered-diff.txt）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

If `LEDGER_ERROR = true`, append to the prompt: `"NOTE: The previous review ledger was corrupted. Set ledger_error to true in your response. Treat all findings as new."`

### Parse Response

Parse the response as JSON. If the JSON parse fails (Codex returned invalid JSON), display an error: `"⚠ Codex review の JSON パースに失敗しました。ledger 更新をスキップします。"` and skip the ledger update step entirely. Present whatever raw response was received and proceed to the handoff.

### Prior-ID Classification Validation (re-review mode only)

If `REREVIEW_MODE = true` and JSON parse succeeded, validate the classified output before proceeding to ledger update:

1. Collect `prior_ids` = all IDs from PREVIOUS_FINDINGS that were passed to Codex.
2. Collect `response_resolved_ids` = IDs in `resolved_previous_findings`.
3. Collect `response_still_open_ids` = IDs in `still_open_previous_findings`.
4. **Check exhaustive**: for each ID in `prior_ids`, verify it appears in either resolved or still_open. If any prior ID is missing, auto-classify it as still_open with `note: "classification missing from Codex output"` and `severity` from the previous ledger. Display: `"⚠ Codex が前回 finding を分類しませんでした (自動的に still_open に分類): {missing_ids}"`.
5. **Check exclusive**: if any ID appears in both resolved and still_open, keep the still_open classification and remove from resolved (conservative). Display: `"⚠ 重複分類を検出しました (still_open を優先): {duplicate_ids}"`.
6. **Check unknown**: if any ID in the response is not in `prior_ids`, display as explicit anomaly: `"⚠ Unknown IDs in Codex response (excluded from ledger): {unknown_ids}"`. Exclude from ledger update.

### Re-review Results Display (re-review mode only)

If `REREVIEW_MODE = true`, display the classified results before the standard findings table:

```
### Re-review Classification

**Resolved** ({count}):
| ID | Note |
|----|------|
| R1-F01 | fixed null check |

**Still Open** ({count}):
| ID | Severity | Note |
|----|----------|------|
| R1-F02 | high | still unresolved |

**New Findings** ({count}):
| ID | Severity | File | Title |
|----|----------|------|-------|
| F3 | medium | src/foo.ts | missing test |
```

## Step: Update Review Ledger

**This step runs BEFORE presenting findings to the user.** Only execute if Codex returned valid JSON.

### Ledger Read / Create

1. Use `FEATURE_DIR` resolved in Setup.
2. Attempt to Read `FEATURE_DIR/review-ledger.json`.

   **Auto-fix mode fail-fast** (`$ARGUMENTS` に `autofix` が含まれる場合):
   - **If file does not exist**: `"⚠ autofix mode: review-ledger.json が見つかりません。ループを停止します。"` と表示し、**即座に処理を終了**する（ここで return — 制御は呼び出し元の specflow.impl auto-fix loop に戻り、Case C でエラーハンドオフされる）。
   - **If file exists but JSON parse fails**: `"⚠ autofix mode: review-ledger.json が破損しています。ループを停止します。"` と表示し、**即座に処理を終了**する（バックアップ復旧や AskUserQuestion は行わない）。
   - **If file exists and valid JSON**: 通常通り使用する。

   **通常モード** (`$ARGUMENTS` に `autofix` が含まれない場合):
   - **If file does not exist**: Create a new ledger: `{ "feature_id": "<change id from FEATURE_DIR>", "phase": "impl", "current_round": 0, "status": "all_resolved", "findings": [], "round_summaries": [] }` (Note: the change id is the directory name of `FEATURE_DIR`, e.g. `openspec/changes/my-change` → `my-change`)
   - **If file exists but JSON parse fails**: Rename the corrupt file to `review-ledger.json.corrupt` via Bash (`mv`). Attempt to Read `review-ledger.json.bak`. If bak succeeds, use it and display: `"⚠ review-ledger.json が破損していました。バックアップから復旧しました（破損ファイルは .corrupt に退避）"`. If bak also fails, use `AskUserQuestion` to ask `"新規 ledger を作成しますか？ (既存データは失われます)"` with options "新規作成" / "中止". On "中止", stop the workflow. On "新規作成", create a fresh empty ledger: `{ "feature_id": "<change id from FEATURE_DIR>", "phase": "impl", "current_round": 0, "status": "all_resolved", "findings": [], "round_summaries": [] }` and continue normal processing. This is NOT a "clean read" — do not create a backup from this empty ledger.
   - **If file exists and valid JSON**: Use it. This is a "clean read" — backup will be created from this content before writing.

### Ledger Validation

3. Check all high-severity findings with `accepted_risk` or `ignored` status: if `notes` field is empty or whitespace-only, auto-revert to `status: "open"` and display `"⚠ high severity finding の override には notes が必須です: {id}"`.

### Round Pre-processing

4. Increment `current_round` by 1. Initialize a sequence counter `seq = 0` for this round's new finding IDs.

### Finding Update

**If `REREVIEW_MODE = true`** (classified re-review output):

The Codex response already classifies findings into resolved/still_open/new. Use this classification directly instead of the matching algorithm.

5. For each finding in `resolved_previous_findings`:
   - Find the corresponding finding in the ledger by `id`.
   - Set `status` = `"resolved"`, `latest_round` = current_round. Keep all other attributes unchanged.

6. For each finding in `still_open_previous_findings`:
   - Find the corresponding finding in the ledger by `id`.
   - **Overwrite from re-review**: `severity` (re-evaluated value), update ledger `notes` field only if re-review `note` provides new information (do not overwrite user override `notes` for accepted_risk/ignored findings).
   - **Preserve from previous ledger**: `id`, `category`, `file`, `title`, `detail`, `origin_round`, `relation`, `supersedes`.
   - Update: `status` → `"open"` (unless finding has override status accepted_risk/ignored — preserve override), `latest_round` → current_round.
   - For split/merge findings (note contains "split" or "merge"): in addition to marking still_open, these will be resolved in the NEXT round's ledger update when only the new IDs carry forward.

7. For each finding in `new_findings`:
   - Add as new ledger entry: copy `id`, `severity`, `category`, `file`, `title`, `detail` from Codex output. Set `origin_round` = current_round, `latest_round` = current_round, `status` = `"new"`, `relation` = `"new"`, `supersedes` = null, `notes` = `""`.

8. **Persist max_finding_id**: compute `new_max = max(prev_ledger.max_finding_id || 0, max(new_findings.map(f => extractNumber(f.id))) || 0)` and write to ledger JSON as `"max_finding_id": new_max`. This MUST be written on every ledger update.

9. **Handle ledger_error=true**: if the Codex response has `ledger_error: true`, set `max_finding_id` from new_findings only, and the findings array contains only new_findings (no carryover from corrupt ledger).

**If `REREVIEW_MODE = false`** (initial review output, standard matching):

5. Build the **candidate pool**: all existing findings where `status` ≠ `resolved`.

6. **Step 1 — Same match** (`file` + `category` + `severity` exact):
   - For each Codex finding, search candidates with matching `file`, `category`, `severity`.
   - 1:1 → same. N:M → normalize titles (lowercase + whitespace collapse + trim) and match exact. Remaining → pair by index order. 余った Codex findings → Step 2.
   - **Matched active (open/new)**: set `status` = `"open"`, `relation` = `"same"`, `latest_round` = current_round.
   - **Matched override (accepted_risk/ignored)**: preserve `status`, set `relation` = `"same"`, `latest_round` = current_round.

7. **Step 2 — Reframed match** (`file` + `category` match, `severity` differs):
   - For unmatched Codex findings, search unmatched candidates with matching `file` + `category` but different `severity`. 1:1 index-order pairing.
   - **Old finding** (active or override): set `status` = `"resolved"`, `relation` = `"reframed"` (keep original severity).
   - **New finding**: `seq++`, `id` = `R{current_round}-F{seq (zero-padded 2 digits)}`, `origin_round` = current_round, `latest_round` = current_round, `status` = `"open"`, `relation` = `"reframed"`, `supersedes` = old finding's id. Copy severity/category/file/title/detail from Codex finding. `notes` = `""`.

8. **Step 3 — Remaining**:
   - Unmatched Codex findings → new: `seq++`, `id` = `R{current_round}-F{seq zero-padded to 2 digits, e.g. 01, 02, 10}`, `origin_round` = current_round, `latest_round` = current_round, `status` = `"new"`, `relation` = `"new"`, `supersedes` = null, `notes` = `""`.
   - Unmatched active candidates (open/new) → `status` = `"resolved"` (keep `relation` as previous value, do NOT update `latest_round`).
   - Unmatched override candidates → preserve status unchanged.

### Zero-Findings Edge Case

9. If Codex returned 0 findings (both modes): skip matching. Set all active (open/new) findings to `status` = `"resolved"`. Override findings are preserved.

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

### Backup and Write

13. If the ledger was a "clean read" (not recovered from backup): Write the pre-update ledger content to `review-ledger.json.bak` via Write tool.
14. Write the updated ledger JSON to `review-ledger.json` via Write tool.

### Ledger Summary Display

15. Display before the findings table:
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

## Update current-phase.md

**This step runs after the review-ledger has been fully updated, backed up, and persisted to disk.**

1. Read the just-written `FEATURE_DIR/review-ledger.json`.
2. Extract: `feature_id` (or derive from directory name), `current_round`, `status`, `findings[]`.
3. Compute each field:
   - **Phase**: If `current_round == 1` → `impl-review`; else → `fix-review`. Fallback: `impl-review`.
   - **Round**: `current_round`. Fallback: `1`.
   - **Status**: Direct read from `status`. Fallback: `in_progress`.
   - **Open High Findings**: Filter `findings[]` where `severity == "high"` AND `status in ["new", "open"]`. Format: `<count> 件 — "<title1>", "<title2>"`. If none: `0 件`. Fallback: `0 件`.
   - **Accepted Risks**: Filter `findings[]` where `status in ["accepted_risk", "ignored"]`. Format each as `<title> (<status>, notes: "<notes>")`. If none: `none`. Fallback: `none`.
   - **Latest Changes**: Run `git log --oneline -5 $(git merge-base HEAD ${BASE_BRANCH:-main})..HEAD` via Bash. Format each line as `  - <hash> <subject>`. If the command fails or returns empty output, use: `(no commits yet)`.
   - **Next Recommended Action**: If Open High Findings count > 0 → `/specflow.fix`; else → `/specflow.approve`. Fallback: `/specflow.fix`.
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

Report: `current-phase.md updated`

## Present Review Results

After the ledger update, present the Codex review findings:
```
Codex Implementation Review (after fix)

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
```

Report the review results.

## Handoff: 次のアクション選択

**Auto-fix mode check**: `$ARGUMENTS` に `autofix` が含まれる場合、このコマンドは auto-fix loop から呼び出されている。ハンドオフ（AskUserQuestion）は **スキップ** し、ここで処理を終了する。制御は呼び出し元の auto-fix loop に戻り、ループ側が停止条件を判定する。

**通常モード**（`$ARGUMENTS` に `autofix` が含まれない場合）:

レビュー結果を表示した後、Dual-Display Fallback Pattern に従い、テキストプロンプトを先に表示してから AskUserQuestion を呼び出す。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Fix & re-review complete

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Approve & Commit** → `/specflow.approve`
- **Fix All** → `/specflow.fix`
- **Reject** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "Approve & Commit"
      description: "実装を承認してコミット・PR 作成"
    - label: "Fix All"
      description: "指摘をすべて再修正して再レビュー"
    - label: "Reject"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「Approve & Commit」 → `Skill(skill: "specflow.approve")`
- 「Fix All」 → `Skill(skill: "specflow.fix")`
- 「Reject」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** テキストプロンプトと AskUserQuestion の両方を必ず表示すること（Dual-Display）。
