---
description: Design/Tasks のレビュー指摘を修正し、再度 Codex review を実行
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
     2. `/specflow.fix_design` を再度実行
     ```
     → **STOP**.
2. Read `openspec/config.yaml`. Extract any relevant settings. If parse fails, display error and **STOP**.

## Setup


Determine `CHANGE_ID`:
- If `$ARGUMENTS` contains a change id (excluding `autofix`), use it.
- Otherwise, derive from the current branch name or prompt the user.

Verify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.

Derive the design and tasks file paths:
```
FEATURE_DIR = openspec/changes/<CHANGE_ID>
FEATURE_PROPOSAL = <FEATURE_DIR>/specs/*/spec.md (glob for the first match) or <FEATURE_DIR>/proposal.md as fallback
DESIGN_FILE = <FEATURE_DIR>/design.md
TASKS_FILE = <FEATURE_DIR>/tasks.md
```

Read all three files: `FEATURE_PROPOSAL`, `DESIGN_FILE`, `TASKS_FILE`.

### Autofix Detection

If `$ARGUMENTS` contains `autofix` → set `AUTOFIX_MODE = true`. Otherwise `AUTOFIX_MODE = false`.

## Step 1: Apply Design/Tasks Fixes


Based on the review findings from the previous step (the user has just seen them), apply fixes to address all findings:
- Completeness gaps (missing acceptance criteria coverage)
- Ordering issues (incorrect task dependencies)
- Granularity problems (tasks too large or too small)
- Feasibility concerns (technically unsound approaches)
- Scope violations (unnecessary work)
- Consistency issues (tasks not matching design decisions)

Update `DESIGN_FILE` and/or `TASKS_FILE` as needed. If a finding requires fundamental restructuring, re-run the relevant specflow command (specflow.design or specflow.tasks).

Report what was fixed.

## Step 2: Run Orchestrator for Re-review


Run the Bash orchestrator:

**Autofix mode** (`AUTOFIX_MODE = true`):
```bash
specflow-review-design fix-review <CHANGE_ID> --autofix
```

**通常モード** (`AUTOFIX_MODE = false`):
```bash
specflow-review-design fix-review <CHANGE_ID>
```

Capture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.

Parse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.

## Step 3: Handle Ledger Recovery


If `RESULT_JSON.ledger_recovery == "prompt_user"`:

The ledger was corrupt and no backup was available. Use `AskUserQuestion` to ask the user:

```
AskUserQuestion:
  question: "review-ledger-design.json が破損しており、バックアップもありません。新規 ledger を作成しますか？ (既存データは失われます)"
  options:
    - label: "新規作成"
      description: "空の ledger を作成して再レビューを実行"
    - label: "中止"
      description: "ワークフローを停止"
```

- 「新規作成」 → Re-run the orchestrator with `--reset-ledger`:
  ```bash
  specflow-review-design fix-review <CHANGE_ID> --reset-ledger
  ```
  (add `--autofix` if `AUTOFIX_MODE = true`)
  Capture and parse again as `RESULT_JSON`, then continue from Step 4.
- 「中止」 → **STOP**.

## Step 4: Handle Error Results


If `RESULT_JSON.status == "error"`:
- Display `RESULT_JSON.error` → **STOP**.

## Step 5: Display Review Results


### Re-review Classification (if RESULT_JSON.rereview_classification is not null)

Display the classified results before the standard findings table:

```
### Re-review Classification

**Resolved** ({count of RESULT_JSON.rereview_classification.resolved}):
| ID | Note |
|----|------|
| R1-F01 | fixed ordering issue |

**Still Open** ({count of RESULT_JSON.rereview_classification.still_open}):
| ID | Severity | Note |
|----|----------|------|
| R1-F02 | high | still unresolved |

**New Findings** ({count of RESULT_JSON.rereview_classification.new_findings}):
| ID | Severity | Category | Title |
|----|----------|----------|-------|
| F3 | medium | completeness | missing test coverage |
```

### Review Findings

If `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.

Otherwise display:
```
Codex Design/Tasks Review (after fix)

**Decision:** <RESULT_JSON.review.decision>
**Summary:** <RESULT_JSON.review.summary>

| # | Severity | Category | Title | Detail |
|---|----------|----------|-------|--------|
| P1 | high | completeness | ... | ... |
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

Report: `current-phase.md updated` (the orchestrator generates this automatically).

## Handoff: 次のアクション選択


**Auto-fix mode check**: `AUTOFIX_MODE = true` の場合、このコマンドは auto-fix loop から呼び出されている。ハンドオフ（AskUserQuestion）は **スキップ** し、ここで処理を終了する。制御は呼び出し元の auto-fix loop に戻り、ループ側が停止条件を判定する。

**通常モード**（`AUTOFIX_MODE = false`）:

レビュー結果を表示した後、Dual-Display Fallback Pattern に従い、テキストプロンプトを先に表示してから AskUserQuestion を呼び出す。

**テキストプロンプト（AskUserQuestion の前に必ず表示）**:
```
✅ Fix & re-review complete

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **実装に進む** → `/specflow.apply`
- **Design を修正** → `/specflow.fix_design`
- **中止** → `/specflow.reject`
```

**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:
```
AskUserQuestion:
  question: "次のアクションを選択してください"
  options:
    - label: "実装に進む"
      description: "specflow で実装を実行"
    - label: "Design を修正"
      description: "レビュー指摘に基づいて Design/Tasks を再修正し再レビュー"
    - label: "中止"
      description: "変更を破棄して終了"
```

**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。

ユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:
- 「実装に進む」 → `Skill(skill: "specflow.apply")`
- 「Design を修正」 → `Skill(skill: "specflow.fix_design")`
- 「中止」 → `Skill(skill: "specflow.reject")`

**IMPORTANT:** Do NOT present next-action choices as text. 必ず Dual-Display Fallback Pattern（テキストプロンプト + AskUserQuestion の両方）を使うこと。

## Important Rules


- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.
- All artifacts (proposal, design, tasks, review-ledger-design, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.
- If any tool call fails, report the error and ask the user how to proceed.
- ALL control flow logic (Codex invocation, ledger detection/CRUD, finding matching, current-phase generation) is handled by the `specflow-review-design fix-review` orchestrator. This slash command applies fixes (LLM), then calls the orchestrator for re-review, parses its JSON output, and displays UI.


## Run State Hooks

### Design Revision Loop

Record the design self-transition before re-reviewing.

```bash
specflow-run advance "<CHANGE_ID>" revise_design
```
