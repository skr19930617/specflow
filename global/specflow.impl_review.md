---
description: Codex impl review を実行し、ledger 更新・auto-fix loop・handoff を管理
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm specflow prerequisites are installed.
   - If missing:
     ```
     ❌ specflow prerequisites が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow.impl_review` を再度実行
     ```
     → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `specflow-init` を実行
     2. `/specflow.impl_review` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash.
4. Read `SPECFLOW_MAX_AUTOFIX_ROUNDS` from the sourced config. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.

## Step 1: Codex Implementation Review

### Setup

Determine `FEATURE_SPEC` by running:
```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```
Parse the JSON output to get `FEATURE_SPEC`, `FEATURE_DIR`, and `BRANCH`.

### Diff Filtering

Source `config.env` to load `DIFF_EXCLUDE_PATTERNS` and `DIFF_WARN_THRESHOLD` (default: 1000).

Generate the filtered diff by running via Bash:
```bash
specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify' ':(exclude)*/review-ledger.json' ':(exclude)*/review-ledger.json.bak' ':(exclude)*/review-ledger.json.corrupt' ':(exclude)*/current-phase.md' > /tmp/specflow-filtered-diff.txt 2>/tmp/specflow-filter-summary.json
```

Read `/tmp/specflow-filter-summary.json` and parse the JSON (last line).

**Filter Summary Display**: If `excluded_count > 0` in the JSON summary, display a filter summary before the review:
```
Diff Filter Summary:
| File | Reason |
|------|--------|
| <file1> | <reason: deleted_file / rename_only / pattern_match> |
| <file2> | ... |

Excluded: <excluded_count> files | Included: <included_count> files | Total lines: <total_lines>
```
If `excluded_count == 0`, skip the summary display.

If there are `warnings` in the JSON (non-empty array), display each warning: `"⚠ <warning message>"`.

**Empty Diff Check**: Read `/tmp/specflow-filtered-diff.txt`. If the file is empty (0 bytes or only whitespace), display: `"レビュー対象の変更がありません。フィルタリングにより全ての変更が除外されたか、実装変更がありません。"` → **STOP**.

**Line Count Warning**: If `total_lines` from the JSON exceeds `DIFF_WARN_THRESHOLD` (default: 1000), Dual-Display Fallback Pattern に従う:

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Diff size warning — {total_lines} lines (threshold: {DIFF_WARN_THRESHOLD})

続行しますか？（テキスト入力またはボタンで回答）:
- **続行** → continue
- **中止** → abort
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "フィルタリング後の diff が {total_lines} 行あります（閾値: {DIFF_WARN_THRESHOLD} 行）。Codex がスタックする可能性があります。続行しますか？"
  options:
    - label: "続行"
      description: "このまま Codex レビューを実行"
    - label: "中止"
      description: "レビューをスキップ"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

If user chooses "中止", display `"レビューをスキップしました。"` → **STOP**.

### Review

Read `~/.config/specflow/global/review_impl_prompt.md` and `FEATURE_SPEC`. If the prompt file does not exist, display: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_impl_prompt.md）。specflow を再インストールしてください: specflow-install"` → **STOP**.

Read the filtered diff from `/tmp/specflow-filtered-diff.txt`.

Call the `codex` MCP server tool to review the implementation. Pass the following as the prompt:

```
<review_impl_prompt.md の内容>

CURRENT GIT DIFF:
<filtered diff の内容（/tmp/specflow-filtered-diff.txt）>

SPEC CONTENT:
<FEATURE_SPEC の内容>
```

Parse the response as JSON. If the JSON parse fails (Codex returned invalid JSON), display an error: `"⚠ Codex review の JSON パースに失敗しました。ledger 更新をスキップします。"` and skip the ledger update step entirely. Present whatever raw response was received and proceed to the handoff.

## Step 1.5: Update Review Ledger

**This step runs BEFORE presenting findings to the user.** Only execute if Codex returned valid JSON.

### Ledger Read / Create

1. Determine `FEATURE_DIR` from `FEATURE_SPEC` (its parent directory).
2. Attempt to Read `FEATURE_DIR/review-ledger.json`.
   - **If file does not exist**: Create a new ledger: `{ "feature_id": "<BRANCH from check-prerequisites>", "phase": "impl", "current_round": 0, "status": "all_resolved", "findings": [], "round_summaries": [] }` (Note: `BRANCH` is available from the `check-prerequisites.sh --json --paths-only` output parsed in Setup)
   - **If file exists but JSON parse fails**: Rename the corrupt file to `review-ledger.json.corrupt` via Bash (`mv`). Attempt to Read `review-ledger.json.bak`. If bak succeeds, use it and display: `"⚠ review-ledger.json が破損していました。バックアップから復旧しました（破損ファイルは .corrupt に退避）"`. If bak also fails, use `AskUserQuestion` to ask `"新規 ledger を作成しますか？ (既存データは失われます)"` with options "新規作成" / "中止". On "中止", stop the workflow. On "新規作成", create a fresh empty ledger: `{ "feature_id": "<BRANCH from check-prerequisites>", "phase": "impl", "current_round": 0, "status": "all_resolved", "findings": [], "round_summaries": [] }` and continue normal processing. This is NOT a "clean read" — do not create a backup from this empty ledger.
   - **If file exists and valid JSON**: Use it. This is a "clean read" — backup will be created from this content before writing.

### Ledger Validation

3. Check all high-severity findings with `accepted_risk` or `ignored` status: if `notes` field is empty or whitespace-only, auto-revert to `status: "open"` and display `"⚠ high severity finding の override には notes が必須です: {id}"`.

### Round Pre-processing

4. Increment `current_round` by 1. Initialize a sequence counter `seq = 0` for this round's new finding IDs.

### Finding Matching (Unified Pool)

5. Build the **candidate pool**: all existing findings where `status` ≠ `resolved`.

6. **Step 1 — Same match** (`file` + `category` + `severity` exact):
   - For each Codex finding, search candidates with matching `file`, `category`, `severity`.
   - 1:1 → same. N:M → normalize titles (lowercase + whitespace collapse + trim) and match exact. Remaining → pair by index order.余った Codex findings → Step 2.
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

14. If the ledger was a "clean read" (not recovered from backup): Write the pre-update ledger content to `review-ledger.json.bak` via Write tool.
15. Write the updated ledger JSON (including `max_finding_id`) to `review-ledger.json` via Write tool.

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

Report: `current-phase.md generated`

## Step 2: Present Review Results

After the ledger update, present the Codex review findings:
```
Codex Implementation Review

**Decision:** <APPROVE | REQUEST_CHANGES | BLOCK>
**Summary:** <summary>

| # | Severity | File | Title | Detail |
|---|----------|------|-------|--------|
| F1 | high | src/foo.ts | ... | ... |
| F2 | medium | src/bar.ts | ... | ... |
```

Report the review results.

## Auto-fix 確認: AskUserQuestion 直接表示

レビュー結果を表示した後、以下のロジックで auto-fix 確認を行う。

### Actionable Findings 定義

**Actionable findings**: `status ∈ {"new", "open"}` の finding。`"resolved"`, `"accepted_risk"`, `"ignored"` は non-actionable。

### State-to-Option Mapping (FR-006)

各ハンドオフポイントで表示するオプションは以下の通り:

| State | Condition | Options (label → command) |
|-------|-----------|--------------------------|
| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" → `/specflow.fix autofix`, "手動修正" → `/specflow.fix` |
| `review_no_findings` | `actionable_count == 0` after review | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix`, "中止" → `/specflow.reject` |
| `loop_no_findings` | `actionable_count == 0` after loop | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix`, "中止" → `/specflow.reject` |
| `loop_with_findings` | `actionable_count > 0` after loop | "Auto-fix 続行" → `/specflow.fix autofix`, "手動修正" → `/specflow.fix`, "Approve" → `/specflow.approve`, "中止" → `/specflow.reject` |
| `diff_warning` | diff が閾値超過 | "続行" → continue, "中止" → abort |

### Dual-Display Fallback Pattern

全ハンドオフポイントに以下のパターンを適用する:

1. **テキストプロンプト表示**: 1行ステータスメッセージ + 選択肢リスト（label → command 形式）を表示
2. **AskUserQuestion 呼び出し**: 同じ選択肢をボタンとして表示
3. **入力受理ルール**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する
4. **テキスト入力検証**: exact label または exact slash command のみ受理（label は case-insensitive）。部分一致は不可
5. **無効入力時**: テキストプロンプトを再表示し、再度入力を待つ。自動選択や無入力での進行は禁止

### Severity 集計

1. `findings[]` 内の actionable findings（`status ∈ {"new", "open"}`）を収集する。
2. severity 別にグループ化し件数をカウントする。
3. 表示用の `severity_summary` を生成する:
   - 表示順: CRITICAL → HIGH → MEDIUM → LOW
   - 0 件の severity は除外する
   - フォーマット: `"CRITICAL: N, HIGH: M, ..."` （件数が 1 以上の severity のみ）
4. `actionable_count` = actionable findings の総件数を記録する。

**注意**: review-ledger.json の `status` フィールド（`has_open_high`）は accepted_risk/ignored を含むためレポート目的のみ。auto-fix 確認の分岐は `actionable_count` で判定する。

### 分岐: actionable_count による判定

- **actionable_count == 0** → 「Step: 承認フローへ直接遷移」に進む
- **actionable_count > 0** → 「Step: Auto-fix 確認プロンプト表示」に進む
- **review-ledger.json が存在しない / 読み込み失敗** → 「Step: エラー時の処理」に進む

### Step: 承認フローへ直接遷移

actionable findings が 0 件の場合（全て resolved、または全て accepted_risk/ignored のみ）、auto-fix 確認を表示せずに承認フローへ遷移する。Dual-Display Fallback Pattern に従う。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Review complete — all findings resolved

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Approve** → `/specflow.approve`
- **手動修正** → `/specflow.fix`
- **中止** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "指摘事項はすべて解決済みです。次のアクションを選択してください"
  options:
    - label: "Approve"
      description: "実装を承認してコミット・PR 作成"
    - label: "手動修正 (/specflow.fix)"
      description: "手動で修正した後に再レビューする"
    - label: "中止"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。

- 「Approve」 → `Skill(skill: "specflow.approve")`
- 「手動修正 (/specflow.fix)」 → `Skill(skill: "specflow.fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

### Step: Auto-fix 確認プロンプト表示

actionable findings が 1 件以上ある場合、Dual-Display Fallback Pattern に従い、テキストプロンプトを先に表示してから AskUserQuestion を呼び出す。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Review complete — {actionable_count} actionable finding(s): {severity_summary}

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Auto-fix 実行** → `/specflow.fix autofix`
- **手動修正** → `/specflow.fix`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "レビュー指摘: {severity_summary}\nauto-fix を実行しますか？"
  options:
    - label: "Auto-fix 実行"
      description: "自動修正を実行し、再レビューする"
    - label: "手動修正 (/specflow.fix)"
      description: "手動で修正した後に再レビューする"
```

**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が上記の label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。

ユーザーの選択に応じて分岐:
- 「Auto-fix 実行」 → 以下の Round 0 Baseline Snapshot に進む（auto-fix loop 開始）
- 「手動修正 (/specflow.fix)」 → 手動修正誘導メッセージを表示し、`Skill(skill: "specflow.fix")` を実行する
- **スキップ/dismiss/タイムアウト時**: テキストプロンプトが既に表示されているため、テキスト入力を待つ。自動選択は行わない。

**手動修正誘導メッセージ**:
```
手動修正モードに進みます。/specflow.fix で指摘を修正し、再レビューしてください。
```

### Step: エラー時の処理

review-ledger.json が存在しない、読み込みに失敗した、または JSON パースに失敗した場合、エラーメッセージを表示しワークフローを **停止** する:

```
❌ review-ledger.json の読み込みに失敗しました。ワークフローを停止します。
原因: {ファイルが存在しない | 読み込みエラー | JSON パースエラー}

review-ledger.json を確認し、再度 /specflow.impl_review を実行してください。
```

→ **STOP**（ワークフロー終了。AskUserQuestion は表示しない）。

**注意**: この処理は Step 1.5 の Ledger Read / Create とは独立したタイミングで実行される。Step 1.5 で ledger が正常に読み込めた場合のみ Severity 集計に進む。Step 1.5 自体がエラーを報告した場合は、このステップに到達しない。

### `accepted_risk`/`ignored` の扱い

- `accepted_risk` や `ignored` ステータスの high finding は、ユーザーが明示的に受容/無視した判断であり、auto-fix loop の**修正対象外**とする。
- **ループ開始判定**: actionable findings（`new`/`open`、全 severity）が 0 件の場合は承認フローへ直接遷移する。
- **ループ成功判定**: `new`/`open` の high が 0 件になればループ成功とする。`accepted_risk`/`ignored` は成功判定をブロックしない。
- **Quality gate スコア計算**: `accepted_risk`/`ignored` の finding は unresolved として**カウントに含める**（`status ∉ {"resolved"}` に該当するため）。これにより、ユーザーが override した finding の severity も品質指標に反映される。
- **理由**: auto-fix loop はマシンが自動修正可能な finding（`new`/`open`）を対象とする。ユーザーが意図的に受容した finding を自動修正しようとするのは不適切。

#### Round 0 Baseline Snapshot

ループ開始前に、現在の review-ledger.json を読み、以下の baseline 値を記録する:

1. **baseline_score**: 全 unresolved findings（`status ∉ {"resolved"}`）の severity 重み付けスコア合計（high=3, medium=2, low=1）
2. **baseline_new_high_count**: 0（impl review 直後はまだ auto-fix ラウンドが未実行のため、new high の比較基準は 0 とする。ラウンド 1 終了時に実際の new high count が記録され、ラウンド 2 以降で比較に使用される）
3. **baseline_resolved_high_titles**: `findings[]` 内の `status == "resolved"` かつ `severity == "high"` の `title` 一覧
4. **baseline_all_high_titles**: `findings[]` 内の `severity == "high"` の全 `title` 一覧（resolved 含む）

#### ループ変数の初期化

```
autofix_round = 0
previous_score = baseline_score
previous_new_high_count = baseline_new_high_count
previous_resolved_high_titles = baseline_resolved_high_titles
previous_all_resolved_high_titles = baseline_resolved_high_titles
previous_all_high_titles = baseline_all_high_titles
divergence_detected = false
divergence_reason = ""
loop_success = false
```

#### ループ本体

以下を `MAX_AUTOFIX_ROUNDS` 回まで繰り返す:

```
WHILE autofix_round < MAX_AUTOFIX_ROUNDS AND NOT divergence_detected AND NOT loop_success:
```

1. `autofix_round` をインクリメント

2. ラウンドヘッダーを表示:
   ```
   Auto-fix Round {autofix_round}/{MAX_AUTOFIX_ROUNDS}: Starting fix...
   ```

3. `Skill(skill: "specflow.fix", args: "autofix")` を呼び出す。`autofix` 引数により specflow.fix はハンドオフをスキップし、fix → re-review → ledger 更新のみ実行して制御を返す。
   - もし Skill 呼び出しが失敗した場合: エラーを報告し、ループを停止して「Step: エラー時の処理」に進む

4. 更新された `FEATURE_DIR/review-ledger.json` を Read する。
   - もし読み込み失敗: エラーを報告し、ループを停止して「Step: エラー時の処理」に進む

5. **停止条件チェック**（優先順位順に実行、最初にトリガーされた条件で停止）:

   **5a. Success check（最優先）**:
   - `findings[]` 内の `severity == "high"` かつ `status ∈ {"new", "open"}` の件数をカウント
   - 0 件の場合: `loop_success = true` → ループ終了

   **5b. 同種 high 再発チェック**:
   - 現ラウンドの ledger で `status == "resolved"` かつ `severity == "high"` の `title` 一覧を取得し、`previous_all_resolved_high_titles` になかったものを抽出 → 「直前ラウンドで新たに resolved になった high titles」
   - 現ラウンドの unresolved high titles と case-insensitive 部分文字列比較
   - 1 件でも一致 → `divergence_detected = true`, `divergence_reason = "同種 finding の再発"`

   **5c. Quality gate 悪化チェック**:
   - `current_score = Σ weight(f.severity) for f in findings where f.status ∉ {"resolved"}`（high=3, medium=2, low=1）
   - `current_score > previous_score` → `divergence_detected = true`, `divergence_reason = "quality gate 悪化"`

   **5d. New high 増加チェック**（autofix_round >= 2 のみ）:
   - `previous_all_high_titles` に存在しなかった title の件数 = `current_new_high_count`
   - `current_new_high_count > previous_new_high_count` → `divergence_detected = true`, `divergence_reason = "new high が増加傾向"`

   **5e. Max rounds チェック**:
   - `autofix_round >= MAX_AUTOFIX_ROUNDS` かつ unresolved high > 0 → ループ終了

6. **追跡変数を更新**:
   - `previous_score = current_score`
   - `previous_new_high_count = current_new_high_count`
   - `previous_all_resolved_high_titles = findings[]` 内の resolved high titles
   - `previous_all_high_titles = findings[]` 内の全 high titles

7. ラウンド結果を表示:
   ```
   Auto-fix Round {autofix_round}/{MAX_AUTOFIX_ROUNDS}:
     - Unresolved high: {count} ({delta} from previous)
     - Severity score: {current_score} ({delta} from previous)
     - New high: {current_new_high_count}
     - Status: {continuing | stopped: <reason>}
   ```

#### ループ完了サマリー

```
Auto-fix Loop Complete:
  - Total rounds: {autofix_round}
  - Result: {success | stopped}
  - Reason: {unresolved high = 0 | max rounds reached | divergence: <divergence_reason>}
  - Remaining actionable: {actionable_count} (high: {high_count}, medium: {medium_count}, low: {low_count})
```

#### ループ後のハンドオフ状態判定

ループ完了後、`actionable_count` を再計算する（`findings[]` 内の `status ∈ {"new", "open"}` の総件数）。

- **`actionable_count == 0`** → `loop_no_findings` 状態（成功）
- **`actionable_count > 0`** → `loop_with_findings` 状態（停止）

#### ループ後の Auto-fix 確認

**`loop_no_findings`**（`actionable_count == 0`）— Dual-Display Fallback Pattern に従う:

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Auto-fix complete — all findings resolved

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Approve** → `/specflow.approve`
- **手動修正** → `/specflow.fix`
- **中止** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "Auto-fix loop 完了（成功）。次のアクションを選択してください"
  options:
    - label: "Approve"
      description: "実装を承認してコミット・PR 作成"
    - label: "手動修正 (/specflow.fix)"
      description: "手動で修正した後に再レビューする"
    - label: "中止"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

- 「Approve」 → `Skill(skill: "specflow.approve")`
- 「手動修正 (/specflow.fix)」 → `Skill(skill: "specflow.fix")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**`loop_with_findings`**（`actionable_count > 0`）— Dual-Display Fallback Pattern に従う:

残存する actionable findings の severity_summary を再集計し（表示順: CRITICAL → HIGH → MEDIUM → LOW、0 件除外）。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Auto-fix stopped — {reason}. Remaining: {severity_summary}

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Auto-fix 続行** → `/specflow.fix autofix`
- **手動修正** → `/specflow.fix`
- **Approve** → `/specflow.approve`
- **中止** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "Auto-fix loop 停止（{reason}）。残存指摘: {severity_summary}\n次のアクションを選択してください"
  options:
    - label: "Auto-fix 続行"
      description: "自動修正を続行し、再レビューする"
    - label: "手動修正 (/specflow.fix)"
      description: "残りの指摘を手動で修正して再レビュー"
    - label: "Approve"
      description: "現状で承認してコミット・PR 作成"
    - label: "中止"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

- 「Auto-fix 続行」 → auto-fix loop を再開始（Round 0 Baseline Snapshot から再開）
- 「手動修正 (/specflow.fix)」 → `Skill(skill: "specflow.fix")`
- 「Approve」 → `Skill(skill: "specflow.approve")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** 全ハンドオフポイントで Dual-Display Fallback Pattern を適用すること — テキストプロンプトと AskUserQuestion の両方を必ず表示する。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- Never modify files inside `.specflow/` — read-only.
- If any tool call fails, report the error and ask the user how to proceed.
