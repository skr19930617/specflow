---
description: 実装を承認し、Archive → コミット → Push → PR 作成
---
## User Input

```text
$ARGUMENTS
```

## Step 0.5: Read Current Phase Context

1. Resolve `FEATURE_DIR` from the current change id:
   - If `$ARGUMENTS` contains a change id, set `FEATURE_DIR=openspec/changes/<id>`.
   - Otherwise, detect the active change from the current branch name or prompt the user.
   - Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.
2. Check if `FEATURE_DIR/current-phase.md` exists (via Read tool — if not found, proceed silently).
3. If the file exists: read it and display as a summary block:
   ```
   Current Phase Context:
   <contents of current-phase.md>
   ```
4. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."

## Quality Gate

1. `FEATURE_DIR` は Step 0.5 で取得済み。

2. 全phaseのreview-ledgerを読み込む:

   **impl ledger** (`FEATURE_DIR/review-ledger.json`):
   - Read ツールで読み込む。
   - ファイルが存在しない場合 → `IMPL_LEDGER_AVAILABLE = false`
   - JSON パースに失敗した場合 → `IMPL_LEDGER_AVAILABLE = false`、`IMPL_LEDGER_PARSE_ERROR = true`
   - 正常に読み込めた場合 → `IMPL_LEDGER_AVAILABLE = true`

   **design ledger** (`FEATURE_DIR/review-ledger-design.json`):
   - Read ツールで読み込む。
   - ファイルが存在しない場合 → `DESIGN_LEDGER_AVAILABLE = false`（designレビュー未実施は正常）
   - JSON パースに失敗した場合 → `DESIGN_LEDGER_AVAILABLE = false`、`DESIGN_LEDGER_PARSE_ERROR = true`
   - 正常に読み込めた場合 → `DESIGN_LEDGER_AVAILABLE = true`

   **後方互換性**: `LEDGER_AVAILABLE` は `IMPL_LEDGER_AVAILABLE` のエイリアスとして維持する。

   いずれかのledgerが存在しない場合でも WARNING ではなく正常とする（全phaseがレビュー済みである必要はない）。
   全てのledgerが存在しない場合のみ以下を表示:
   ```
   ## Quality Gate: WARNING
   ⚠️ review-ledger が1つも見つかりません。Approval Summary は degraded mode で生成されます。
   ```

3. 全phaseの `status` フィールドで gate 判定を行う:
   - 利用可能な全ledgerの `status` を確認する。いずれかのledgerに `has_open_high` がある場合 → WARNING。
   - `status` が `has_open_high` の場合 → **WARNING として通過**（Approval Summary で unresolved high が表示される）。以下を表示:
     ```
     ## Quality Gate: WARNING

     ⚠️ review-ledger.json に未解決の high finding があります。
     Approval Summary に詳細が表示されます。
     ```
     続けて、`findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding を抽出し、以下のテーブル形式で表示する:
     ```
     | ID | Title | Status | Detail |
     |----|-------|--------|--------|
     | R1-F01 | ... | new | ... |
     ```
     `findings` が存在しない、または配列でない場合は、テーブル表示をスキップする。

   - `status` が `all_resolved` の場合 → **通過**。以下を表示:
     ```
     ## Quality Gate: PASSED
     ```
   - `status` が `in_progress` の場合 → **通過**。以下を表示:
     ```
     ## Quality Gate: PASSED
     ```
   - `status` が上記以外の未知の値の場合 → **WARNING として通過**。以下を表示:
     ```
     ## Quality Gate: WARNING
     ⚠️ 不明な ledger status です。Approval Summary で確認してください。
     ```
     `findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding があればテーブル表示する。`findings` が存在しないまたは配列でない場合は、テーブル表示をスキップする。

## Approval Summary Generation

**This section runs after Quality Gate passes and before Commit.**

### 1. Gather Inputs

1. `FEATURE_DIR` は Step 0.5 で取得済み。Set `FEATURE_PROPOSAL` to `<FEATURE_DIR>/specs/*/spec.md` (glob for the first match) or `<FEATURE_DIR>/proposal.md` as fallback.

2. Read `FEATURE_PROPOSAL` via Read tool. If the file does not exist or is empty, set `PROPOSAL_AVAILABLE = false`. Otherwise `PROPOSAL_AVAILABLE = true`.

3. Read `FEATURE_DIR/review-ledger.json` via Read tool. (Already loaded from Quality Gate — reuse `LEDGER_AVAILABLE` and `LEDGER_PARSE_ERROR` flags if set.)
   - If file exists and is valid JSON: set `LEDGER_AVAILABLE = true`.
   - If file is missing or empty: set `LEDGER_AVAILABLE = false`, `LEDGER_PARSE_ERROR = false`.
   - If file exists but JSON parse fails: set `LEDGER_AVAILABLE = false`, `LEDGER_PARSE_ERROR = true`.

4. Compute normalized diff source ONCE (all excluding `openspec/changes/<feature>/approval-summary.md`):
   ```bash
   git diff main...HEAD --name-only -- . ':(exclude)<FEATURE_DIR>/approval-summary.md'
   ```
   ```bash
   git diff main...HEAD --stat -- . ':(exclude)<FEATURE_DIR>/approval-summary.md'
   ```
   ```bash
   git diff main...HEAD -- . ':(exclude)<FEATURE_DIR>/approval-summary.md'
   ```
   ```bash
   git diff main...HEAD --diff-filter=A --name-only -- . ':(exclude)<FEATURE_DIR>/approval-summary.md'
   ```
   - If any git diff command fails (e.g., main branch not found): set `DIFF_AVAILABLE = false`. Otherwise `DIFF_AVAILABLE = true`.
   - Cache all four outputs for reuse by all sections below. The `--diff-filter=A` output provides the list of **newly added** files only (used by Remaining Risks section 2e).

### 2. Generate Summary Sections

Generate each section in the order below. Assemble them into the approval-summary.md content.

#### Header

```markdown
# Approval Summary: <feature-id>

**Generated**: <current timestamp>
**Branch**: <current branch name>
**Status**: ⚠️ <N> unresolved high | ✅ No unresolved high
```

The status line is determined after computing Review Loop Summary (step 2c):
- If `LEDGER_AVAILABLE` is false and `LEDGER_PARSE_ERROR` is true: `⚠️ Review data unavailable (parse error)`
- If `LEDGER_AVAILABLE` is false and not parse error: `⚠️ Review data unavailable`
- If `unresolved_high > 0`: `⚠️ <N> unresolved high`
- If `unresolved_high == 0`: `✅ No unresolved high`

#### 2a. What Changed

- If `DIFF_AVAILABLE`: Output the cached `git diff main...HEAD --stat` result.
- If not: Display `⚠️ Diff unavailable — file-based sections cannot be computed`.

#### 2b. Files Touched

- If `DIFF_AVAILABLE`: Output the cached `git diff main...HEAD --name-only` result.
- If not: Display `⚠️ Diff unavailable`.

#### 2c. Review Loop Summary

- For each available ledger (design, impl), compute from the `findings` array using these formulas:
  ```
  initial_high    = findings.filter(f => f.severity == "high" && f.origin_round == 1).length
  resolved_high   = findings.filter(f => f.severity == "high" && f.status == "resolved").length
  unresolved_high = findings.filter(f => f.severity == "high" && (f.status == "open" || f.status == "new")).length
  new_later_high  = findings.filter(f => f.severity == "high" && f.origin_round > 1).length
  ```
  Also include `current_round` from the ledger.

  Output as a **phase-separated** Markdown table:
  ```markdown
  ### Design Review
  | Metric             | Count |
  |--------------------|-------|
  | Initial high       | <n>   |
  | Resolved high      | <n>   |
  | Unresolved high    | <n>   |
  | New high (later)   | <n>   |
  | Total rounds       | <n>   |

  ### Impl Review
  | Metric             | Count |
  |--------------------|-------|
  | ... (same format)  |       |
  ```

  - Skip any phase whose ledger is not available (don't show the subsection).
  - If all ledgers have parse errors: Display `⚠️ review-ledger parse error — review data unavailable`.
  - If no ledgers exist: Display `⚠️ No review data available`.

#### 2d. Proposal Coverage

- If `PROPOSAL_AVAILABLE` AND `DIFF_AVAILABLE`:
  1. Extract acceptance criteria from `spec.md` using these formats in priority order:
     - **Given/When/Then**: Each numbered `**Given**/**When**/**Then**` line under `Acceptance Scenarios` subsections.
     - **Numbered scenarios**: Numbered lines (e.g., `1.`, `2.`) under `Acceptance Scenarios` that describe expected behavior.
     - **Bullet-style scenarios**: Bullet points under User Story sections that describe acceptance conditions (e.g., `- US1: ...`, `- Given ... When ... Then ...`).
     - **Fallback**: `Functional Requirements` (each `FR-NNN` bullet).
     Use whichever format the spec actually uses. The LLM should recognize the acceptance criteria regardless of formatting style.
  2. LLM reads these criteria and the cached full diff, then maps each criterion to the changed files that implement it.
  3. Output as a Markdown table:
     ```markdown
     | # | Criterion (summary) | Covered? | Mapped Files |
     |---|---------------------|----------|--------------|
     | 1 | ...                 | Yes      | file1, file2 |
     | 2 | ...                 | No       | —            |
     ```
  4. Compute and display: `**Coverage Rate**: <covered>/<total> (<percentage>%)`
  5. Store the list of uncovered criteria for Remaining Risks.
  6. Store covered/total counts for terminal summary.
- If `PROPOSAL_AVAILABLE` is false: Display `⚠️ Proposal not found — coverage cannot be computed`.
- If `DIFF_AVAILABLE` is false: Display `⚠️ Diff unavailable — coverage cannot be computed`.
- If spec has no recognizable criteria: Display `⚠️ No criteria found`.

#### 2e. Remaining Risks

Three sources, in order:

1. **Deterministic risks** (requires `LEDGER_AVAILABLE`):
   Extract findings where `(status == "open" || status == "new") && (severity == "medium" || severity == "high")`.
   List each as: `- <id>: <title> (severity: <sev>)`.
   If `LEDGER_PARSE_ERROR` is true: Display `⚠️ review-ledger.json parse error — review data unavailable`.
   If ledger is missing (not parse error): Display `⚠️ No review data available`.

2. **Untested new files** (requires `DIFF_AVAILABLE` and `LEDGER_AVAILABLE`):
   From the cached `--diff-filter=A` output (newly added files only), find `.sh` or `.md` files — excluding `openspec/changes/*/spec.md`, `openspec/changes/*/design.md`, `openspec/changes/*/tasks.md`, `openspec/changes/*/approval-summary.md` — whose path does not appear in any finding's `file` field.
   List as warnings: `- ⚠️ New file not mentioned in review: <path>`.

3. **Uncovered criteria** (from Proposal Coverage):
   List criteria with `Covered? = No` from section 2d.
   `- ⚠️ Uncovered criterion: <criterion summary>`.

#### 2f. Human Checkpoints

LLM reads spec, review-ledger findings, and diff to generate 3–5 actionable checkpoints requiring human judgment. Output as a checkbox list:
```markdown
- [ ] <checkpoint 1>
- [ ] <checkpoint 2>
- [ ] <checkpoint 3>
```
Each checkpoint must be specific to this feature, not generic boilerplate.
- If some inputs are unavailable, generate from whatever is available.

### 3. Write Summary File

Write the assembled content (header + all 6 sections) to `FEATURE_DIR/approval-summary.md` via Write tool.

After writing the summary file, update the run state if a specflow run exists for this change:
```bash
if specflow-run status "<CHANGE_ID>" >/dev/null 2>&1; then
  specflow-run update-field "<CHANGE_ID>" last_summary_path "<FEATURE_DIR>/approval-summary.md"
fi
```
(Only attempts the update if the run exists; real errors are surfaced.)

### 4. Terminal Summary and User Confirmation

Display a concise terminal summary:
```
## Approval Summary

**Unresolved High**: <N>
**Proposal Coverage**: <covered>/<total> (<percentage>%) [omit if unavailable]
**Remaining Risks**: <count>
```

If any sections are degraded, add: `⚠️ Degraded: <list of degraded section names>`

Then use `AskUserQuestion` to prompt the user:
- **Question**: "Approval Summary を確認しました。approve を続行しますか？"
- **Options**:
  - "続行" — proceed with commit
  - "中止" — abort the approve flow

If the user chooses "中止": display `"Approve を中止しました。"` and **STOP** (do not proceed to Commit).

### 5. Staging Confirmation

The Commit section uses `git add -A` which stages all files including `openspec/changes/<feature>/approval-summary.md`. No additional git add is needed.

## Archive

After the Approval Summary is generated, archive the change:

```bash
openspec archive "<CHANGE_ID>"
```

If the archive command succeeds:
- Set `ARCHIVE_SUCCESS = true`
- Report: `Change archived: openspec/changes/archive/<date>-<CHANGE_ID>/`

If the archive command fails (non-zero exit code):
- Set `ARCHIVE_SUCCESS = false`
- Display the error as a warning and continue with the Commit → Push → PR flow:
  ```
  ⚠️ Archive に失敗しました: <error details>
  コミット・PR 作成は続行します。後で手動で `openspec archive` を実行してください。
  ```

## Commit

1. `git status` で変更ファイルを確認し一覧をユーザーに表示する。
2. `git diff --stat` で変更量を表示する。
3. `FEATURE_PROPOSAL` は Step 0.5 / Approval Summary で取得済み。proposal の内容を読む。

4. proposal の内容に基づいてコミットメッセージを生成する。フォーマット:
   ```
   <type>: <short summary> (#<issue-number>)

   <body — what was implemented and why>

   Issue: <issue-url>
   ```
   - `<type>` は feat / fix / refactor / docs / chore などから適切なものを選ぶ
   - issue-number と issue-url は proposal ファイルの Source URL / Issue Number から取得する

5. 生成したコミットメッセージをユーザーに表示する。

6. コミットを実行:
   ```bash
   git add -A
   ```
   続いて `git commit` を実行する。

## Push & Pull Request

1. 現在のブランチ名を取得:
   ```bash
   git branch --show-current
   ```

2. リモートに同名ブランチで push:
   ```bash
   git push -u origin <branch-name>
   ```

3. デフォルトブランチを取得:
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```

4. PR のタイトルと本文を生成する:
   - **タイトル**: コミットメッセージの1行目をそのまま使う
   - **本文**: 以下のフォーマット
     ```markdown
     ## Summary
     <proposal の Acceptance Criteria や実装内容を箇条書きで 3-5 行>

     ## Issue
     Closes <issue-url>
     ```

5. `gh pr create` で PR を作成する:
   ```bash
   gh pr create --title "<title>" --body "<body>" --base <default-branch>
   ```

6. PR 作成後、PR の URL をユーザーに表示する。

If `ARCHIVE_SUCCESS = true`:
  Report: "Implementation approved, committed, PR created: `<PR-URL>`, change archived." → **END**.

If `ARCHIVE_SUCCESS = false`:
  Report: "Implementation approved, committed, PR created: `<PR-URL>`. ⚠️ Archive failed — run `openspec archive` manually." → **END**.

## Run State Hooks

### Apply Acceptance

When approve completes successfully, advance the run to approved and store the summary path.

```bash
specflow-run update-field "<CHANGE_ID>" last_summary_path "<FEATURE_DIR>/approval-summary.md"
specflow-run advance "<CHANGE_ID>" accept_apply
```
