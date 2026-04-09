---
description: Codex design/tasks review を実行し、ledger 更新・auto-fix loop・handoff を管理
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
     2. `/specflow.review_design` を再度実行
     ```
     → **STOP**.
2. Read `openspec/config.yaml`. Extract `max_autofix_rounds` if present. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.

## Setup

Determine `CHANGE_ID`:
- If `$ARGUMENTS` contains a change id, use it.
- Otherwise, derive from the current branch name or prompt the user.

Verify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.

Verify that `openspec/changes/<CHANGE_ID>/design.md` and `openspec/changes/<CHANGE_ID>/tasks.md` exist (via Read tool). If either file does not exist, display an error: `"design.md または tasks.md が見つかりません。先に /specflow.design を実行してください。"` → **STOP**.

## Step 1: Run Orchestrator

Run the Bash orchestrator:
```bash
specflow-review-design review <CHANGE_ID>
```

Capture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.

Parse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.

## Step 2: Handle Ledger Recovery

If `RESULT_JSON.ledger_recovery == "prompt_user"`:

The ledger was corrupt and no backup was available. Use `AskUserQuestion` to ask the user:

```
AskUserQuestion:
  question: "review-ledger-design.json が破損しており、バックアップもありません。新規 ledger を作成しますか？ (既存データは失われます)"
  options:
    - label: "新規作成"
      description: "空の ledger を作成してレビューを再実行"
    - label: "中止"
      description: "ワークフローを停止"
```

- 「新規作成」 → Re-run the orchestrator with `--reset-ledger`:
  ```bash
  specflow-review-design review <CHANGE_ID> --reset-ledger
  ```
  Capture and parse again as `RESULT_JSON`, then continue from Step 3.
- 「中止」 → **STOP**.

## Step 3: Handle Error Results

If `RESULT_JSON.status == "error"`:
- Display `RESULT_JSON.error` → **STOP**.

## Step 4: Display Review Results

### Review Findings

Present the Codex review from `RESULT_JSON.review`:

If `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.

Otherwise display:
```
Codex Design/Tasks Review

**Decision:** <RESULT_JSON.review.decision>
**Summary:** <RESULT_JSON.review.summary>

| # | Severity | File | Category | Title | Detail |
|---|----------|------|----------|-------|--------|
| P1 | high | design.md | completeness | ... | ... |
| P2 | medium | tasks.md | ordering | ... | ... |
```

### Ledger Summary Display

Use `RESULT_JSON.ledger` to display:
```
Review Ledger (Plan): Round {RESULT_JSON.ledger.round} | Status: {RESULT_JSON.ledger.status} | Findings: {RESULT_JSON.ledger.counts.new} new, {RESULT_JSON.ledger.counts.open} open, {RESULT_JSON.ledger.counts.resolved} resolved
```

If `RESULT_JSON.ledger.round_summaries` has more than 1 entry, show a compact progress table:
```
| Round | Total | Open | New | Resolved | Overridden |
|-------|-------|------|-----|----------|------------|
| 1     | 5     | 0    | 0   | 3        | 2          |
| 2     | 7     | 2    | 2   | 3        | 2          |
```
Then show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`

## Step 5: Handoff (based on RESULT_JSON.handoff.state)

### Actionable Findings 定義

**Actionable findings**: `status ∈ {"new", "open"}` の finding。`"resolved"`, `"accepted_risk"`, `"ignored"` は non-actionable。

### Severity 集計

Use `RESULT_JSON.handoff.actionable_count` and `RESULT_JSON.handoff.severity_summary`.

The `severity_summary` format: CRITICAL → HIGH → MEDIUM → LOW order, 0 件の severity は除外。

### `accepted_risk`/`ignored` の扱い

- `accepted_risk` や `ignored` ステータスの high finding は、ユーザーが明示的に受容/無視した判断であり、auto-fix loop の**修正対象外**とする。
- **ループ開始判定**: actionable findings（`new`/`open`、全 severity）が 0 件の場合は実装フローへ直接遷移する。
- **Quality gate スコア計算**: `accepted_risk`/`ignored` の finding は unresolved として**カウントに含める**。

### State-to-Option Mapping

| State | Condition | Options (label → command) |
|-------|-----------|--------------------------|
| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" → auto-fix loop, "手動修正" → `/specflow.fix_design` |
| `review_no_findings` | `actionable_count == 0` after review | "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |
| `loop_no_findings` | `actionable_count == 0` after loop | "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |
| `loop_with_findings` | `actionable_count > 0` after loop | "手動修正" → `/specflow.fix_design`, "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |

### Dual-Display Fallback Pattern

全ハンドオフポイントに以下のパターンを適用する:

1. **テキストプロンプト表示**: 1行ステータスメッセージ + 選択肢リスト（label → command 形式）を表示
2. **AskUserQuestion 呼び出し**: 同じ選択肢をボタンとして表示
3. **入力受理ルール**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する
4. **テキスト入力検証**: exact label または exact slash command のみ受理（label は case-insensitive）。部分一致は不可
5. **無効入力時**: テキストプロンプトを再表示し、再度入力を待つ。自動選択や無入力での進行は禁止

### `review_no_findings` (actionable_count == 0)

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Review complete — all findings resolved

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **実装に進む** → `/specflow.apply`
- **Reject** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "指摘事項はすべて解決済みです。次のアクションを選択してください"
  options:
    - label: "実装に進む"
      description: "specflow で実装を実行"
    - label: "Reject"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

- 「実装に進む」 → `Skill(skill: "specflow.apply")`
- 「Reject」 → `Skill(skill: "specflow.reject")`

### `review_with_findings` (actionable_count > 0)

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Review complete — {RESULT_JSON.handoff.actionable_count} actionable finding(s): {RESULT_JSON.handoff.severity_summary}

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Auto-fix 実行** → auto-fix loop
- **手動修正** → `/specflow.fix_design`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "レビュー指摘: {severity_summary}\nauto-fix を実行しますか？"
  options:
    - label: "Auto-fix 実行"
      description: "自動修正を実行し、再レビューする"
    - label: "手動修正 (/specflow.fix_design)"
      description: "手動で修正した後に再レビューする"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

ユーザーの選択に応じて分岐:
- 「Auto-fix 実行」 → Step 6: Auto-fix Loop に進む
- 「手動修正 (/specflow.fix_design)」 → 手動修正誘導メッセージを表示し、`Skill(skill: "specflow.fix_design")` を実行する
- **スキップ/dismiss/タイムアウト時**: 「手動修正 (/specflow.fix_design)」を選択したものとして扱い、手動修正誘導メッセージを表示する

**手動修正誘導メッセージ**:
```
手動修正モードに進みます。/specflow.fix_design で指摘を修正し、再レビューしてください。
```

## Step 6: Auto-fix Loop

ユーザーが「Auto-fix 実行」を選択した場合、Bash orchestrator で auto-fix loop を実行する。

### Run Orchestrator

```bash
specflow-review-design autofix-loop <CHANGE_ID> --max-rounds <MAX_AUTOFIX_ROUNDS>
```

Capture stdout as `LOOP_JSON`. If the command fails (non-zero exit), display the error and **STOP**.

Parse `LOOP_JSON` as JSON. If parse fails, display raw output and **STOP**.

### Display Loop Summary

```
Auto-fix Loop Complete (Plan):
  - Total rounds: {LOOP_JSON.autofix.total_rounds}
  - Result: {LOOP_JSON.autofix.result}
  - Reason: {LOOP_JSON.autofix.result == "success" ? "unresolved high = 0" : LOOP_JSON.autofix.result}
  - Remaining actionable: {LOOP_JSON.handoff.actionable_count} ({LOOP_JSON.handoff.severity_summary})
```

**スコア推移テーブル**（`LOOP_JSON.autofix.round_scores` が 1 件以上の場合に表示）:
```
| Round | Score | Unresolved High | New High |
|-------|-------|-----------------|----------|
| 1     | 12    | 3               | 1        |
| 2     | 9     | 2               | 0        |
```

**Divergence 警告履歴**（`LOOP_JSON.autofix.divergence_warnings` が 1 件以上の場合に表示）:
```
Divergence Warnings:
  - Round {round}: {type} ({detail})
  - Round {round}: {type} ({detail})
```
`divergence_warnings` が空の場合、この警告履歴セクションは表示しない。

### Ledger Summary Display (Loop)

Use `LOOP_JSON.ledger` to display the same ledger summary format as Step 4:
```
Review Ledger (Plan): Round {round} | Status: {status} | Findings: {new} new, {open} open, {resolved} resolved
```
If `round_summaries` has more than 1 entry, show the compact progress table and round-over-round diff.

### Loop Handoff (based on LOOP_JSON.handoff.state)

#### `loop_no_findings` (actionable_count == 0)

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Auto-fix complete — all findings resolved

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **実装に進む** → `/specflow.apply`
- **Reject** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "Auto-fix loop 完了（成功）。次のアクションを選択してください"
  options:
    - label: "実装に進む"
      description: "specflow で実装を実行"
    - label: "Reject"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

- 「実装に進む」 → `Skill(skill: "specflow.apply")`
- 「Reject」 → `Skill(skill: "specflow.reject")`

#### `loop_with_findings` (actionable_count > 0)

残存する actionable findings の severity_summary を `LOOP_JSON.handoff.severity_summary` から取得。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
⚠ Auto-fix stopped — {LOOP_JSON.autofix.result == "success" ? "success (high resolved, lower-severity remaining)" : "max rounds reached"}. Remaining: {LOOP_JSON.handoff.severity_summary}

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **手動修正** → `/specflow.fix_design`
- **実装に進む** → `/specflow.apply`
- **Reject** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "Auto-fix loop 停止（{result_reason}）。残存指摘: {severity_summary}\n次のアクションを選択してください"
  options:
    - label: "手動修正 (/specflow.fix_design)"
      description: "残りの指摘を手動で修正して再レビュー"
    - label: "実装に進む"
      description: "現状で実装に進む"
    - label: "Reject"
      description: "全変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。

- 「手動修正 (/specflow.fix_design)」 → `Skill(skill: "specflow.fix_design")`
- 「実装に進む」 → `Skill(skill: "specflow.apply")`
- 「Reject」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** 全ハンドオフポイントで Dual-Display Fallback Pattern を適用すること — テキストプロンプトと AskUserQuestion の両方を必ず表示する。

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, design, tasks, review-ledger-design, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
- Ledger file is `FEATURE_DIR/review-ledger-design.json` (NOT `review-ledger.json`).
- Phase is `"design"` in ledger JSON.
- Auto-fix loop calls `specflow-review-design autofix-loop` (NOT `specflow.fix_apply`).
- ALL control flow logic (Codex invocation, ledger CRUD, finding matching, score computation, current-phase generation) is handled by the `specflow-review-design` orchestrator. This slash command only calls the orchestrator, parses its JSON output, and displays UI.
