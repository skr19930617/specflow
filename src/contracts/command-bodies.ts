import type { CommandBody } from "../types/contracts.js";

export const commandBodies: Record<string, CommandBody> = {
	"specflow.apply": {
		frontmatter: {
			description: "specflow で実装を適用し、Codex で実装レビュー",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.apply` を再度実行\n     ```\n     → **STOP**.\n2. Read `openspec/config.yaml`. Extract `max_autofix_rounds` if present. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.",
			},
			{
				title: "Step 0.5: Read Current Phase Context",
				content:
					'\n1. Determine `CHANGE_ID`:\n   - If `$ARGUMENTS` contains a change id, use it.\n   - Otherwise, derive from the current branch name or prompt the user.\n2. Verify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.\n3. Read the current run phase when available:\n   ```bash\n   specflow-run get-field "<CHANGE_ID>" current_phase\n   ```\n4. `/specflow.apply` starts only from `design_ready`.\n   - If current phase is `design_ready`, the run hook advances to `apply_draft` before implementation begins.\n   - If current phase is already `apply_draft`, `apply_review`, or `apply_ready`, continue from the existing apply state.\n   - Otherwise display: `"design_ready に到達していません。先に /specflow.design を完了してください。"` → **STOP**.\n5. Check if `openspec/changes/<CHANGE_ID>/current-phase.md` exists (via Read tool — if not found, proceed silently).\n6. If the file exists: read it and display as a summary block:\n   ```\n   Current Phase Context:\n   <contents of current-phase.md>\n   ```',
			},
			{
				title: "Step 0.7: Get Apply Instructions from OpenSpec",
				content:
					'\n1. Run the following command via Bash:\n   ```bash\n   openspec instructions apply --change "<CHANGE_ID>" --json\n   ```\n2. Parse the JSON output. It contains:\n   - `contextFiles`: file paths to read for context (varies by schema)\n   - `progress`: total, complete, remaining task counts\n   - `tasks`: task list with status\n   - `instruction`: dynamic instruction based on current state\n   - `state`: current workflow state\n3. Handle states:\n   - If `state` is `"blocked"` (missing artifacts):\n     ```\n     ⚠️ 必要なアーティファクトが不足しています。\n\n     先に `/specflow.design` を実行してください。\n     ```\n     → **STOP**.\n   - If `state` is `"all_done"`:\n     ```\n     ✅ すべてのタスクが完了しています！\n\n     次のステップ: `/specflow.approve` で承認・PR 作成に進みましょう。\n     ```\n     → **STOP**.\n   - Otherwise: proceed to Step 1.\n4. Read each file listed in `contextFiles` using the Read tool before proceeding. These provide implementation context that varies by project schema.',
			},
			{
				title: "Step 1: Apply Draft and Implement",
				content:
					"\n1. Confirm the run is in `apply_draft`.\n2. Load `openspec/changes/<CHANGE_ID>/tasks.md` and `openspec/changes/<CHANGE_ID>/design.md`.\n3. Execute tasks phase-by-phase.\n4. Mark completed tasks in `openspec/changes/<CHANGE_ID>/tasks.md`.\n5. Validate implementation against `openspec/changes/<CHANGE_ID>/proposal.md`.\n\nReport: `Step 1 complete — implementation completed in apply_draft`",
			},
			{
				title: "Step 2: Apply Review Gate",
				content:
					'\n1. Enter the review gate:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" review_apply\n   ```\n2. Continue by invoking the `/specflow.review_apply` workflow.\n3. If review findings remain, loop back to `apply_draft`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" revise_apply\n   ```\n   Do **not** offer `/specflow.approve` while findings remain.\n4. If the review is approved, enter `apply_ready`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" apply_review_approved\n   ```\n5. Only from `apply_ready`, offer `/specflow.approve`.\n\nIf the configured round cap is reached and findings remain, stop in place without an approve bypass.',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, design, tasks, current-phase, review-ledger) are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.",
			},
		],
	},
	"specflow.approve": {
		frontmatter: {
			description: "実装を承認し、Archive → コミット → Push → PR 作成",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Step 0.5: Read Current Phase Context",
				content:
					'\n1. Resolve `FEATURE_DIR` from the current change id:\n   - If `$ARGUMENTS` contains a change id, set `FEATURE_DIR=openspec/changes/<id>`.\n   - Otherwise, detect the active change from the current branch name or prompt the user.\n   - Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.\n2. `/specflow.approve` is valid only from `apply_ready`.\n   ```bash\n   specflow-run get-field "<CHANGE_ID>" current_phase\n   ```\n   If the phase is not `apply_ready`, display: `"apply_ready に到達していません。先に /specflow.apply の review gate を完了してください。"` → **STOP**.\n3. Check if `FEATURE_DIR/current-phase.md` exists (via Read tool — if not found, proceed silently).\n4. If the file exists: read it and display as a summary block:\n   ```\n   Current Phase Context:\n   <contents of current-phase.md>\n   ```',
			},
			{
				title: "Quality Gate",
				content:
					"\n1. `FEATURE_DIR` は Step 0.5 で取得済み。\n\n2. 全phaseのreview-ledgerを読み込む:\n\n   **impl ledger** (`FEATURE_DIR/review-ledger.json`):\n   - Read ツールで読み込む。\n   - ファイルが存在しない場合 → `IMPL_LEDGER_AVAILABLE = false`\n   - JSON パースに失敗した場合 → `IMPL_LEDGER_AVAILABLE = false`、`IMPL_LEDGER_PARSE_ERROR = true`\n   - 正常に読み込めた場合 → `IMPL_LEDGER_AVAILABLE = true`\n\n   **design ledger** (`FEATURE_DIR/review-ledger-design.json`):\n   - Read ツールで読み込む。\n   - ファイルが存在しない場合 → `DESIGN_LEDGER_AVAILABLE = false`（designレビュー未実施は正常）\n   - JSON パースに失敗した場合 → `DESIGN_LEDGER_AVAILABLE = false`、`DESIGN_LEDGER_PARSE_ERROR = true`\n   - 正常に読み込めた場合 → `DESIGN_LEDGER_AVAILABLE = true`\n\n   **後方互換性**: `LEDGER_AVAILABLE` は `IMPL_LEDGER_AVAILABLE` のエイリアスとして維持する。\n\n   いずれかのledgerが存在しない場合でも WARNING ではなく正常とする（全phaseがレビュー済みである必要はない）。\n   全てのledgerが存在しない場合のみ以下を表示:\n   ```\n   ## Quality Gate: WARNING\n   ⚠️ review-ledger が1つも見つかりません。Approval Summary は degraded mode で生成されます。\n   ```\n\n3. 全phaseの `status` フィールドで gate 判定を行う:\n   - 利用可能な全ledgerの `status` を確認する。いずれかのledgerに `has_open_high` がある場合 → WARNING。\n   - `status` が `has_open_high` の場合 → **WARNING として通過**（Approval Summary で unresolved high が表示される）。以下を表示:\n     ```\n     ## Quality Gate: WARNING\n\n     ⚠️ review-ledger.json に未解決の high finding があります。\n     Approval Summary に詳細が表示されます。\n     ```\n     続けて、`findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding を抽出し、以下のテーブル形式で表示する:\n     ```\n     | ID | Title | Status | Detail |\n     |----|-------|--------|--------|\n     | R1-F01 | ... | new | ... |\n     ```\n     `findings` が存在しない、または配列でない場合は、テーブル表示をスキップする。\n\n   - `status` が `all_resolved` の場合 → **通過**。以下を表示:\n     ```\n     ## Quality Gate: PASSED\n     ```\n   - `status` が `in_progress` の場合 → **通過**。以下を表示:\n     ```\n     ## Quality Gate: PASSED\n     ```\n   - `status` が上記以外の未知の値の場合 → **WARNING として通過**。以下を表示:\n     ```\n     ## Quality Gate: WARNING\n     ⚠️ 不明な ledger status です。Approval Summary で確認してください。\n     ```\n     `findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding があればテーブル表示する。`findings` が存在しないまたは配列でない場合は、テーブル表示をスキップする。",
			},
			{
				title: "Approval Summary Generation",
				content:
					'\n**This section runs after Quality Gate passes and before Archive.**\n\n### 1. Gather Inputs\n\n1. `FEATURE_DIR` は Step 0.5 で取得済み。Set `FEATURE_PROPOSAL` to `<FEATURE_DIR>/specs/*/spec.md` (glob for the first match) or `<FEATURE_DIR>/proposal.md` as fallback.\n\n2. Read `FEATURE_PROPOSAL` via Read tool. If the file does not exist or is empty, set `PROPOSAL_AVAILABLE = false`. Otherwise `PROPOSAL_AVAILABLE = true`.\n\n3. Read `FEATURE_DIR/review-ledger.json` via Read tool. (Already loaded from Quality Gate — reuse `LEDGER_AVAILABLE` and `LEDGER_PARSE_ERROR` flags if set.)\n   - If file exists and is valid JSON: set `LEDGER_AVAILABLE = true`.\n   - If file is missing or empty: set `LEDGER_AVAILABLE = false`, `LEDGER_PARSE_ERROR = false`.\n   - If file exists but JSON parse fails: set `LEDGER_AVAILABLE = false`, `LEDGER_PARSE_ERROR = true`.\n\n4. Compute normalized diff source ONCE against the current pending approval diff (all excluding `openspec/changes/<feature>/approval-summary.md`):\n   ```bash\n   git diff HEAD --name-only -- . \':(exclude)<FEATURE_DIR>/approval-summary.md\'\n   ```\n   ```bash\n   git diff HEAD --stat -- . \':(exclude)<FEATURE_DIR>/approval-summary.md\'\n   ```\n   ```bash\n   git diff HEAD -- . \':(exclude)<FEATURE_DIR>/approval-summary.md\'\n   ```\n   ```bash\n   git diff HEAD --diff-filter=A --name-only -- . \':(exclude)<FEATURE_DIR>/approval-summary.md\'\n   ```\n   - If any git diff command fails: set `DIFF_AVAILABLE = false`. Otherwise `DIFF_AVAILABLE = true`.\n   - Cache all four outputs for reuse by all sections below. The `--diff-filter=A` output provides the list of **newly added** files only (used by Remaining Risks section 2e).\n   - Treat this cached HEAD-based diff as the only approval diff source. Do **not** re-run `main...HEAD` style comparisons later in the flow.\n\n### 2. Generate Summary Sections\n\nGenerate each section in the order below. Assemble them into the approval-summary.md content.\n\n#### Header\n\n```markdown\n# Approval Summary: <feature-id>\n\n**Generated**: <current timestamp>\n**Branch**: <current branch name>\n**Status**: ⚠️ <N> unresolved high | ✅ No unresolved high\n```\n\nThe status line is determined after computing Review Loop Summary (step 2c):\n- If `LEDGER_AVAILABLE` is false and `LEDGER_PARSE_ERROR` is true: `⚠️ Review data unavailable (parse error)`\n- If `LEDGER_AVAILABLE` is false and not parse error: `⚠️ Review data unavailable`\n- If `unresolved_high > 0`: `⚠️ <N> unresolved high`\n- If `unresolved_high == 0`: `✅ No unresolved high`\n\n#### 2a. What Changed\n\n- If `DIFF_AVAILABLE`: Output the cached `git diff HEAD --stat` result.\n- If not: Display `⚠️ Diff unavailable — file-based sections cannot be computed`.\n\n#### 2b. Files Touched\n\n- If `DIFF_AVAILABLE`: Output the cached `git diff HEAD --name-only` result.\n- If not: Display `⚠️ Diff unavailable`.\n\n#### 2c. Review Loop Summary\n\n- For each available ledger (design, impl), compute from the `findings` array using these formulas:\n  ```\n  initial_high    = findings.filter(f => f.severity == "high" && f.origin_round == 1).length\n  resolved_high   = findings.filter(f => f.severity == "high" && f.status == "resolved").length\n  unresolved_high = findings.filter(f => f.severity == "high" && (f.status == "open" || f.status == "new")).length\n  new_later_high  = findings.filter(f => f.severity == "high" && f.origin_round > 1).length\n  ```\n  Also include `current_round` from the ledger.\n\n  Output as a **phase-separated** Markdown table:\n  ```markdown\n  ### Design Review\n  | Metric             | Count |\n  |--------------------|-------|\n  | Initial high       | <n>   |\n  | Resolved high      | <n>   |\n  | Unresolved high    | <n>   |\n  | New high (later)   | <n>   |\n  | Total rounds       | <n>   |\n\n  ### Impl Review\n  | Metric             | Count |\n  |--------------------|-------|\n  | ... (same format)  |       |\n  ```\n\n  - Skip any phase whose ledger is not available (don\'t show the subsection).\n  - If all ledgers have parse errors: Display `⚠️ review-ledger parse error — review data unavailable`.\n  - If no ledgers exist: Display `⚠️ No review data available`.\n\n#### 2d. Proposal Coverage\n\n- If `PROPOSAL_AVAILABLE` AND `DIFF_AVAILABLE`:\n  1. Extract acceptance criteria from `spec.md` using these formats in priority order:\n     - **Given/When/Then**: Each numbered `**Given**/**When**/**Then**` line under `Acceptance Scenarios` subsections.\n     - **Numbered scenarios**: Numbered lines (e.g., `1.`, `2.`) under `Acceptance Scenarios` that describe expected behavior.\n     - **Bullet-style scenarios**: Bullet points under User Story sections that describe acceptance conditions (e.g., `- US1: ...`, `- Given ... When ... Then ...`).\n     - **Fallback**: `Functional Requirements` (each `FR-NNN` bullet).\n     Use whichever format the spec actually uses. The LLM should recognize the acceptance criteria regardless of formatting style.\n  2. LLM reads these criteria and the cached full diff, then maps each criterion to the changed files that implement it.\n  3. Output as a Markdown table:\n     ```markdown\n     | # | Criterion (summary) | Covered? | Mapped Files |\n     |---|---------------------|----------|--------------|\n     | 1 | ...                 | Yes      | file1, file2 |\n     | 2 | ...                 | No       | —            |\n     ```\n  4. Compute and display: `**Coverage Rate**: <covered>/<total> (<percentage>%)`\n  5. Store the list of uncovered criteria for Remaining Risks.\n  6. Store covered/total counts for terminal summary.\n- If `PROPOSAL_AVAILABLE` is false: Display `⚠️ Proposal not found — coverage cannot be computed`.\n- If `DIFF_AVAILABLE` is false: Display `⚠️ Diff unavailable — coverage cannot be computed`.\n- If spec has no recognizable criteria: Display `⚠️ No criteria found`.\n\n#### 2e. Remaining Risks\n\nThree sources, in order:\n\n1. **Deterministic risks** (requires `LEDGER_AVAILABLE`):\n   Extract findings where `(status == "open" || status == "new") && (severity == "medium" || severity == "high")`.\n   List each as: `- <id>: <title> (severity: <sev>)`.\n   If `LEDGER_PARSE_ERROR` is true: Display `⚠️ review-ledger.json parse error — review data unavailable`.\n   If ledger is missing (not parse error): Display `⚠️ No review data available`.\n\n2. **Untested new files** (requires `DIFF_AVAILABLE` and `LEDGER_AVAILABLE`):\n   From the cached `--diff-filter=A` output (newly added files only), find `.sh` or `.md` files — excluding `openspec/changes/*/spec.md`, `openspec/changes/*/design.md`, `openspec/changes/*/tasks.md`, `openspec/changes/*/approval-summary.md` — whose path does not appear in any finding\'s `file` field.\n   List as warnings: `- ⚠️ New file not mentioned in review: <path>`.\n\n3. **Uncovered criteria** (from Proposal Coverage):\n   List criteria with `Covered? = No` from section 2d.\n   `- ⚠️ Uncovered criterion: <criterion summary>`.\n\n#### 2f. Human Checkpoints\n\nLLM reads spec, review-ledger findings, and diff to generate 3–5 actionable checkpoints requiring human judgment. Output as a checkbox list:\n```markdown\n- [ ] <checkpoint 1>\n- [ ] <checkpoint 2>\n- [ ] <checkpoint 3>\n```\nEach checkpoint must be specific to this feature, not generic boilerplate.\n- If some inputs are unavailable, generate from whatever is available.\n\n### 3. Write Summary File\n\nWrite the assembled content (header + all 6 sections) to `FEATURE_DIR/approval-summary.md` via Write tool.\n\nAfter writing the summary file, update the run state if a specflow run exists for this change:\n```bash\nif specflow-run status "<CHANGE_ID>" >/dev/null 2>&1; then\n  specflow-run update-field "<CHANGE_ID>" last_summary_path "<FEATURE_DIR>/approval-summary.md"\nfi\n```\n(Only attempts the update if the run exists; real errors are surfaced.)\n\n### 4. Terminal Summary and User Confirmation\n\nDisplay a concise terminal summary:\n```',
			},
			{
				title: "Approval Summary",
				content:
					'\n**Unresolved High**: <N>\n**Proposal Coverage**: <covered>/<total> (<percentage>%) [omit if unavailable]\n**Remaining Risks**: <count>\n```\n\nIf any sections are degraded, add: `⚠️ Degraded: <list of degraded section names>`\n\nThen use `AskUserQuestion` to prompt the user:\n- **Question**: "Approval Summary を確認しました。approve を続行しますか？"\n- **Options**:\n  - "続行" — proceed with commit\n  - "中止" — abort the approve flow\n\nIf the user chooses "中止": display `"Approve を中止しました。"` and **STOP** (do not proceed to Commit).\n\n### 5. Staging Confirmation\n\nThe Commit section uses `git add -A` which stages all files including `openspec/changes/<feature>/approval-summary.md`. No additional git add is needed.',
			},
			{
				title: "Archive",
				content:
					'\nAfter the Approval Summary is generated and the user chooses "続行", archive the change **before** commit and PR creation:\n\n```bash\nopenspec archive -y "<CHANGE_ID>"\n```\n\nIf the archive command succeeds:\n- Set `ARCHIVE_SUCCESS = true`\n- Set `ARCHIVED_FEATURE_DIR = openspec/changes/archive/<date>-<CHANGE_ID>` from the CLI output\n- Set `FINAL_SUMMARY_PATH = <ARCHIVED_FEATURE_DIR>/approval-summary.md`\n- Report: `Change archived: <ARCHIVED_FEATURE_DIR>/`\n\nIf the archive command fails (non-zero exit code):\n- Set `ARCHIVE_SUCCESS = false`\n- Set `ARCHIVED_FEATURE_DIR = ""`\n- Set `FINAL_SUMMARY_PATH = <FEATURE_DIR>/approval-summary.md`\n- Display the error as a warning and continue with the Commit → Push → PR flow:\n  ```\n  ⚠️ Archive に失敗しました: <error details>\n  コミット・PR 作成は続行します。後で手動で `openspec archive -y "<CHANGE_ID>"` を実行してください。\n  ```',
			},
			{
				title: "Commit",
				content:
					"\n1. `git status` で変更ファイルを確認し一覧をユーザーに表示する。\n2. `git diff --stat` で変更量を表示する。\n3. `FEATURE_PROPOSAL` は Step 0.5 / Approval Summary で取得済み。proposal の内容を読む。\n\n4. proposal の内容に基づいてコミットメッセージを生成する。フォーマット:\n   ```\n   <type>: <short summary> (#<issue-number>)\n\n   <body — what was implemented and why>\n\n   Issue: <issue-url>\n   ```\n   - `<type>` は feat / fix / refactor / docs / chore などから適切なものを選ぶ\n   - issue-number と issue-url は proposal ファイルの Source URL / Issue Number から取得する\n\n5. 生成したコミットメッセージをユーザーに表示する。\n\n6. コミットを実行:\n   ```bash\n   git add -A\n   ```\n   続いて `git commit` を実行する。",
			},
			{
				title: "Push & Pull Request",
				content:
					'\n1. 現在のブランチ名を取得:\n   ```bash\n   git branch --show-current\n   ```\n\n2. リモートに同名ブランチで push:\n   ```bash\n   git push -u origin <branch-name>\n   ```\n\n3. デフォルトブランチを取得:\n   ```bash\n   gh repo view --json defaultBranchRef --jq \'.defaultBranchRef.name\'\n   ```\n\n4. PR のタイトルと本文を生成する:\n   - **タイトル**: コミットメッセージの1行目をそのまま使う\n   - **本文**:\n     - issue-linked run の場合:\n       ```markdown\n       ## Summary\n       <proposal の Acceptance Criteria や実装内容を箇条書きで 3-5 行>\n\n       ## Issue\n       Closes <issue-url>\n       ```\n     - inline-spec run で issue metadata が無い場合:\n       ```markdown\n       ## Summary\n       <proposal の Acceptance Criteria や実装内容を箇条書きで 3-5 行>\n       ```\n\n5. `gh pr create` で PR を作成する:\n   ```bash\n   gh pr create --title "<title>" --body "<body>" --base <default-branch>\n   ```\n\n6. PR 作成後、PR の URL をユーザーに表示する。\n\n7. Finalize run state using the final summary path:\n   ```bash\n   if specflow-run status "<CHANGE_ID>" >/dev/null 2>&1; then\n     specflow-run update-field "<CHANGE_ID>" last_summary_path "$FINAL_SUMMARY_PATH"\n     specflow-run advance "<CHANGE_ID>" accept_apply\n   fi\n   ```\n\nIf `ARCHIVE_SUCCESS = true`:\n  Report: "Implementation approved, committed, PR created: `<PR-URL>`, change archived." → **END**.\n\nIf `ARCHIVE_SUCCESS = false`:\n  Report: "Implementation approved, committed, PR created: `<PR-URL>`. ⚠️ Archive failed — run `openspec archive -y "<CHANGE_ID>"` manually." → **END**.',
			},
		],
	},
	"specflow.dashboard": {
		frontmatter: {
			description:
				"全featureのレビュー台帳を集計し、ダッシュボードとして表示・保存",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					'\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing: `"❌ openspec/ ディレクトリが見つかりません。"` → **STOP**.',
			},
			{
				title: "Step 1: Discover Features",
				content:
					'\n1. Run via Bash to get the repository root:\n   ```bash\n   git rev-parse --show-toplevel\n   ```\n\n2. Get the list of active changes from OpenSpec:\n   ```bash\n   openspec list --json\n   ```\n   Parse the JSON to get the list of changes with their names and status.\n\n3. For each change, get artifact completion status:\n   ```bash\n   openspec status --change "<name>" --json\n   ```\n   Record the `schemaName`, artifact statuses, and task completion.\n\n4. If no changes found, display: `"レビュー対象のfeatureがありません。"` → **STOP**.',
			},
			{
				title: "Step 2: Collect Ledger Data",
				content:
					'\nFor each feature directory found in Step 1:\n\n1. Extract the feature name from the directory path (e.g., `openspec/changes/007-current-phase` → `007-current-phase`).\n\n2. Attempt to read each of the 2 ledger files via Read tool:\n   - `<feature_dir>/review-ledger-design.json` (design phase)\n   - `<feature_dir>/review-ledger.json` (impl phase)\n\n3. For each ledger file:\n   - **If file does not exist**: record phase as "missing"\n   - **If file exists but JSON parse fails**: record phase as "error"\n   - **If file exists and valid JSON**: extract:\n     - `rounds`: length of `round_summaries` array\n     - `finding_count`: length of `findings` array\n     - `resolved_count`: count of findings where `status == "resolved"`\n     - `resolution_rate`: if `finding_count > 0`, compute `resolved_count / finding_count * 100` (rounded to integer). If `finding_count == 0`, record as "-"',
			},
			{
				title: "Step 3: Generate Dashboard Table",
				content:
					'\nBuild a Markdown table with the following columns:\n\n```\n| Feature | Design Rounds | Design Findings | Design Rate | Impl Rounds | Impl Findings | Impl Rate |\n```\n\n### Display Value Mapping\n\nFor each phase cell:\n\n| State | Rounds | Findings | Rate |\n|-------|--------|----------|------|\n| Ledger file missing | `-` | `-` | `-` |\n| Ledger exists, findings empty | `<rounds>` | `0` | `-` |\n| Ledger exists, findings non-empty | `<rounds>` | `<count>` | `<rate>%` |\n| Ledger parse error | `⚠️` | `⚠️` | `⚠️` |\n\n### Table Footer\n\nAfter the table, display a summary line:\n```\n**Total**: <N> features | Design reviewed: <N> | Impl reviewed: <N>\n```\nWhere "reviewed" means the ledger file exists (regardless of error state).',
			},
			{
				title: "Step 4: Display and Save",
				content:
					"\n1. **Display in terminal**: Output the dashboard as a formatted CLI table. Use Markdown table syntax (which renders well in Claude Code's terminal output). Include the header, data rows, and summary line.\n\n2. **Save to file**: Write the dashboard to `openspec/review-dashboard.md` with the following format:\n\n```markdown\n# Review Dashboard\n\n**Generated**: <current timestamp in YYYY-MM-DD HH:MM format>\n**Repository**: <repository root directory name>\n\n<table from Step 3>\n\n<summary line from Step 3>\n```\n\nReport: `Dashboard saved to openspec/review-dashboard.md`",
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root as the base for all relative paths.\n- Never modify ledger files — read-only access.\n- If a feature directory exists but has no ledger files at all, include it in the table with all phases showing `-`.\n- Sort features by directory name (natural sort order).",
			},
		],
	},
	"specflow.decompose": {
		frontmatter: {
			description:
				"specの複雑さを分析し、issue-linked specはGitHub sub-issueに分解、inline specは警告を表示",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.decompose` を再度実行\n     ```\n     → **STOP**.\n2. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `specflow-init` を実行\n     2. `/specflow.decompose` を再度実行\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: Read Spec and Determine Mode",
				content:
					'\n1. Resolve `FEATURE_DIR` from the current change id:\n   - If `$ARGUMENTS` contains a change id, set `FEATURE_DIR=openspec/changes/<id>`.\n   - Otherwise, detect the active change from the current branch name or prompt the user.\n   - Verify `FEATURE_DIR` exists via Bash (`ls <FEATURE_DIR>/proposal.md`). If missing → **STOP** with error.\n   - Set `FEATURE_PROPOSAL` to `<FEATURE_DIR>/specs/*/spec.md` (glob for the first match) or `<FEATURE_DIR>/proposal.md` as fallback.\n2. Read the `FEATURE_PROPOSAL` file.\n3. Check if `/tmp/specflow-issue.json` exists (via Read tool).\n   - **If it exists and contains a valid `url` and `number` field**:\n     - **Stale state check**: Extract the issue `number` from the JSON. Find the spec\'s `**Input**:` line. Check if the Input line starts with a pattern that references the issue as the **primary source** — specifically: `GitHub Issue #<number>` or `Issue #<number>` or contains `issues/<number>` as a URL path segment. Do NOT match bare `#<number>` that could appear inside a quoted title (e.g., `"Follow-up to #39"` should not match issue 39 as the primary source). If the primary source pattern does not match, the JSON is stale from a previous run. Treat as `MODE = inline` and display: `"⚠️ /tmp/specflow-issue.json is stale (issue #<number> is not the primary source in current spec\'s Input). Treating as inline spec."`. Run `rm -f /tmp/specflow-issue.json` via Bash to clean up.\n     - If the issue matches: set `MODE = issue_linked`. Extract `PARENT_ISSUE_NUMBER`, `REPO` (as `owner/repo`), and the issue body.\n   - **If it does not exist or is invalid**: set `MODE = inline`.\n\nNote: Parent issue accessibility is validated later in Step 4, after the user confirms the decomposition proposal. This ensures no GitHub API calls are made before the user has a chance to cancel (FR-007).',
			},
			{
				title: "Step 2: AI Analysis",
				content:
					'\nAnalyze the spec content to identify independent functional areas. Determine one of three outcomes:\n\n**Instructions for analysis:**\nRead the proposal file and identify logically independent functional areas — groups of requirements that could be implemented and tested separately without depending on each other.\n\n**Outcome (a) — "decompose"**: The spec contains **2 or more** clearly independent functional areas. For each area, produce a structured sub-feature:\n- `phase_number`: sequential ordering (1, 2, 3...)\n- `title`: short descriptive title\n- `description`: scoped description of what this sub-feature covers\n- `requirements`: list of FR-IDs from the spec that belong to this sub-feature\n- `acceptance_criteria`: list of testable acceptance criteria for this sub-feature\n- `phase_total`: total number of sub-features\n\n**Outcome (b) — "no-action"**: The spec is well-scoped — it covers a single functional area or its areas are too tightly coupled to split meaningfully.\n→ Report: `"Spec is appropriately scoped. No decomposition needed."` → **STOP**.\n\n**Outcome (c) — "no-clear-split"**: The spec covers multiple topics but they are heavily interconnected, making independent implementation impractical.\n→ Report: `"Spec areas are interconnected. Recommend implementing as a single unit."` → **STOP**.\n\nOnly outcome (a) proceeds to Step 3.',
			},
			{
				title: "Step 3: Present Proposal (Issue-Linked) / Warn (Inline)",
				content:
					"\n### If `MODE = inline`:\n\nIf outcome (a) — spec has multiple independent areas:\nDisplay a warning:\n```\n⚠️ This spec is large and contains multiple independent functional areas:\n\n| # | Area | Requirements |\n|---|------|-------------|\n| 1 | <area title> | <FR-IDs> |\n| 2 | <area title> | <FR-IDs> |\n\nConsider splitting this into separate `/specflow` invocations, one per area.\nNo GitHub issues will be created (spec was not created from a GitHub issue URL).\n```\n→ **STOP**.\n\n### If `MODE = issue_linked`:\n\nGenerate a `run_timestamp` by running:\n```bash\ndate +%Y%m%d-%H%M%S\n```\nStore this value — it will be reused for retries.\n\nPresent the decomposition proposal using `AskUserQuestion`:\n\nDisplay:\n```",
			},
			{
				title: "Decomposition Proposal for Issue #<PARENT_ISSUE_NUMBER>",
				content:
					'\nThe spec contains <N> independent functional areas:\n\n| Phase | Title | Requirements | Acceptance Criteria |\n|-------|-------|-------------|-------------------|\n| 1 | <title> | <FR-IDs> | <criteria summary> |\n| 2 | <title> | <FR-IDs> | <criteria summary> |\n...\n```\n\nThen use `AskUserQuestion` with options:\n- **"Confirm — create <N> sub-issues"**: Proceed to Step 4\n- **"Cancel"**: Report `"No issues created."` → **STOP**',
			},
			{
				title: "Step 4: Validate Parent and Create Sub-Issues",
				content:
					'\n**First, validate the parent issue** (this is the first GitHub API call in the flow — after user confirmation per FR-007):\n\nRun via Bash:\n```bash\ngh issue view <PARENT_ISSUE_NUMBER> --repo <REPO> --json state\n```\n- If the command fails (issue deleted or unreachable): display error and **STOP**:\n  ```\n  ❌ Parent issue #<number> is not accessible. Please provide a valid issue URL.\n  ```\n- If the issue is closed: proceed normally (closed issues are valid decomposition targets).\n- If the issue is open: proceed normally.\n\n**Then, construct the JSON payload** matching the Data Contract input schema. **Always include `"skip_comment": true`** in the payload — the slash command will handle posting the summary comment after all issues are confirmed created (either on first success or after retry). This prevents duplicate per-batch comments.\n\n```json\n{\n  "parent_issue_number": <PARENT_ISSUE_NUMBER>,\n  "repo": "<REPO>",\n  "run_timestamp": "<RUN_TIMESTAMP>",\n  "sub_features": [\n    {\n      "phase_number": 1,\n      "title": "<title>",\n      "description": "<scoped description>",\n      "requirements": ["FR-001", "FR-002"],\n      "acceptance_criteria": ["Criteria 1", "Criteria 2"],\n      "phase_total": <N>\n    }\n  ]\n}\n```\n\nWrite the JSON payload to a temporary file and pipe it to the helper script. This avoids shell quoting issues with apostrophes or special characters in titles/descriptions:\n```bash\ncat /tmp/specflow-decompose-payload.json | specflow-create-sub-issues\n```\n\n**IMPORTANT**: Use the Write tool to create `/tmp/specflow-decompose-payload.json` with the JSON content. Do NOT use `echo` or shell string interpolation to pass JSON — this breaks on content containing apostrophes, quotes, or shell metacharacters.',
			},
			{
				title: "Step 5: Report Results",
				content:
					'\nRead the JSON output from the helper script.\n\n### If all issues created successfully (`failed` array is empty):\n\nPost the summary comment on the parent issue (since `skip_comment: true` was passed to the helper). Run via Bash:\n```bash\ngh issue comment <PARENT_ISSUE_NUMBER> --repo <REPO> --body "<formatted comment listing all sub-issues in phase order>"\n```\n\nThe comment body should list all created sub-issues in phase order:\n```',
			},
			{
				title: "Decomposition Sub-Issues",
				content:
					'\nThis issue has been decomposed into the following sub-issues:\n\n- **Phase 1**: #<number> — <title>\n- **Phase 2**: #<number> — <title>\n...\n\n_Decomposition run: <RUN_TIMESTAMP>_\n```\n\nIf the comment posting fails, display: `"⚠️ Summary comment could not be posted on parent issue #<number>. Please add the sub-issue links manually."`\n\nReport:\n```\n✅ Decomposition complete — <N> sub-issues created for #<PARENT_ISSUE_NUMBER>\n\n| Phase | Issue | Title |\n|-------|-------|-------|\n| 1 | #<number> | <title> |\n| 2 | #<number> | <title> |\n...\n\nSummary comment posted on parent issue: <✅ or ⚠️ Failed>\n```\n\n### If partial failure (`failed` array is non-empty):\n\nCheck `summary_comment_posted` — if false and there are created issues, note it in the report.\n\nUse `AskUserQuestion` to present the partial result:\n\nQuestion text:\n```\n⚠️ Partial failure — <created_count> created, <failed_count> failed.\n<if summary_comment_posted is false: "⚠️ Summary comment was NOT posted on parent issue.">\n\nCreated:\n<list of created issues with URLs>\n\nFailed:\n<list of failed items with error messages>\n```\n\nOptions:\n- **"Retry failed items"**: Construct a new payload with ONLY the failed items as `sub_features`, **reusing the original `run_timestamp`**, with `"skip_comment": true`. Re-run Step 4 with this retry payload. After the retry completes, combine `created` arrays from both the original run and the retry. If all issues are now created, post the consolidated summary comment (same as the all-success path above). This ensures FR-008 is satisfied with a single complete summary.\n- **"Cancel (keep created)"**: Report the partial result and **STOP**.',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- Never modify files inside `openspec/specs/` — read-only (current specs are the source of truth).\n- The `run_timestamp` MUST be generated once per decomposition run and reused for all retries within the same run.\n- If any tool call fails, report the error and ask the user how to proceed.",
			},
		],
	},
	"specflow.design": {
		frontmatter: {
			description:
				"specflow で design/tasks artifacts を生成し、Codex でレビュー",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					'\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.design` を再度実行\n     ```\n     → **STOP**.\n2. Determine the current change id from the branch name. Set `CHANGE_ID` accordingly.\n3. `/specflow.design` starts only from `spec_ready`.\n   ```bash\n   specflow-run get-field "<CHANGE_ID>" current_phase\n   ```\n   If the phase is `spec_ready`, the run hook advances to `design_draft`. If the phase is already `design_draft`, `design_review`, or `design_ready`, continue from the existing design state. Otherwise **STOP**.',
			},
			{
				title: "Step 1: Check Status",
				content:
					'\nRun:\n```bash\nopenspec status --change "<CHANGE_ID>" --json\n```\n\nParse the JSON output to get:\n- `applyRequires`: array of artifact IDs needed before implementation\n- `artifacts`: list with status and dependencies\n\nBefore continuing, confirm the planning handoff already completed:\n- `proposal` artifact status is `done`\n- `specs` artifact status is `done`\n\nIf `specs` is not `done`, stop and tell the user to return to `/specflow` to finish spec delta generation and validation first.\n\nIf the command fails, report the error and **STOP**.',
			},
			{
				title: "Step 2: Generate Artifacts in Dependency Order",
				content:
					'\nUse the orchestrator to discover the next ready artifact, then generate its content.\n\n### Artifact Loop\n\nRepeat the following until all `applyRequires` artifacts are complete:\n\n1. Run the orchestrator:\n   ```bash\n   specflow-design-artifacts next <CHANGE_ID>\n   ```\n\n2. Capture stdout as `ARTIFACT_JSON`. Parse as JSON.\n\n3. Handle result by `ARTIFACT_JSON.status`:\n\n   **`"complete"`** — All required artifacts are done. Exit the loop and proceed to Step 3.\n\n   **`"ready"`** — An artifact is ready for generation:\n   - `ARTIFACT_JSON.artifactId`: the artifact to create\n   - `ARTIFACT_JSON.outputPath`: where to write the file\n   - `ARTIFACT_JSON.template`: structure template\n   - `ARTIFACT_JSON.instruction`: generation instructions\n   - `ARTIFACT_JSON.dependencies`: list of `{id, path, done}` dependency artifacts\n\n   Actions:\n   a. Read each dependency artifact file listed in `ARTIFACT_JSON.dependencies` for context.\n   b. Create the artifact file at `ARTIFACT_JSON.outputPath` using `template` as the structure.\n   c. Apply `instruction` as constraints when writing the artifact content. Do **NOT** copy `instruction` verbatim into the file.\n   d. Report progress: `Created <artifactId>`\n   e. Continue the loop (call `next` again to get the next artifact).\n\n   **`"blocked"`** — No artifacts are ready and none are complete:\n   - `ARTIFACT_JSON.blocked`: array of blocked artifact IDs\n   - Report which artifacts are blocked and ask the user how to proceed.\n   - If the user cannot resolve, **STOP**.\n\n   **`"error"`** — The orchestrator encountered an error:\n   - Display `ARTIFACT_JSON.error` and **STOP**.',
			},
			{
				title: "Step 3: Verify Completion",
				content:
					'\nRun:\n```bash\nopenspec status --change "<CHANGE_ID>" --json\n```\n\nVerify that:\n- `design` artifact has `status: "done"`\n- `tasks` artifact has `status: "done"`\n- every artifact listed in `applyRequires` also has `status: "done"`\n\nIf any are incomplete, report which artifacts are missing and ask the user how to proceed.',
			},
			{
				title: "Step 4: Design Review Gate",
				content:
					'\n1. Enter the design review gate:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" review_design\n   ```\n2. Invoke the design review workflow:\n   ```\n   Skill(skill: "specflow.review_design")\n   ```\n3. If review findings remain, revise design artifacts and loop back to `design_draft`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" revise_design\n   ```\n4. If review is approved, enter `design_ready`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" design_review_approved\n   ```\n5. Only from `design_ready`, offer `/specflow.apply`.\n\nRemove any path that allows `/specflow.apply` while findings remain.',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- Artifact generation (Step 2) is driven by calling `specflow-design-artifacts next` in a loop. The LLM generates artifact content; the orchestrator manages the dependency graph and readiness.\n- `/specflow.design` does not run OpenSpec change validation; that validation belongs to the spec phase in `/specflow`.",
			},
		],
	},
	"specflow.explore": {
		frontmatter: {
			description: "openspec explore ベースの自由対話 → GitHub issue 起票",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     OpenSpec が初期化されていません。\n\n     次のステップで初期化してください:\n     1. `specflow-init` を実行\n     2. `/specflow.explore` を再度実行\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: Context Check",
				content:
					'\nRun via Bash:\n```bash\nopenspec list --json\n```\n\nParse the JSON to understand existing changes:\n- Active changes and their status\n- What the user might be working on\n\nDisplay a brief summary:\n```\nActive changes:\n- <name> (<status>)\n...\n```\n\nIf no changes exist, display: `"現在アクティブな change はありません。"`',
			},
			{
				title: "Step 2: Enter Explore Mode",
				content:
					"\n**This is a stance, not a workflow.** There are no fixed steps, no required sequence, no mandatory outputs. You are a thinking partner helping the user explore.\n\n### The Stance\n\n- **Curious, not prescriptive** — Ask questions that emerge naturally, don't follow a script\n- **Open threads, not interrogations** — Surface multiple interesting directions and let the user follow what resonates\n- **Visual** — Use ASCII diagrams liberally when they'd help clarify thinking\n- **Adaptive** — Follow interesting threads, pivot when new information emerges\n- **Patient** — Don't rush to conclusions, let the shape of the problem emerge\n- **Grounded** — Explore the actual codebase when relevant, don't just theorize\n\n### Initial Prompt\n\nIf `$ARGUMENTS` is non-empty, use it as the starting topic for exploration.\n\nIf `$ARGUMENTS` is empty, use `AskUserQuestion` (open-ended, no preset options) to ask:\n> \"何について探索しますか？アイデア、課題、技術的な調査など、自由に記述してください。\"\n\n### What You Might Do\n\nDepending on what the user brings:\n\n- **Explore the problem space** — Ask clarifying questions, challenge assumptions, reframe the problem, find analogies\n- **Investigate the codebase** — Map existing architecture, find integration points, identify patterns, surface hidden complexity\n- **Compare options** — Brainstorm approaches, build comparison tables, sketch tradeoffs\n- **Surface risks and unknowns** — Identify what could go wrong, find gaps in understanding\n\n### OpenSpec Awareness\n\nIf a change exists and is relevant to the discussion:\n1. Read existing artifacts (`openspec/changes/<name>/proposal.md`, `design.md`, `tasks.md` etc.)\n2. Reference them naturally in conversation\n3. Offer to capture decisions when they are made — but don't auto-capture\n\n### Guardrails\n\n- **Don't implement** — Never write application code. Creating OpenSpec artifacts (proposals, designs) is fine.\n- **Don't fake understanding** — If something is unclear, dig deeper\n- **Don't rush** — Exploration is thinking time, not task time\n- **Don't auto-capture** — Offer to save insights, don't just do it",
			},
			{
				title: "Step 3: Convergence Check",
				content:
					'\nWhen the discussion appears to be converging (a clear problem definition, approach, or scope has emerged), **proactively suggest wrapping up** — but don\'t force it.\n\nUse `AskUserQuestion` with the following options:\n\n**Question text:**\n```\n議論がまとまってきました。次のアクションを選択してください。\n```\n\n**Options:**\n- **"Issue として起票する"** — GitHub issue を作成して `/specflow` フローに繋げる\n- **"探索を続ける"** — 対話を継続\n- **"終了する"** — 探索を終了\n\n### If "Issue として起票する":\n\n1. Explore の議論内容から issue のタイトルと本文を生成する:\n   - **タイトル**: 簡潔な要約 (70文字以内)\n   - **本文**: 背景、目的、スコープ、受け入れ条件を含む構造化された記述\n\n2. 生成した issue 内容をユーザーに表示し、`AskUserQuestion` で確認:\n   - **"起票する"** — `gh issue create` を実行\n   - **"修正する"** — ユーザーが修正内容を入力 → 反映後に再確認\n   - **"やめる"** — 探索に戻る\n\n3. Issue 作成:\n   ```bash\n   gh issue create --title "<title>" --body "<body>"\n   ```\n\n4. 作成された issue の URL を表示:\n   ```\n   Issue を作成しました: <issue-url>\n\n   `/specflow <issue-url>` で proposal 作成フローに進めます。\n   ```\n   → **STOP**.\n\n### If "探索を続ける":\n\nStep 2 に戻り、対話を継続する。次の収束ポイントで再度 Step 3 を提示する。\n\n### If "終了する":\n\n探索の要約を表示する:\n```',
			},
			{
				title: "探索のまとめ",
				content:
					"\n**テーマ**: <what was explored>\n\n**わかったこと**: <key insights>\n\n**未解決の問題**: <open questions, if any>\n```\n→ **STOP**.",
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- This command is read-only — never write application code or modify existing implementation.\n- OpenSpec artifacts (proposals, designs) may be created if the user explicitly requests.\n- The convergence check (Step 3) is a suggestion, not a gate. The user controls when to stop.",
			},
		],
	},
	"specflow.fix_apply": {
		frontmatter: {
			description: "レビュー指摘を修正し、再度 Codex review を実行",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.fix_apply` を再度実行\n     ```\n     → **STOP**.",
			},
			{
				title: "Setup",
				content:
					"\nDetermine `CHANGE_ID`:\n- If `$ARGUMENTS` contains a change id (excluding `autofix`), use it.\n- Otherwise, derive from the current branch name or prompt the user.\n\nVerify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error. Read the proposal file.",
			},
			{
				title: "Step 0.5: Read Current Phase Context",
				content:
					'\n1. Use `CHANGE_ID` resolved in Setup.\n2. Check if `openspec/changes/<CHANGE_ID>/current-phase.md` exists (via Read tool — if not found, proceed silently).\n3. If the file exists: read it and display as a summary block:\n   ```\n   Current Phase Context:\n   <contents of current-phase.md>\n   ```\n4. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."',
			},
			{
				title: "Step 1: Run Orchestrator",
				content:
					"\nDetermine if autofix mode is active: check if `$ARGUMENTS` contains `autofix`.\n\nRun the Bash orchestrator:\n\n**Autofix mode** (`$ARGUMENTS` に `autofix` が含まれる場合):\n```bash\nspecflow-review-apply fix-review <CHANGE_ID> --autofix\n```\n\n**通常モード** (`$ARGUMENTS` に `autofix` が含まれない場合):\n```bash\nspecflow-review-apply fix-review <CHANGE_ID>\n```\n\nCapture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.",
			},
			{
				title: "Step 2: Handle Error Results",
				content:
					'\nIf `RESULT_JSON.status == "error"`:\n- If `RESULT_JSON.error == "no_changes"`: Display `"レビュー対象の変更がありません。"` → **STOP**.\n- Otherwise: Display `RESULT_JSON.error` → **STOP**.',
			},
			{
				title: "Step 3: Handle Diff Warning",
				content:
					'\nIf `RESULT_JSON.diff_summary.diff_warning == true`:\n\nDual-Display Fallback Pattern に従う:\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Diff size warning — {RESULT_JSON.diff_summary.total_lines} lines (threshold: {RESULT_JSON.diff_summary.threshold})\n\n続行しますか？（テキスト入力またはボタンで回答）:\n- **続行** → continue\n- **中止** → abort\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**: "続行"/"中止" options.\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\nIf "中止", skip review → **STOP**.\n\nIf "続行": re-run the orchestrator with diff warning bypass enabled and replace `RESULT_JSON` with the new output.\n```bash\nspecflow-review-apply fix-review <CHANGE_ID> --skip-diff-check\n```\nIf `$ARGUMENTS` contains `autofix`, preserve it:\n```bash\nspecflow-review-apply fix-review <CHANGE_ID> --autofix --skip-diff-check\n```\nCapture stdout again as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**. Parse the new `RESULT_JSON` as JSON before proceeding.',
			},
			{
				title: "Step 4: Display Review Results",
				content:
					'\n### Re-review Classification (if RESULT_JSON.review.rereview_mode == true)\n\nIf the review was a re-review, display the classified results before the standard findings table:\n\n```\n### Re-review Classification\n\n**Resolved** ({count}):\n| ID | Note |\n|----|------|\n| R1-F01 | fixed null check |\n\n**Still Open** ({count}):\n| ID | Severity | Note |\n|----|----------|------|\n| R1-F02 | high | still unresolved |\n\n**New Findings** ({count}):\n| ID | Severity | File | Title |\n|----|----------|------|-------|\n| F3 | medium | src/foo.ts | missing test |\n```\n\n### Review Findings\n\nIf `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.\n\nOtherwise display:\n```\nCodex Implementation Review (after fix)\n\n**Decision:** <RESULT_JSON.review.decision>\n**Summary:** <RESULT_JSON.review.summary>\n\n| # | Severity | File | Title | Detail |\n|---|----------|------|-------|--------|\n| F1 | high | src/foo.ts | ... | ... |\n```\n\n### Ledger Summary Display\n\nUse `RESULT_JSON.ledger` to display:\n```\nReview Ledger: Round {RESULT_JSON.ledger.round} | Status: {RESULT_JSON.ledger.status} | Findings: {RESULT_JSON.ledger.counts.new} new, {RESULT_JSON.ledger.counts.open} open, {RESULT_JSON.ledger.counts.resolved} resolved\n```\n\nIf `RESULT_JSON.ledger.round_summaries` has more than 1 entry, show a compact progress table:\n```\n| Round | Total | Open | New | Resolved | Overridden |\n|-------|-------|------|-----|----------|------------|\n| 1     | 5     | 0    | 0   | 3        | 2          |\n| 2     | 7     | 2    | 2   | 3        | 2          |\n```\nThen show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`',
			},
			{
				title: "Step 5: Handoff",
				content:
					'\n### Auto-fix mode check\n\n`$ARGUMENTS` に `autofix` が含まれる場合、このコマンドは auto-fix loop から呼び出されている。ハンドオフ（AskUserQuestion）は **スキップ** し、ここで処理を終了する。制御は呼び出し元の auto-fix loop に戻り、ループ側が停止条件を判定する。\n\n### 通常モード（`$ARGUMENTS` に `autofix` が含まれない場合）\n\nレビュー結果を表示した後、Dual-Display Fallback Pattern に従い、テキストプロンプトを先に表示してから AskUserQuestion を呼び出す。\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Fix & re-review complete\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Approve & Commit** → `/specflow.approve`\n- **Fix All** → `/specflow.fix_apply`\n- **Reject** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "次のアクションを選択してください"\n  options:\n    - label: "Approve & Commit"\n      description: "実装を承認してコミット・PR 作成"\n    - label: "Fix All"\n      description: "指摘をすべて再修正して再レビュー"\n    - label: "Reject"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。\n\nユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:\n- 「Approve & Commit」 → `Skill(skill: "specflow.approve")`\n- 「Fix All」 → `Skill(skill: "specflow.fix_apply")`\n- 「Reject」 → `Skill(skill: "specflow.reject")`\n\n**IMPORTANT:** テキストプロンプトと AskUserQuestion の両方を必ず表示すること（Dual-Display）。',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, review-ledger, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- ALL control flow logic (fix application, diff filtering, Codex invocation, ledger detection/update, finding matching, current-phase generation) is handled by the `specflow-review-apply fix-review` orchestrator. This slash command only calls the orchestrator, parses its JSON output, and displays UI.",
			},
		],
	},
	"specflow.fix_design": {
		frontmatter: {
			description:
				"Design/Tasks のレビュー指摘を修正し、再度 Codex review を実行",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.fix_design` を再度実行\n     ```\n     → **STOP**.\n2. Read `openspec/config.yaml`. Extract any relevant settings. If parse fails, display error and **STOP**.",
			},
			{
				title: "Setup",
				content:
					"\nDetermine `CHANGE_ID`:\n- If `$ARGUMENTS` contains a change id (excluding `autofix`), use it.\n- Otherwise, derive from the current branch name or prompt the user.\n\nVerify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.\n\nDerive the design and tasks file paths:\n```\nFEATURE_DIR = openspec/changes/<CHANGE_ID>\nFEATURE_PROPOSAL = <FEATURE_DIR>/specs/*/spec.md (glob for the first match) or <FEATURE_DIR>/proposal.md as fallback\nDESIGN_FILE = <FEATURE_DIR>/design.md\nTASKS_FILE = <FEATURE_DIR>/tasks.md\n```\n\nRead all three files: `FEATURE_PROPOSAL`, `DESIGN_FILE`, `TASKS_FILE`.\n\n### Autofix Detection\n\nIf `$ARGUMENTS` contains `autofix` → set `AUTOFIX_MODE = true`. Otherwise `AUTOFIX_MODE = false`.",
			},
			{
				title: "Step 1: Apply Design/Tasks Fixes",
				content:
					"\nBased on the review findings from the previous step (the user has just seen them), apply fixes to address all findings:\n- Completeness gaps (missing acceptance criteria coverage)\n- Ordering issues (incorrect task dependencies)\n- Granularity problems (tasks too large or too small)\n- Feasibility concerns (technically unsound approaches)\n- Scope violations (unnecessary work)\n- Consistency issues (tasks not matching design decisions)\n\nUpdate `DESIGN_FILE` and/or `TASKS_FILE` as needed. If a finding requires fundamental restructuring, re-run the relevant specflow command (specflow.design or specflow.tasks).\n\nReport what was fixed.",
			},
			{
				title: "Step 2: Run Orchestrator for Re-review",
				content:
					"\nRun the Bash orchestrator:\n\n**Autofix mode** (`AUTOFIX_MODE = true`):\n```bash\nspecflow-review-design fix-review <CHANGE_ID> --autofix\n```\n\n**通常モード** (`AUTOFIX_MODE = false`):\n```bash\nspecflow-review-design fix-review <CHANGE_ID>\n```\n\nCapture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.",
			},
			{
				title: "Step 3: Handle Ledger Recovery",
				content:
					'\nIf `RESULT_JSON.ledger_recovery == "prompt_user"`:\n\nThe ledger was corrupt and no backup was available. Use `AskUserQuestion` to ask the user:\n\n```\nAskUserQuestion:\n  question: "review-ledger-design.json が破損しており、バックアップもありません。新規 ledger を作成しますか？ (既存データは失われます)"\n  options:\n    - label: "新規作成"\n      description: "空の ledger を作成して再レビューを実行"\n    - label: "中止"\n      description: "ワークフローを停止"\n```\n\n- 「新規作成」 → Re-run the orchestrator with `--reset-ledger`:\n  ```bash\n  specflow-review-design fix-review <CHANGE_ID> --reset-ledger\n  ```\n  (add `--autofix` if `AUTOFIX_MODE = true`)\n  Capture and parse again as `RESULT_JSON`, then continue from Step 4.\n- 「中止」 → **STOP**.',
			},
			{
				title: "Step 4: Handle Error Results",
				content:
					'\nIf `RESULT_JSON.status == "error"`:\n- Display `RESULT_JSON.error` → **STOP**.',
			},
			{
				title: "Step 5: Display Review Results",
				content:
					'\n### Re-review Classification (if RESULT_JSON.rereview_classification is not null)\n\nDisplay the classified results before the standard findings table:\n\n```\n### Re-review Classification\n\n**Resolved** ({count of RESULT_JSON.rereview_classification.resolved}):\n| ID | Note |\n|----|------|\n| R1-F01 | fixed ordering issue |\n\n**Still Open** ({count of RESULT_JSON.rereview_classification.still_open}):\n| ID | Severity | Note |\n|----|----------|------|\n| R1-F02 | high | still unresolved |\n\n**New Findings** ({count of RESULT_JSON.rereview_classification.new_findings}):\n| ID | Severity | Category | Title |\n|----|----------|----------|-------|\n| F3 | medium | completeness | missing test coverage |\n```\n\n### Review Findings\n\nIf `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.\n\nOtherwise display:\n```\nCodex Design/Tasks Review (after fix)\n\n**Decision:** <RESULT_JSON.review.decision>\n**Summary:** <RESULT_JSON.review.summary>\n\n| # | Severity | Category | Title | Detail |\n|---|----------|----------|-------|--------|\n| P1 | high | completeness | ... | ... |\n```\n\n### Ledger Summary Display\n\nUse `RESULT_JSON.ledger` to display:\n```\nReview Ledger (Plan): Round {RESULT_JSON.ledger.round} | Status: {RESULT_JSON.ledger.status} | Findings: {RESULT_JSON.ledger.counts.new} new, {RESULT_JSON.ledger.counts.open} open, {RESULT_JSON.ledger.counts.resolved} resolved\n```\n\nIf `RESULT_JSON.ledger.round_summaries` has more than 1 entry, show a compact progress table:\n```\n| Round | Total | Open | New | Resolved | Overridden |\n|-------|-------|------|-----|----------|------------|\n| 1     | 5     | 0    | 0   | 3        | 2          |\n| 2     | 7     | 2    | 2   | 3        | 2          |\n```\nThen show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`\n\nReport: `current-phase.md updated` (the orchestrator generates this automatically).',
			},
			{
				title: "Handoff: 次のアクション選択",
				content:
					'\n**Auto-fix mode check**: `AUTOFIX_MODE = true` の場合、このコマンドは auto-fix loop から呼び出されている。ハンドオフ（AskUserQuestion）は **スキップ** し、ここで処理を終了する。制御は呼び出し元の auto-fix loop に戻り、ループ側が停止条件を判定する。\n\n**通常モード**（`AUTOFIX_MODE = false`）:\n\nレビュー結果を表示した後、Dual-Display Fallback Pattern に従い、テキストプロンプトを先に表示してから AskUserQuestion を呼び出す。\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Fix & re-review complete\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **実装に進む** → `/specflow.apply`\n- **Design を修正** → `/specflow.fix_design`\n- **中止** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "次のアクションを選択してください"\n  options:\n    - label: "実装に進む"\n      description: "specflow で実装を実行"\n    - label: "Design を修正"\n      description: "レビュー指摘に基づいて Design/Tasks を再修正し再レビュー"\n    - label: "中止"\n      description: "変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する。テキスト入力が label または command に一致しない場合、テキストプロンプトを再表示して再度入力を待つ。\n\nユーザーの選択に応じて、`Skill` ツールで次のコマンドを実行する:\n- 「実装に進む」 → `Skill(skill: "specflow.apply")`\n- 「Design を修正」 → `Skill(skill: "specflow.fix_design")`\n- 「中止」 → `Skill(skill: "specflow.reject")`\n\n**IMPORTANT:** Do NOT present next-action choices as text. 必ず Dual-Display Fallback Pattern（テキストプロンプト + AskUserQuestion の両方）を使うこと。',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, design, tasks, review-ledger-design, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- ALL control flow logic (Codex invocation, ledger detection/CRUD, finding matching, current-phase generation) is handled by the `specflow-review-design fix-review` orchestrator. This slash command applies fixes (LLM), then calls the orchestrator for re-review, parses its JSON output, and displays UI.",
			},
		],
	},
	"specflow.license": {
		frontmatter: {
			description: "プロジェクト解析に基づいてライセンスファイルを生成",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `which specflow-analyze` via Bash to confirm `specflow-analyze` is installed.\n   - If missing:\n     ```\n     ❌ `specflow-analyze` が見つかりません。\n     `specflow-install` を実行してパスを通してください。\n     ```\n     → **STOP**.\n\n2. Run `which gh` via Bash to confirm `gh` CLI is installed.\n   - If missing:\n     ```\n     ❌ `gh` CLI が見つかりません。\n     `brew install gh && gh auth login` を実行してください。\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: Analyze Project",
				content:
					'\nRun via Bash:\n```bash\nspecflow-analyze .\n```\n\nIf the command fails (non-zero exit), display the error and **STOP**.\n\nStore the JSON output as `ANALYZE_RESULT`.\n\nReport:\n```\nStep 1: Project analyzed\n  Languages: <languages>\n  Frameworks: <frameworks>\n  Package Manager: <package_manager>\n  Existing License: <license or "none">\n```',
			},
			{
				title: "Step 2: Existing License Check",
				content:
					'\n### 2a: LICENSE file check\n\nIf `ANALYZE_RESULT.license` is non-null:\n- Display: `"既存の LICENSE ファイルが検出されました: <license>"`\n- Use `AskUserQuestion` with options: "上書きする" / "キャンセル"\n- On "キャンセル": Display `"キャンセルしました。"` → **STOP**.\n- On "上書きする": Continue.\n\n### 2b: Manifest license reference info\n\nCheck each manifest file via Read tool (skip silently if file does not exist):\n- `package.json` — look for `"license"` field\n- `Cargo.toml` — look for `license` in `[package]`\n- `pyproject.toml` — look for `license` in `[project]`\n\nIf any manifest has a license field, display:\n```\n参考: マニフェストの既存 license フィールド:\n  - <filename>: <value>\n```\n\nStore any found manifest license values as `MANIFEST_LICENSE_INFO` for display in Step 3.',
			},
			{
				title: "Step 3: Display License Options",
				content: "\nDisplay the license comparison table:\n\n```",
			},
			{
				title: "対応ライセンス一覧",
				content:
					"\n| ライセンス | 種類 | 説明 |\n|-----------|------|------|\n| MIT | 寛容系 | 商用利用可、改変可、再配布可。著作権表示のみ必須 |\n| Apache 2.0 | 寛容系 | 特許権の明示的許諾。商標の保護 |\n| BSD 2-Clause | 寛容系 | MIT に近い。条件が2つだけ |\n| ISC | 寛容系 | MIT/BSD と同等で最も短い。Node.js エコシステムで一般的 |\n| GPL 3.0 | コピーレフト | 派生物も同じライセンスで公開が必要 |\n| AGPL 3.0 | コピーレフト | SaaS でも公開義務あり |\n| Unlicense | パブリックドメイン | 一切の制約なし |\n```\n\nIf `MANIFEST_LICENSE_INFO` exists, remind the user:\n```\n※ マニフェストの既存 license: <values>\n```",
			},
			{
				title: "Step 4: Recommend and Select License",
				content:
					'\n### 4a: Determine recommendation\n\nApply the following rules in priority order (first match wins):\n\n1. If `ANALYZE_RESULT.package_manager` == `"npm"` OR `ANALYZE_RESULT.languages` contains `"JavaScript"` or `"TypeScript"`:\n   - Recommend: **MIT** — "npm エコシステムで最も一般的なライセンスです"\n   - Recommended category: 寛容系\n\n2. If `ANALYZE_RESULT.languages` contains `"Rust"`:\n   - Recommend: **MIT または Apache 2.0** — "Rust エコシステムでは MIT または Apache 2.0 が一般的です（デュアルライセンスは本コマンドのスコープ外）"\n   - Recommended category: 寛容系\n\n3. If `ANALYZE_RESULT.languages` contains `"Go"`:\n   - Recommend: **BSD 2-Clause** — "Go 標準ライブラリと同じライセンスです"\n   - Recommended category: 寛容系\n\n4. If `ANALYZE_RESULT.frameworks` is non-empty:\n   - Recommend: **MIT** — "ライブラリ/フレームワーク依存プロジェクトに最適です"\n   - Recommended category: 寛容系\n\n5. Default:\n   - Recommend: **MIT** — "最も広く採用されている OSS ライセンスです"\n   - Recommended category: 寛容系\n\nDisplay the recommendation:\n```\nおすすめ: <recommended license> — <reason>\n```\n\n### 4b: Stage 1 — Category Selection\n\nUse `AskUserQuestion` with 3 options. Mark the recommended category with (Recommended):\n\n- "寛容系ライセンス (Recommended)" — MIT, Apache 2.0, BSD 2-Clause, ISC (description: "商用利用可、最も自由度が高い")\n- "コピーレフト系ライセンス" — GPL 3.0, AGPL 3.0 (description: "派生物も同じライセンスで公開が必要")\n- "パブリックドメイン" — Unlicense (description: "一切の制約なし")\n\n(Adjust Recommended marker based on the recommendation logic above. Default is 寛容系.)\n\nStore the user\'s selection as `SELECTED_CATEGORY`.\n\n### 4c: Stage 2 — Individual License Selection\n\nBased on `SELECTED_CATEGORY`:\n\n**If 寛容系:**\nUse `AskUserQuestion` with 4 options:\n- "MIT" (description: "最も寛容。著作権表示のみ必須")\n- "Apache 2.0" (description: "特許権の明示的許諾。エンタープライズ向け")\n- "BSD 2-Clause" (description: "MIT に近い。条件2つだけ")\n- "ISC" (description: "MIT/BSD 同等で最も短い")\n\nMark recommended license with (Recommended). For Rust projects, mark MIT as (Recommended) and note Apache 2.0 as an alternative in the description.\n\n**If コピーレフト系:**\nUse `AskUserQuestion` with 2 options:\n- "GPL 3.0" (description: "派生物も同じライセンスで公開が必要")\n- "AGPL 3.0" (description: "ネットワーク越しの使用にも適用")\n\n**If パブリックドメイン:**\nUse `AskUserQuestion` with 2 options:\n- "Unlicense" (description: "パブリックドメイン相当。一切の制約なし")\n- "戻る" (description: "カテゴリ選択に戻る")\n\nOn "戻る": Re-run Stage 1 (Step 4b).\n\nStore the user\'s selection as `SELECTED_LICENSE`.\n\n### 4d: Resolve license metadata\n\nMap `SELECTED_LICENSE` to its metadata:\n\n| Selection | GitHub API ID | SPDX ID |\n|-----------|---------------|---------|\n| MIT | `mit` | `MIT` |\n| Apache 2.0 | `apache-2.0` | `Apache-2.0` |\n| BSD 2-Clause | `bsd-2-clause` | `BSD-2-Clause` |\n| ISC | `isc` | `ISC` |\n| GPL 3.0 | `gpl-3.0` | `GPL-3.0-only` |\n| AGPL 3.0 | `agpl-3.0` | `AGPL-3.0-only` |\n| Unlicense | `unlicense` | `Unlicense` |\n\nStore `API_ID` and `SPDX_ID`.',
			},
			{
				title: "Step 5: Get Author Name and Year",
				content:
					'\n### 5a: Get year\n\nRun via Bash:\n```bash\ndate +%Y\n```\nStore as `YEAR`.\n\n### 5b: Get author name\n\nRun via Bash:\n```bash\ngit config user.name\n```\n\nIf the output is non-empty, store as `AUTHOR_NAME`.\n\nIf the output is empty or the command fails:\n1. Use `AskUserQuestion` (no options — free-text input mode) with question:\n   ```\n   LICENSE ファイルに記載する著者名を入力してください。\n   例: git config user.name "Your Name" で設定すると次回から自動取得されます。\n   ```\n2. If the user enters a non-empty value, store as `AUTHOR_NAME`.\n3. If the user enters empty text, retry (up to 3 attempts total).\n4. After 3 empty attempts OR if the user cancels/dismisses:\n   - Set `AUTHOR_NAME` = `<AUTHOR>`\n   - Display: `"⚠ 著者名が未設定のため <AUTHOR> プレースホルダーを使用しました。LICENSE ファイル内の <AUTHOR> を手動で置換してください"`',
			},
			{
				title: "Step 6: Fetch License Text",
				content:
					'\nRun via Bash:\n```bash\ngh api /licenses/<API_ID> --jq \'.body\'\n```\n\nIf the command fails (non-zero exit or empty output):\n- Display: `"❌ GitHub Licenses API からのライセンス取得に失敗しました。ネットワーク接続と gh auth status を確認してください。"`\n- Use `AskUserQuestion` with options: "リトライ" / "キャンセル"\n- On "リトライ": Re-run the command.\n- On "キャンセル": **STOP**.\n\nStore the output as `LICENSE_BODY`.\n\n### Placeholder substitution\n\nIf `LICENSE_BODY` contains `[year]`, replace all occurrences with `YEAR`.\nIf `LICENSE_BODY` contains `[fullname]`, replace all occurrences with `AUTHOR_NAME`.\n\nStore the result as `LICENSE_TEXT`.',
			},
			{
				title: "Step 7: Write LICENSE File",
				content:
					"\nWrite `LICENSE_TEXT` to `LICENSE` at the project root via Write tool.\n\nReport:\n```\nStep 7: LICENSE ファイルを生成しました\n  ライセンス: <SELECTED_LICENSE> (<SPDX_ID>)\n  著者: <AUTHOR_NAME>\n  年: <YEAR>\n```",
			},
			{
				title: "Step 8: Update Manifest Files",
				content:
					'\nFor each manifest file, apply the following logic:\n\n### 8a: package.json\n\n1. Attempt to Read `package.json`. If file does not exist → skip silently.\n2. Check if file contains a `"license"` field.\n3. If `"license"` field exists:\n   - If the value equals `SPDX_ID` → skip (display: `"package.json: license は既に <SPDX_ID> です。スキップ"`)\n   - If the value differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"\n     - On "スキップ" → skip\n     - On "上書きする" → Edit the `"license"` field to `SPDX_ID`\n4. If `"license"` field does not exist:\n   - Edit to add `"license": "<SPDX_ID>"` after the `"name"` field (or at top level).\n5. Report what was done.\n\n### 8b: Cargo.toml\n\n1. Attempt to Read `Cargo.toml`. If file does not exist → skip silently.\n2. Check if file contains `[package]` table.\n   - If `[package]` does not exist → skip (display: `"Cargo.toml: [package] テーブルが見つかりません。スキップ"`)\n3. Check if `[package]` contains `license` field.\n4. If `license` field exists:\n   - If the value equals `SPDX_ID` → skip\n   - If the value differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"\n     - On "スキップ" → skip\n     - On "上書きする" → Edit the `license` field to `SPDX_ID`\n5. If `license` field does not exist:\n   - Edit to add `license = "<SPDX_ID>"` in the `[package]` section.\n6. Report what was done.\n\n### 8c: pyproject.toml\n\n1. Attempt to Read `pyproject.toml`. If file does not exist → skip silently.\n2. Check if file contains `[project]` table.\n   - If `[project]` does not exist → skip (display: `"pyproject.toml: [project] テーブルが見つかりません。スキップ"`)\n3. Check if `[project]` contains `license` field.\n4. If `license` field exists:\n   - If it is a table form (e.g., `license = {text = "..."}` or `license = {file = "..."}`) → skip + display: `"⚠ pyproject.toml の license フィールドがレガシー形式のためスキップしました"`\n   - If it is a string form and equals `SPDX_ID` → skip\n   - If it is a string form and differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"\n     - On "スキップ" → skip\n     - On "上書きする" → Edit the `license` field to `SPDX_ID`\n5. If `license` field does not exist:\n   - Edit to add `license = "<SPDX_ID>"` in the `[project]` section.\n6. Report what was done.',
			},
			{
				title: "Step 9: Report Results",
				content:
					"\nDisplay a summary:\n\n```\n✅ ライセンス生成完了\n\n  ライセンス: <SELECTED_LICENSE> (<SPDX_ID>)\n  ファイル: LICENSE\n  著者: <AUTHOR_NAME>\n  年: <YEAR>\n\n  マニフェスト更新:\n  - package.json: <updated / skipped / not found>\n  - Cargo.toml: <updated / skipped / not found>\n  - pyproject.toml: <updated / skipped / not found>\n```\n\nIf `AUTHOR_NAME` is `<AUTHOR>`, append:\n```\n⚠ LICENSE ファイル内の <AUTHOR> を手動で置換してください\n```",
			},
			{
				title: "Verification Checklist",
				content:
					"\nManual verification scenarios:\n\n- [ ] New project (no LICENSE, no manifests) → recommend MIT, generate LICENSE\n- [ ] Existing LICENSE → overwrite confirmation, then generate\n- [ ] Existing LICENSE → cancel overwrite → command stops, no changes\n- [ ] Node.js project → MIT recommendation\n- [ ] Rust project → MIT recommendation (Apache 2.0 noted as alternative)\n- [ ] Go project → BSD 2-Clause recommendation\n- [ ] Author name from git config → embedded in LICENSE\n- [ ] Author name missing → free-text prompt → embedded\n- [ ] Author name missing → 3 empty retries → `<AUTHOR>` placeholder + warning\n- [ ] Author name missing → cancel → `<AUTHOR>` placeholder + warning\n- [ ] GitHub API failure → retry prompt\n- [ ] package.json exists, same license → skip\n- [ ] package.json exists, different license → overwrite confirmation\n- [ ] Cargo.toml exists, no [package] → skip\n- [ ] pyproject.toml exists, legacy table form → skip + warning\n- [ ] pyproject.toml exists, string form, different → overwrite confirmation",
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all paths\n- All evidence for recommendations must come from `specflow-analyze` output\n- Never modify manifests that do not exist — only update existing files\n- When the user cancels at the existing LICENSE check, stop the entire command\n- When the user cancels LICENSE overwrite, also skip all manifest updates",
			},
		],
	},
	specflow: {
		frontmatter: {
			description:
				"URL またはインライン仕様記述から local proposal entry → clarify → proposal review → spec delta validate を実行",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\nBefore starting, verify the project is initialized:\n\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ OpenSpec が初期化されていません。\n\n     次のステップで初期化してください:\n     1. `specflow-init` を実行\n     2. `/specflow` を再度実行\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: Setup — 入力取得と分類",
				content:
					"\n<!-- Input modes:\n  (1) /specflow <issue-url>  → 引数が issue URL → プロンプトなしで issue 取得\n  (2) /specflow <text>       → 引数が URL 以外 → プロンプトなしでインライン仕様記述\n  (3) /specflow              → 引数なし → テキスト案内を表示しユーザー入力を待つ\n-->\n\n1. **入力テキストの取得（共通エントリポイント）:**\n   - If `$ARGUMENTS` is non-empty, use it as `INPUT_TEXT` (do NOT display a prompt).\n   - If `$ARGUMENTS` is empty, display the following message and **wait for the user's next message**:\n     ```\n     GitHub issue URL を入力するか、仕様をテキストで記述してください。\n     例:\n     - Issue URL: https://github.com/OWNER/REPO/issues/123\n     - インライン仕様: 「ユーザー認証機能を追加する」\n     ```\n     Use the user's response as `INPUT_TEXT`.\n\n2. **入力分類（統一ロジック — 引数・プロンプト両方に適用）:**\n   - If `INPUT_TEXT` is empty or whitespace-only → re-display the prompt message above and wait again (loop until non-empty input is received).\n   - If `INPUT_TEXT` matches the pattern `https://<HOST>/<OWNER>/<REPO>/issues/<NUMBER>` (i.e., a URL containing `/issues/` followed by a number) → set `MODE = issue_url` and store `INPUT_TEXT` as the issue URL.\n   - Otherwise → set `MODE = inline_spec` and store `INPUT_TEXT` as the feature description.",
			},
			{
				title: "Step 2: Fetch Issue (MODE = issue_url のみ)",
				content:
					'\n**If `MODE = inline_spec`**: Remove any stale issue context by running `rm -f /tmp/specflow-issue.json` via Bash, then skip this step entirely and proceed to Step 3.\n\n**If `MODE = issue_url`**:\n\nRun via Bash:\n```bash\nspecflow-fetch-issue "<ISSUE_URL>" > /tmp/specflow-issue.json\n```\n\nIf the command fails (non-zero exit code, empty output, or the JSON contains an error):\n- Display the error: `"Issue 取得に失敗しました: <error details>。URL を確認して再入力してください。"`\n- Re-display the text prompt from Step 1 and **wait for the user\'s next message**.\n- Use the new response as `INPUT_TEXT` and re-run the classification logic from Step 1 point 2 (the user may enter a different URL or switch to inline spec).\n\nIf successful, read `/tmp/specflow-issue.json` and extract: title, body, url, number, state, author login, label names.\n\nReport to the user:\n```\nStep 2: Issue fetched — #<number> — <title>\nAuthor: <author> | State: <state> | Labels: <labels>\n```\n\nShow a brief summary of the issue body.',
			},
			{
				title: "Step 2.5: Baseline Spec 存在チェック",
				content:
					'\nGlob ツールで `openspec/specs/*/spec.md` パターンに一致するファイルを検索する。\n\n- **1つ以上のファイルが見つかった場合**: Report `Step 2.5: <N> baseline spec(s) found` → Step 3 に進む。\n- **ファイルが見つからない場合**（ディレクトリのみ存在・空ディレクトリ・`openspec/specs/` 自体が欠落のいずれでも）:\n\n  `AskUserQuestion` で誘導する:\n\n  ```\n  AskUserQuestion:\n    question: "⚠️ openspec/specs/ にベースライン spec が見つかりません。\\n既存プロジェクトに specflow を導入する場合、先に `/specflow.spec` でベースライン spec を生成することを推奨します。"\n    options:\n      - label: "specflow.spec を実行 (Recommended)"\n        description: "コードベースを解析してベースライン spec を生成する"\n      - label: "スキップして続行"\n        description: "spec なしで proposal 作成に進む（後で spec delta エラーが発生する可能性あり）"\n  ```\n\n  - 「specflow.spec を実行」 → `/specflow.spec` を起動し、その完全なワークフローに従って実行する → **STOP**（spec 生成後にユーザーが `/specflow` を再実行する）。\n  - 「スキップして続行」 → Step 3 に進む。',
			},
			{
				title: "Step 3: Proposal Creation",
				content:
					'\nPass raw input directly to the local entry helper. Source normalization is handled internally by `specflow-prepare-change`.\n\n1. Determine `RAW_INPUT` from the classified input:\n   - **`MODE = issue_url`**: `RAW_INPUT` is the issue URL from Step 2.\n   - **`MODE = inline_spec`**: `RAW_INPUT` is the `INPUT_TEXT` from Step 1.\n2. Run the shared local entry helper:\n   ```bash\n   specflow-prepare-change [<CHANGE_ID>] <RAW_INPUT>\n   ```\n   - If you already know the desired `CHANGE_ID`, pass it explicitly as the first argument.\n   - Otherwise let the helper derive it from the normalized source.\n   - The helper auto-detects the input mode (issue URL vs inline text) and normalizes internally.\n3. The helper performs the canonical entry sequence:\n   - classifies and normalizes the raw input (fetching the issue if URL mode)\n   - creates or reuses `openspec/changes/<CHANGE_ID>/`\n   - creates or switches the local branch `<CHANGE_ID>`\n   - writes `openspec/changes/<CHANGE_ID>/proposal.md` from OpenSpec proposal instructions plus the normalized source\n   - runs `specflow-run start "<CHANGE_ID>"` with the normalized source metadata\n   - runs `specflow-run advance "<CHANGE_ID>" propose`\n4. Parse the returned run-state JSON and set `CHANGE_ID = RUN_STATE.change_name`.\n5. Read `openspec/changes/<CHANGE_ID>/proposal.md`.\n6. If the seeded draft clearly misses obvious scope/details from the source, refine `proposal.md` immediately before moving on.\n\nReport: `Step 3 complete — proposal created and run entered proposal_draft`',
			},
			{
				title: "Step 4: Scope Check",
				content:
					'\n1. Move the run into `proposal_scope`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" check_scope\n   ```\n2. Analyze `openspec/changes/<CHANGE_ID>/proposal.md` for independent functional areas.\n3. If the proposal should be decomposed, confirm with the user.\n4. On confirmed decomposition:\n   - If issue-linked, invoke `/specflow.decompose`.\n   - Record the terminal branch state:\n     ```bash\n     specflow-run advance "<CHANGE_ID>" decompose\n     ```\n   - **STOP** in `decomposed`.\n5. If continuing as a single proposal, move into `proposal_clarify`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" continue_proposal\n   ```\n\nReport: `Step 4 complete — proposal entered proposal_scope and selected continue or decompose`',
			},
			{
				title: "Step 5: Clarify",
				content:
					'\nRun the clarify workflow on `openspec/changes/<CHANGE_ID>/proposal.md`.\n\nRequirements:\n- Ask clarification questions one at a time with `AskUserQuestion`\n- Integrate answers back into proposal.md\n- Keep the run in `proposal_clarify` while proposal revisions continue\n\nIf review findings or validation errors later require more proposal edits, return to this step after recording:\n```bash\nspecflow-run advance "<CHANGE_ID>" revise_proposal\n```\n\nReport: `Step 5 complete — clarify finished for the current proposal round`',
			},
			{
				title: "Step 6: Proposal Review",
				content:
					'\n1. Enter the proposal review gate:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" review_proposal\n   ```\n2. Run the internal proposal review runtime:\n   - first review round:\n     ```bash\n     specflow-review-proposal review <CHANGE_ID>\n     ```\n   - when re-entering after `revise_proposal` and a proposal ledger already exists:\n     ```bash\n     specflow-review-proposal fix-review <CHANGE_ID>\n     ```\n3. Parse the runtime result.\n   - Only `handoff.state = "review_approved"` may continue to `spec_draft`.\n   - `review_changes_requested`, `review_blocked`, `max_rounds_reached`, `no_progress`, parse errors, or ledger recovery requiring user intervention must all stay on the proposal side.\n4. If the proposal side remains blocked:\n   - return to `proposal_clarify`\n   - do **not** offer `/specflow.design`\n   - record the loop explicitly:\n     ```bash\n     specflow-run advance "<CHANGE_ID>" revise_proposal\n     ```\n5. If the proposal review is approved, move into `spec_draft`:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" proposal_review_approved\n   ```\n\nWhen `max_rounds_reached` or `no_progress` is returned, stop in place without bypassing the gate.\n\nReport: `Step 6 complete — proposal review passed or looped back to proposal_clarify`',
			},
			{
				title: "Step 7: Spec Delta Draft",
				content:
					'\nGenerate spec delta placeholders only after proposal review approval.\n\n1. Run:\n   ```bash\n   openspec instructions specs --change "<CHANGE_ID>" --json\n   ```\n2. Read `openspec/changes/<CHANGE_ID>/proposal.md` and parse the `Capabilities` section as the source of truth for spec targets.\n3. For each capability entry:\n   - `New Capabilities` → create or refresh `openspec/changes/<CHANGE_ID>/specs/<capability>/spec.md`\n   - `Modified Capabilities` → first confirm `openspec/specs/<capability>/spec.md` exists, then create or refresh `openspec/changes/<CHANGE_ID>/specs/<capability>/spec.md`\n4. Use the OpenSpec `template` and `instruction` from Step 1 to scaffold each spec delta file, then fill it with actual delta content.\n5. If the `Capabilities` section still contains placeholders, unresolved entries, or a modified capability without a matching baseline spec, return to `proposal_clarify` instead of continuing:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" revise_proposal\n   ```\n6. Report which spec delta files were created or refreshed.\n\nReport: `Step 7 complete — spec delta drafts created under openspec/changes/<CHANGE_ID>/specs/`',
			},
			{
				title: "Step 8: Spec Validate",
				content:
					'\nRun structural validation only after spec delta files are drafted:\n\n1. Enter the spec validation gate:\n   ```bash\n   specflow-run advance "<CHANGE_ID>" validate_spec\n   ```\n2. Run:\n   ```bash\n   openspec validate "<CHANGE_ID>" --type change --json\n   ```\n3. Parse the JSON response:\n   - If `valid: true`, advance to `spec_ready`:\n     ```bash\n     specflow-run advance "<CHANGE_ID>" spec_validated\n     ```\n   - If `valid: false`, display the issues table, fix only the spec delta files under `openspec/changes/<CHANGE_ID>/specs/`, and loop back to `spec_draft`:\n     ```bash\n     specflow-run advance "<CHANGE_ID>" revise_spec\n     ```\n\nStrict gate rules:\n- Do **not** continue despite validation errors\n- Do **not** hand off to `/specflow.design` while validation issues remain\n- Reuse `max_autofix_rounds` from `openspec/config.yaml` as the maximum proposal/spec loop count\n- When proposal review or spec validation returns `max_rounds_reached` or `no_progress`, stop in the current state without bypassing the gate',
			},
			{
				title: "Step 9: Design Handoff",
				content:
					"\nOnly when the run is in `spec_ready`, offer the next action.\n\nRecommended handoff:\n- **Design に進む** → `/specflow.design`\n- **中止** → `/specflow.reject`\n\nDo not offer `/specflow.design` from `proposal_clarify`, `proposal_review`, `spec_draft`, or `spec_validate`.",
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, specs, design, tasks) are managed in `openspec/changes/<change-id>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- When reading specflow command files, follow their instructions faithfully.",
			},
		],
	},
	"specflow.readme": {
		frontmatter: {
			description: "プロジェクト解析に基づいて OSS 風 README を生成・更新",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `which specflow-analyze` via Bash to confirm `specflow-analyze` is installed.\n   - If missing:\n     ```\n     ❌ `specflow-analyze` が見つかりません。\n     `specflow-install` を実行してパスを通してください。\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: Analyze Project",
				content:
					"\nRun via Bash:\n```bash\nspecflow-analyze .\n```\n\nIf the command fails (non-zero exit), display the error and **STOP**.\n\nStore the JSON output as `ANALYZE_RESULT`.\n\nReport:\n```\nStep 1: Project analyzed\n  Languages: <languages>\n  Frameworks: <frameworks>\n  Package Manager: <package_manager>\n```",
			},
			{
				title: "Step 2: Generate README",
				content:
					'\nUsing `ANALYZE_RESULT`, generate the README following these rules:\n\n### Grounding Policy (Source-of-Truth)\n\nEach section and badge MUST be backed by evidence from `ANALYZE_RESULT`. If evidence is insufficient, OMIT the section (do not guess).\n\n**Exception: Template sections** — Contributing may use a generic template when no CONTRIBUTING.md exists.\n\n### Section-Evidence Requirements\n\n| Section | Required Evidence | No Evidence → |\n|---------|------------------|---------------|\n| Badges (tech stack) | `languages` / `frameworks` | Omit |\n| Badges (license) | `license` | Omit |\n| Badges (CI) | `ci.provider` + `ci.workflows` | Omit |\n| Overview | `description` or `existing_readme` | Project name only + placeholder |\n| Features | `openspec.specs` or `keywords` | Omit |\n| Installation | `package_manager` + `scripts` | Omit |\n| Usage | `bin_entries` + `scripts` | Omit |\n| Configuration | `config_files` | Omit |\n| Architecture | `openspec.specs` (2+) or `file_structure` | Omit |\n| Contributing | `contributing` | Generic template |\n| License | `license` | Omit |\n\n### Badge Rules\n\n**Static badges** (tech stack, license):\n- Use shields.io static badge URLs\n- Example: `https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white`\n\n**Dynamic badges** (CI):\n- **GitHub Actions**: Use actual workflow filename: `https://img.shields.io/github/actions/workflow/status/{owner}/{repo}/{workflow_name}{extension}`\n- **GitLab CI**: `https://img.shields.io/gitlab/pipeline-status/{owner}%2F{repo}`\n- Other CI: Omit\n- Requires `git_remote.owner` and `git_remote.repo`; omit if missing\n\n### Emoji Section Headings\n\nUse emoji prefixes for section headings:\n- `✨ Features`\n- `📦 Installation`\n- `🚀 Usage`\n- `⚙️ Configuration`\n- `🏗️ Architecture`\n- `🤝 Contributing`\n- `📄 License`\n\n### Existing README Merge Strategy\n\nCheck `ANALYZE_RESULT.existing_readme`:\n\n**If null (no existing README):**\n- Generate a complete new README\n- Display the generated README to the user\n\n**If non-null (existing README):**\n\nApply the merge strategy:\n\n0. **Preamble handling**: Content before the first `##` heading (H1 title, badge row, overview paragraph) is treated as a special "preamble" merge unit. The preamble is always classified as **Improve** — regenerate title, badges, and overview from evidence while preserving any non-standard content as protected blocks.\n1. Split the rest of existing README by `##` headings into sections\n2. Classify each section using the Section-Evidence table:\n   - **Improve**: Section heading matches an entry in the table AND evidence exists → regenerate\n   - **Preserve**: Section heading does NOT match any entry → keep verbatim\n3. Within "Improve" sections, classify content blocks:\n   - **Generate target**: Content that can be derived from evidence (install commands, badge URLs, etc.)\n   - **Protected block**: Everything else (notes, caveats, subsections not matching evidence). When ambiguous, classify as protected (conservative approach).\n4. For each "Improve" section: generate new content, then append protected blocks in original order\n5. Insert "Preserve" sections in their original positions\n6. Add new sections (evidence exists but no existing heading) at appropriate positions\n\n**CRITICAL**: Preserve sections and protected blocks MUST be kept VERBATIM — do not modify a single character.',
			},
			{
				title: "Step 3: Review and Approve",
				content:
					'\n**New README (no existing):**\n- Display the full generated README\n- Use `AskUserQuestion` with options: "適用" / "再生成" / "キャンセル"\n\n**Updated README (existing):**\n- Display the full diff between existing and generated README (no line limit)\n- Use `AskUserQuestion` with options: "適用" / "再生成" / "キャンセル"\n\nOn "適用": Write the README to `README.md` via Write tool. Report: `README.md updated`\nOn "再生成": Ask for feedback, add to prompt context, and re-run Step 2\nOn "キャンセル": Report: `Cancelled. No changes made.`',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root as the base for all paths\n- All evidence must come from `specflow-analyze` output — do not read additional files\n- Never generate content without evidence (except template sections)\n- Protected blocks and preserve sections are VERBATIM — zero modifications\n- When evidence is ambiguous, omit rather than guess",
			},
		],
	},
	"specflow.reject": {
		frontmatter: {
			description: "実装を破棄し、全変更をリセットする",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Reject Implementation",
				content:
					"\n全変更を破棄します。\n\n1. 現在の変更状態を確認:\n   ```bash\n   git status --short\n   ```\n\n2. 変更ファイル一覧をユーザーに表示する。\n\n3. 全変更を破棄:\n   ```bash\n   git checkout -- .\n   git clean -fd -- . ':(exclude)openspec'\n   ```\n\n   これにより:\n   - 変更されたファイルは元に戻る (`git checkout`)\n   - 新規作成されたファイルは削除される (`git clean`)\n   - `openspec/` 配下の新規ファイルは保持される\n\n4. 破棄後の状態を確認:\n   ```bash\n   git status --short\n   ```\n\nReport: \"Implementation rejected. All changes have been discarded.\" → **END**.",
			},
		],
	},
	"specflow.review_apply": {
		frontmatter: {
			description:
				"Codex impl review を実行し、ledger 更新・auto-fix loop・handoff を管理",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.review_apply` を再度実行\n     ```\n     → **STOP**.\n2. Read `openspec/config.yaml`. Extract `max_autofix_rounds` if present. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.",
			},
			{
				title: "Setup",
				content:
					"\nDetermine `CHANGE_ID`:\n- If `$ARGUMENTS` contains a change id, use it.\n- Otherwise, derive from the current branch name or prompt the user.\n\nVerify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.",
			},
			{
				title: "Step 0.5: Read Current Phase Context",
				content:
					'\n1. Use `CHANGE_ID` resolved in Setup.\n2. Check if `openspec/changes/<CHANGE_ID>/current-phase.md` exists (via Read tool — if not found, proceed silently).\n3. If the file exists: read it and display as a summary block:\n   ```\n   Current Phase Context:\n   <contents of current-phase.md>\n   ```\n4. If the file does not exist: proceed without error. Optionally note: "No prior phase context found (first run)."',
			},
			{
				title: "Step 1: Run Orchestrator",
				content:
					"\nRun the Bash orchestrator:\n```bash\nspecflow-review-apply review <CHANGE_ID>\n```\n\nCapture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.",
			},
			{
				title: "Step 2: Handle Error Results",
				content:
					'\nIf `RESULT_JSON.status == "error"`:\n- If `RESULT_JSON.error == "no_changes"`: Display `"レビュー対象の変更がありません。フィルタリングにより全ての変更が除外されたか、実装変更がありません。"` → **STOP**.\n- Otherwise: Display `RESULT_JSON.error` → **STOP**.',
			},
			{
				title: "Step 3: Handle Diff Warning",
				content:
					'\nIf `RESULT_JSON.diff_summary.diff_warning == true`:\n\nDual-Display Fallback Pattern に従う:\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Diff size warning — {RESULT_JSON.diff_summary.total_lines} lines (threshold: {RESULT_JSON.diff_summary.threshold})\n\n続行しますか？（テキスト入力またはボタンで回答）:\n- **続行** → continue\n- **中止** → abort\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "フィルタリング後の diff が {total_lines} 行あります。Codex がスタックする可能性があります。続行しますか？"\n  options:\n    - label: "続行"\n      description: "このまま Codex レビューを実行"\n    - label: "中止"\n      description: "レビューをスキップ"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\nIf "中止" → **STOP**.\n\nIf "続行": re-run the orchestrator with diff warning bypass enabled and replace `RESULT_JSON` with the new output.\n```bash\nspecflow-review-apply review <CHANGE_ID> --skip-diff-check\n```\nCapture stdout again as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**. Parse the new `RESULT_JSON` as JSON before proceeding.',
			},
			{
				title: "Step 4: Display Review Results",
				content:
					'\n### Review Findings\n\nPresent the Codex review from `RESULT_JSON.review`:\n\nIf `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.\n\nOtherwise display:\n```\nCodex Implementation Review\n\n**Decision:** <RESULT_JSON.review.decision>\n**Summary:** <RESULT_JSON.review.summary>\n\n| # | Severity | File | Title | Detail |\n|---|----------|------|-------|--------|\n| F1 | high | src/foo.ts | ... | ... |\n| F2 | medium | src/bar.ts | ... | ... |\n```\n\n### Ledger Summary Display\n\nUse `RESULT_JSON.ledger` to display:\n```\nReview Ledger: Round {RESULT_JSON.ledger.round} | Status: {RESULT_JSON.ledger.status} | Findings: {RESULT_JSON.ledger.counts.new} new, {RESULT_JSON.ledger.counts.open} open, {RESULT_JSON.ledger.counts.resolved} resolved\n```\n\nIf `RESULT_JSON.ledger.round_summaries` has more than 1 entry, show a compact progress table:\n```\n| Round | Total | Open | New | Resolved | Overridden |\n|-------|-------|------|-----|----------|------------|\n| 1     | 5     | 0    | 0   | 3        | 2          |\n| 2     | 7     | 2    | 2   | 3        | 2          |\n```\nThen show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`',
			},
			{
				title: "Step 5: Handoff (based on RESULT_JSON.handoff.state)",
				content:
					'\n### Actionable Findings 定義\n\n**Actionable findings**: `status ∈ {"new", "open"}` の finding。`"resolved"`, `"accepted_risk"`, `"ignored"` は non-actionable。\n\n### Severity 集計\n\nUse `RESULT_JSON.handoff.actionable_count` and `RESULT_JSON.handoff.severity_summary`.\n\nThe `severity_summary` format: CRITICAL → HIGH → MEDIUM → LOW order, 0 件の severity は除外。\n\n### State-to-Option Mapping\n\n| State | Condition | Options (label → command) |\n|-------|-----------|--------------------------|\n| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" → `/specflow.fix_apply autofix`, "手動修正" → `/specflow.fix_apply` |\n| `review_no_findings` | `actionable_count == 0` after review | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix_apply`, "中止" → `/specflow.reject` |\n| `loop_no_findings` | `actionable_count == 0` after loop | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix_apply`, "中止" → `/specflow.reject` |\n| `loop_with_findings` | `actionable_count > 0` after loop | "Auto-fix 続行" → `/specflow.fix_apply autofix`, "手動修正" → `/specflow.fix_apply`, "Approve" → `/specflow.approve`, "中止" → `/specflow.reject` |\n\n### Dual-Display Fallback Pattern\n\n全ハンドオフポイントに以下のパターンを適用する:\n\n1. **テキストプロンプト表示**: 1行ステータスメッセージ + 選択肢リスト（label → command 形式）を表示\n2. **AskUserQuestion 呼び出し**: 同じ選択肢をボタンとして表示\n3. **入力受理ルール**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する\n4. **テキスト入力検証**: exact label または exact slash command のみ受理（label は case-insensitive）。部分一致は不可\n5. **無効入力時**: テキストプロンプトを再表示し、再度入力を待つ。自動選択や無入力での進行は禁止\n\n### `review_no_findings` (actionable_count == 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Review complete — all findings resolved\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Approve** → `/specflow.approve`\n- **手動修正** → `/specflow.fix_apply`\n- **中止** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "指摘事項はすべて解決済みです。次のアクションを選択してください"\n  options:\n    - label: "Approve"\n      description: "実装を承認してコミット・PR 作成"\n    - label: "手動修正 (/specflow.fix_apply)"\n      description: "手動で修正した後に再レビューする"\n    - label: "中止"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「Approve」 → `Skill(skill: "specflow.approve")`\n- 「手動修正 (/specflow.fix_apply)」 → `Skill(skill: "specflow.fix_apply")`\n- 「中止」 → `Skill(skill: "specflow.reject")`\n\n### `review_with_findings` (actionable_count > 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Review complete — {RESULT_JSON.handoff.actionable_count} actionable finding(s): {RESULT_JSON.handoff.severity_summary}\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Auto-fix 実行** → `/specflow.fix_apply autofix`\n- **手動修正** → `/specflow.fix_apply`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "レビュー指摘: {severity_summary}\\nauto-fix を実行しますか？"\n  options:\n    - label: "Auto-fix 実行"\n      description: "自動修正を実行し、再レビューする"\n    - label: "手動修正 (/specflow.fix_apply)"\n      description: "手動で修正した後に再レビューする"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\nユーザーの選択に応じて分岐:\n- 「Auto-fix 実行」 → Step 6: Auto-fix Loop に進む\n- 「手動修正 (/specflow.fix_apply)」 → 手動修正誘導メッセージを表示し、`Skill(skill: "specflow.fix_apply")` を実行する\n\n**手動修正誘導メッセージ**:\n```\n手動修正モードに進みます。/specflow.fix_apply で指摘を修正し、再レビューしてください。\n```',
			},
			{
				title: "Step 6: Auto-fix Loop",
				content:
					'\nユーザーが「Auto-fix 実行」を選択した場合、Bash orchestrator で auto-fix loop を実行する。\n\n### Run Orchestrator\n\n```bash\nspecflow-review-apply autofix-loop <CHANGE_ID> --max-rounds <MAX_AUTOFIX_ROUNDS>\n```\n\nCapture stdout as `LOOP_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `LOOP_JSON` as JSON. If parse fails, display raw output and **STOP**.\n\n### Display Loop Summary\n\n```\nAuto-fix Loop Complete:\n  - Total rounds: {LOOP_JSON.autofix.total_rounds}\n  - Result: {LOOP_JSON.autofix.result}\n  - Reason: {LOOP_JSON.autofix.result == "success" ? "unresolved high = 0" : LOOP_JSON.autofix.result}\n  - Remaining actionable: {LOOP_JSON.handoff.actionable_count} ({LOOP_JSON.handoff.severity_summary})\n```\n\n**スコア推移テーブル**（`LOOP_JSON.autofix.round_scores` が 1 件以上の場合に表示）:\n```\n| Round | Score | Unresolved High | New High |\n|-------|-------|-----------------|----------|\n| 1     | 12    | 3               | 1        |\n| 2     | 9     | 2               | 0        |\n```\n\n**Divergence 警告履歴**（`LOOP_JSON.autofix.divergence_warnings` が 1 件以上の場合に表示）:\n```\nDivergence Warnings:\n  - Round {round}: {type} ({detail})\n  - Round {round}: {type} ({detail})\n```\n`divergence_warnings` が空の場合、この警告履歴セクションは表示しない。\n\n### Ledger Summary Display (Loop)\n\nUse `LOOP_JSON.ledger` to display the same ledger summary format as Step 4:\n```\nReview Ledger: Round {round} | Status: {status} | Findings: {new} new, {open} open, {resolved} resolved\n```\nIf `round_summaries` has more than 1 entry, show the compact progress table and round-over-round diff.\n\n### Loop Handoff (based on LOOP_JSON.handoff.state)\n\n#### `loop_no_findings` (actionable_count == 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Auto-fix complete — all findings resolved\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Approve** → `/specflow.approve`\n- **手動修正** → `/specflow.fix_apply`\n- **中止** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "Auto-fix loop 完了（成功）。次のアクションを選択してください"\n  options:\n    - label: "Approve"\n      description: "実装を承認してコミット・PR 作成"\n    - label: "手動修正 (/specflow.fix_apply)"\n      description: "手動で修正した後に再レビューする"\n    - label: "中止"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「Approve」 → `Skill(skill: "specflow.approve")`\n- 「手動修正 (/specflow.fix_apply)」 → `Skill(skill: "specflow.fix_apply")`\n- 「中止」 → `Skill(skill: "specflow.reject")`\n\n#### `loop_with_findings` (actionable_count > 0)\n\n残存する actionable findings の severity_summary を `LOOP_JSON.handoff.severity_summary` から取得。\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Auto-fix stopped — {LOOP_JSON.autofix.result == "success" ? "success (high resolved, lower-severity remaining)" : "max rounds reached"}. Remaining: {LOOP_JSON.handoff.severity_summary}\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Auto-fix 続行** → `/specflow.fix_apply autofix`\n- **手動修正** → `/specflow.fix_apply`\n- **Approve** → `/specflow.approve`\n- **中止** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "Auto-fix loop 停止（{result_reason}）。残存指摘: {severity_summary}\\n次のアクションを選択してください"\n  options:\n    - label: "Auto-fix 続行"\n      description: "自動修正を続行し、再レビューする"\n    - label: "手動修正 (/specflow.fix_apply)"\n      description: "残りの指摘を手動で修正して再レビュー"\n    - label: "Approve"\n      description: "現状で承認してコミット・PR 作成"\n    - label: "中止"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「Auto-fix 続行」 → auto-fix loop を再開始（Step 6 を再実行）\n- 「手動修正 (/specflow.fix_apply)」 → `Skill(skill: "specflow.fix_apply")`\n- 「Approve」 → `Skill(skill: "specflow.approve")`\n- 「中止」 → `Skill(skill: "specflow.reject")`\n\n**IMPORTANT:** 全ハンドオフポイントで Dual-Display Fallback Pattern を適用すること — テキストプロンプトと AskUserQuestion の両方を必ず表示する。',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, review-ledger, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- ALL control flow logic (diff filtering, Codex invocation, ledger update, finding matching, current-phase generation) is handled by the `specflow-review-apply` orchestrator. This slash command only calls the orchestrator, parses its JSON output, and displays UI.",
			},
		],
	},
	"specflow.review_design": {
		frontmatter: {
			description:
				"Codex design/tasks review を実行し、ledger 更新・auto-fix loop・handoff を管理",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.review_design` を再度実行\n     ```\n     → **STOP**.\n2. Read `openspec/config.yaml`. Extract `max_autofix_rounds` if present. If unset or not a number in 1〜10, use default value 4. Store as `MAX_AUTOFIX_ROUNDS`.",
			},
			{
				title: "Setup",
				content:
					'\nDetermine `CHANGE_ID`:\n- If `$ARGUMENTS` contains a change id, use it.\n- Otherwise, derive from the current branch name or prompt the user.\n\nVerify `openspec/changes/<CHANGE_ID>/proposal.md` exists via Bash. If missing → **STOP** with error.\n\nVerify that `openspec/changes/<CHANGE_ID>/design.md` and `openspec/changes/<CHANGE_ID>/tasks.md` exist (via Read tool). If either file does not exist, display an error: `"design.md または tasks.md が見つかりません。先に /specflow.design を実行してください。"` → **STOP**.',
			},
			{
				title: "Step 1: Run Orchestrator",
				content:
					"\nRun the Bash orchestrator:\n```bash\nspecflow-review-design review <CHANGE_ID>\n```\n\nCapture stdout as `RESULT_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `RESULT_JSON` as JSON. If parse fails, display raw output and **STOP**.",
			},
			{
				title: "Step 2: Handle Ledger Recovery",
				content:
					'\nIf `RESULT_JSON.ledger_recovery == "prompt_user"`:\n\nThe ledger was corrupt and no backup was available. Use `AskUserQuestion` to ask the user:\n\n```\nAskUserQuestion:\n  question: "review-ledger-design.json が破損しており、バックアップもありません。新規 ledger を作成しますか？ (既存データは失われます)"\n  options:\n    - label: "新規作成"\n      description: "空の ledger を作成してレビューを再実行"\n    - label: "中止"\n      description: "ワークフローを停止"\n```\n\n- 「新規作成」 → Re-run the orchestrator with `--reset-ledger`:\n  ```bash\n  specflow-review-design review <CHANGE_ID> --reset-ledger\n  ```\n  Capture and parse again as `RESULT_JSON`, then continue from Step 3.\n- 「中止」 → **STOP**.',
			},
			{
				title: "Step 3: Handle Error Results",
				content:
					'\nIf `RESULT_JSON.status == "error"`:\n- Display `RESULT_JSON.error` → **STOP**.',
			},
			{
				title: "Step 4: Display Review Results",
				content:
					'\n### Review Findings\n\nPresent the Codex review from `RESULT_JSON.review`:\n\nIf `RESULT_JSON.review.parse_error` is true, display raw response from `RESULT_JSON.review.raw_response` instead of the structured table, then proceed to handoff.\n\nOtherwise display:\n```\nCodex Design/Tasks Review\n\n**Decision:** <RESULT_JSON.review.decision>\n**Summary:** <RESULT_JSON.review.summary>\n\n| # | Severity | File | Category | Title | Detail |\n|---|----------|------|----------|-------|--------|\n| P1 | high | design.md | completeness | ... | ... |\n| P2 | medium | tasks.md | ordering | ... | ... |\n```\n\n### Ledger Summary Display\n\nUse `RESULT_JSON.ledger` to display:\n```\nReview Ledger (Plan): Round {RESULT_JSON.ledger.round} | Status: {RESULT_JSON.ledger.status} | Findings: {RESULT_JSON.ledger.counts.new} new, {RESULT_JSON.ledger.counts.open} open, {RESULT_JSON.ledger.counts.resolved} resolved\n```\n\nIf `RESULT_JSON.ledger.round_summaries` has more than 1 entry, show a compact progress table:\n```\n| Round | Total | Open | New | Resolved | Overridden |\n|-------|-------|------|-----|----------|------------|\n| 1     | 5     | 0    | 0   | 3        | 2          |\n| 2     | 7     | 2    | 2   | 3        | 2          |\n```\nThen show round-over-round diff: `"Round {n}: +{new} new, {resolved_this_round} resolved, {open} remaining"`',
			},
			{
				title: "Step 5: Handoff (based on RESULT_JSON.handoff.state)",
				content:
					'\n### Actionable Findings 定義\n\n**Actionable findings**: `status ∈ {"new", "open"}` の finding。`"resolved"`, `"accepted_risk"`, `"ignored"` は non-actionable。\n\n### Severity 集計\n\nUse `RESULT_JSON.handoff.actionable_count` and `RESULT_JSON.handoff.severity_summary`.\n\nThe `severity_summary` format: CRITICAL → HIGH → MEDIUM → LOW order, 0 件の severity は除外。\n\n### `accepted_risk`/`ignored` の扱い\n\n- `accepted_risk` や `ignored` ステータスの high finding は、ユーザーが明示的に受容/無視した判断であり、auto-fix loop の**修正対象外**とする。\n- **ループ開始判定**: actionable findings（`new`/`open`、全 severity）が 0 件の場合は実装フローへ直接遷移する。\n- **Quality gate スコア計算**: `accepted_risk`/`ignored` の finding は unresolved として**カウントに含める**。\n\n### State-to-Option Mapping\n\n| State | Condition | Options (label → command) |\n|-------|-----------|--------------------------|\n| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" → auto-fix loop, "手動修正" → `/specflow.fix_design` |\n| `review_no_findings` | `actionable_count == 0` after review | "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |\n| `loop_no_findings` | `actionable_count == 0` after loop | "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |\n| `loop_with_findings` | `actionable_count > 0` after loop | "手動修正" → `/specflow.fix_design`, "実装に進む" → `/specflow.apply`, "Reject" → `/specflow.reject` |\n\n### Dual-Display Fallback Pattern\n\n全ハンドオフポイントに以下のパターンを適用する:\n\n1. **テキストプロンプト表示**: 1行ステータスメッセージ + 選択肢リスト（label → command 形式）を表示\n2. **AskUserQuestion 呼び出し**: 同じ選択肢をボタンとして表示\n3. **入力受理ルール**: 最初に受理された有効入力（ボタンまたはテキスト）のみを採用する\n4. **テキスト入力検証**: exact label または exact slash command のみ受理（label は case-insensitive）。部分一致は不可\n5. **無効入力時**: テキストプロンプトを再表示し、再度入力を待つ。自動選択や無入力での進行は禁止\n\n### `review_no_findings` (actionable_count == 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Review complete — all findings resolved\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **実装に進む** → `/specflow.apply`\n- **Reject** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "指摘事項はすべて解決済みです。次のアクションを選択してください"\n  options:\n    - label: "実装に進む"\n      description: "specflow で実装を実行"\n    - label: "Reject"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「実装に進む」 → `Skill(skill: "specflow.apply")`\n- 「Reject」 → `Skill(skill: "specflow.reject")`\n\n### `review_with_findings` (actionable_count > 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Review complete — {RESULT_JSON.handoff.actionable_count} actionable finding(s): {RESULT_JSON.handoff.severity_summary}\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **Auto-fix 実行** → auto-fix loop\n- **手動修正** → `/specflow.fix_design`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "レビュー指摘: {severity_summary}\\nauto-fix を実行しますか？"\n  options:\n    - label: "Auto-fix 実行"\n      description: "自動修正を実行し、再レビューする"\n    - label: "手動修正 (/specflow.fix_design)"\n      description: "手動で修正した後に再レビューする"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\nユーザーの選択に応じて分岐:\n- 「Auto-fix 実行」 → Step 6: Auto-fix Loop に進む\n- 「手動修正 (/specflow.fix_design)」 → 手動修正誘導メッセージを表示し、`Skill(skill: "specflow.fix_design")` を実行する\n- **スキップ/dismiss/タイムアウト時**: 「手動修正 (/specflow.fix_design)」を選択したものとして扱い、手動修正誘導メッセージを表示する\n\n**手動修正誘導メッセージ**:\n```\n手動修正モードに進みます。/specflow.fix_design で指摘を修正し、再レビューしてください。\n```',
			},
			{
				title: "Step 6: Auto-fix Loop",
				content:
					'\nユーザーが「Auto-fix 実行」を選択した場合、Bash orchestrator で auto-fix loop を実行する。\n\n### Run Orchestrator\n\n```bash\nspecflow-review-design autofix-loop <CHANGE_ID> --max-rounds <MAX_AUTOFIX_ROUNDS>\n```\n\nCapture stdout as `LOOP_JSON`. If the command fails (non-zero exit), display the error and **STOP**.\n\nParse `LOOP_JSON` as JSON. If parse fails, display raw output and **STOP**.\n\n### Display Loop Summary\n\n```\nAuto-fix Loop Complete (Plan):\n  - Total rounds: {LOOP_JSON.autofix.total_rounds}\n  - Result: {LOOP_JSON.autofix.result}\n  - Reason: {LOOP_JSON.autofix.result == "success" ? "unresolved high = 0" : LOOP_JSON.autofix.result}\n  - Remaining actionable: {LOOP_JSON.handoff.actionable_count} ({LOOP_JSON.handoff.severity_summary})\n```\n\n**スコア推移テーブル**（`LOOP_JSON.autofix.round_scores` が 1 件以上の場合に表示）:\n```\n| Round | Score | Unresolved High | New High |\n|-------|-------|-----------------|----------|\n| 1     | 12    | 3               | 1        |\n| 2     | 9     | 2               | 0        |\n```\n\n**Divergence 警告履歴**（`LOOP_JSON.autofix.divergence_warnings` が 1 件以上の場合に表示）:\n```\nDivergence Warnings:\n  - Round {round}: {type} ({detail})\n  - Round {round}: {type} ({detail})\n```\n`divergence_warnings` が空の場合、この警告履歴セクションは表示しない。\n\n### Ledger Summary Display (Loop)\n\nUse `LOOP_JSON.ledger` to display the same ledger summary format as Step 4:\n```\nReview Ledger (Plan): Round {round} | Status: {status} | Findings: {new} new, {open} open, {resolved} resolved\n```\nIf `round_summaries` has more than 1 entry, show the compact progress table and round-over-round diff.\n\n### Loop Handoff (based on LOOP_JSON.handoff.state)\n\n#### `loop_no_findings` (actionable_count == 0)\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n✅ Auto-fix complete — all findings resolved\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **実装に進む** → `/specflow.apply`\n- **Reject** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "Auto-fix loop 完了（成功）。次のアクションを選択してください"\n  options:\n    - label: "実装に進む"\n      description: "specflow で実装を実行"\n    - label: "Reject"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「実装に進む」 → `Skill(skill: "specflow.apply")`\n- 「Reject」 → `Skill(skill: "specflow.reject")`\n\n#### `loop_with_findings` (actionable_count > 0)\n\n残存する actionable findings の severity_summary を `LOOP_JSON.handoff.severity_summary` から取得。\n\n**テキストプロンプト（AskUserQuestion の前に必ず表示）**:\n```\n⚠ Auto-fix stopped — {LOOP_JSON.autofix.result == "success" ? "success (high resolved, lower-severity remaining)" : "max rounds reached"}. Remaining: {LOOP_JSON.handoff.severity_summary}\n\n次のアクションを選択してください（テキスト入力またはボタンで回答）:\n- **手動修正** → `/specflow.fix_design`\n- **実装に進む** → `/specflow.apply`\n- **Reject** → `/specflow.reject`\n```\n\n**AskUserQuestion（テキストプロンプトの直後に呼び出し）**:\n```\nAskUserQuestion:\n  question: "Auto-fix loop 停止（{result_reason}）。残存指摘: {severity_summary}\\n次のアクションを選択してください"\n  options:\n    - label: "手動修正 (/specflow.fix_design)"\n      description: "残りの指摘を手動で修正して再レビュー"\n    - label: "実装に進む"\n      description: "現状で実装に進む"\n    - label: "Reject"\n      description: "全変更を破棄して終了"\n```\n\n**入力受理**: 最初に受理された有効入力のみ採用。無効入力時はテキストプロンプトを再表示。\n\n- 「手動修正 (/specflow.fix_design)」 → `Skill(skill: "specflow.fix_design")`\n- 「実装に進む」 → `Skill(skill: "specflow.apply")`\n- 「Reject」 → `Skill(skill: "specflow.reject")`\n\n**IMPORTANT:** 全ハンドオフポイントで Dual-Display Fallback Pattern を適用すること — テキストプロンプトと AskUserQuestion の両方を必ず表示する。',
			},
			{
				title: "Important Rules",
				content:
					'\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- All artifacts (proposal, design, tasks, review-ledger-design, current-phase) are managed in `openspec/changes/<CHANGE_ID>/`.\n- If any tool call fails, report the error and ask the user how to proceed.\n- Ledger file is `FEATURE_DIR/review-ledger-design.json` (NOT `review-ledger.json`).\n- Phase is `"design"` in ledger JSON.\n- Auto-fix loop calls `specflow-review-design autofix-loop` (NOT `specflow.fix_apply`).\n- ALL control flow logic (Codex invocation, ledger CRUD, finding matching, score computation, current-phase generation) is handled by the `specflow-review-design` orchestrator. This slash command only calls the orchestrator, parses its JSON output, and displays UI.',
			},
		],
	},
	"specflow.setup": {
		frontmatter: {
			description: "Repository profile を解析・生成し、CLAUDE.md を更新する",
		},
		sections: [
			{
				title: "Overview",
				content:
					"\nリポジトリのエコシステムを検出し、構造化された project profile (`.specflow/profile.json`) を生成する。\n生成後、Claude adapter が profile から CLAUDE.md の managed セクションを自動レンダリングする。",
			},
			{
				title: "Prerequisites",
				content:
					'\n1. Run `ls CLAUDE.md` via Bash to confirm CLAUDE.md exists.\n   - If missing: "`CLAUDE.md` が見つかりません。先に `specflow-init` を実行してください。" → **STOP**.\n\n2. Read the current `CLAUDE.md` file to understand existing content.',
			},
			{
				title: "Step 1: Scope & Ecosystem Detection",
				content:
					"\nリポジトリルートでエコシステム検出を実行する。\n\n**検出マトリクス（優先順）:**\n1. `package.json` → JavaScript/TypeScript（lockfile で toolchain 判定: npm/pnpm/yarn/bun）\n2. `Cargo.toml`（`[workspace]` なし）→ Rust / cargo\n3. `go.mod` → Go / go\n4. `pyproject.toml` → Python（uv.lock/poetry.lock で toolchain 判定: uv/poetry/pip）\n\n**Out-of-scope 判定:**\n- Primary indicator が2つ以上 → エラー終了\n- Workspace 定義あり（`pnpm-workspace.yaml`, `Cargo.toml [workspace]`, `lerna.json`）→ エラー終了\n- Primary indicator なし → エラー終了\n- 同一エコシステム内で toolchain 曖昧 → ユーザーに選択を求める\n\nOut-of-scope の場合:\n```\nこのリポジトリ構成は現在のバージョンではサポートされていません。\n単一言語・単一ルートのリポジトリで setup を実行してください。\n```\n→ **STOP**.\n\n検出結果を報告:\n```\n[1/5] エコシステム検出完了\n\n言語: typescript\nツールチェーン: npm\nビルド: npm run build\nテスト: npm test\nリント: npm run lint\nフォーマット: npm run format\nソース: src/\nテスト: tests/\n生成物: dist/\n```\n\nユーザーに確認: 「検出結果を確認してください。修正があれば教えてください。」",
			},
			{
				title: "Step 2: Profile Load / Migration / Diff-and-Resolve",
				content:
					"\n**初回生成（`.specflow/profile.json` なし）:**\nStep 1 の検出結果からプロファイルを組み立て、ユーザーに確認する。\n\n追加で以下を質問:\n- 「編集禁止ゾーン（生成ファイル等）はありますか？」→ `forbiddenEditZones`\n- 「contract-sensitive なモジュールはありますか？」→ `contractSensitiveModules`\n- 「コーディング規約はありますか？」→ `codingConventions`\n- 「変更後の検証期待事項はありますか？」→ `verificationExpectations`\n\nスキップ可能（null として記録）。\n\n**再実行（既存 profile あり）:**\n`loadProfileForSetup()` で読み込む:\n- 古い schemaVersion → 自動 migration → ユーザー確認\n- 現在の schemaVersion → field-level diff\n  - 変更なし → 「変更は検出されませんでした。」で終了\n  - 差分あり → 各差分をユーザーに提示し、accept/reject を選択\n\nRequired 項目（`languages`, `toolchain`）が検出できない場合は対話的に入力を求め、入力完了までブロックする。",
			},
			{
				title: "Step 3: Schema Validation & Profile Write",
				content:
					"\n確定したプロファイルを schema validation にかける。\n\nValidation 失敗時:\n- エラー詳細を表示\n- ユーザーに修正を促す\n- 再度 validation を実行\n\nValidation 成功時:\n- `.specflow/profile.json` に atomic write で書き出す\n- 書き出し完了を報告:\n```\n[3/5] Profile 生成完了: .specflow/profile.json\n```",
			},
			{
				title: "Step 4: Claude Adapter Render Planning",
				content:
					"\nProfile から CLAUDE.md の managed セクションをレンダリングする。\n\nRenderer は `RenderResult` を返す:\n- `nextContent`: 提案される CLAUDE.md の内容\n- `warning`: 警告メッセージ（あれば）\n- `diffPreview`: 変更の diff プレビュー\n- `writeDisposition`: `safe-write` | `confirmation-required` | `abort`",
			},
			{
				title: "Step 5: CLAUDE.md Write Gate",
				content:
					"\nRenderer の `writeDisposition` に基づいて分岐する:\n\n**`safe-write`（マーカーあり、通常更新）:**\n- diff を表示して自動書き込み\n- 完了報告\n\n**`confirmation-required`（legacy migration）:**\n- warning を表示\n- diff プレビューを表示\n- ユーザーに accept/reject を求める\n- accept → CLAUDE.md を書き込み\n- reject → ファイルを変更しない\n\n**`abort`（マーカー異常 or version mismatch）:**\n- エラーメッセージを表示\n- CLAUDE.md を変更しない\n\n最終報告:\n```\n[5/5] Setup 完了\n\n生成されたファイル:\n  .specflow/profile.json\n  CLAUDE.md (updated)\n```",
			},
			{
				title: "Important Rules",
				content:
					"\n- Schema validation は profile 書き出し前に必ず実行する。\n- 検出結果を鵜呑みにせず、必ずユーザーに確認してから書き込む。\n- 検出できない項目は silent guess せず、`null` として記録するかユーザーに入力を求める。\n- Required 項目（languages, toolchain）は検出失敗時にブロックし、ユーザー入力を必須とする。\n- Setup のみが古い profile の schema migration を実行する。他の reader は version mismatch で中断する。\n- CLAUDE.md の書き込みは renderer の `writeDisposition` に従う。`confirmation-required` 時はユーザー確認なしに書き込まない。\n- `## MANUAL ADDITIONS` や managed マーカー外のコンテンツは一切変更しない。",
			},
		],
	},
	"specflow.spec": {
		frontmatter: {
			description:
				"既存コードベースを解析し、openspec/specs/ にベースライン spec を一括生成",
		},
		sections: [
			{
				title: "User Input",
				content: "\n```text\n$ARGUMENTS\n```",
			},
			{
				title: "Prerequisites",
				content:
					"\n1. Run `ls openspec/` via Bash to confirm OpenSpec is initialized.\n   - If missing:\n     ```\n     ❌ `openspec/` ディレクトリが見つかりません。\n\n     次のステップで初期化してください:\n     1. `openspec/config.yaml` を作成\n     2. `/specflow.spec` を再度実行\n     ```\n     → **STOP**.",
			},
			{
				title: "Step 1: コードベース解析",
				content:
					'\nプロジェクトのコードベースを解析し、capability 候補を検出する。\n\n### 1a. ディレクトリ構造スキャン\n\nGlob ツールで以下のパターンをスキャンする:\n- `src/**/*`, `lib/**/*`, `app/**/*`, `pkg/**/*`, `cmd/**/*`\n- `**/*.ts`, `**/*.js`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.java`, `**/*.kt`, `**/*.swift`, `**/*.rb`, `**/*.php`\n\n結果からプロジェクトのディレクトリ構造を把握する。\n\n### 1b. 設定ファイルの読み取り\n\nRead ツールで以下の設定ファイルを読み取る（存在するもののみ）:\n- `package.json`, `tsconfig.json`\n- `go.mod`, `go.sum`\n- `Cargo.toml`\n- `pyproject.toml`, `setup.py`, `requirements.txt`\n- `build.gradle`, `pom.xml`\n- `Gemfile`, `composer.json`\n- `CLAUDE.md`, `README.md`\n\n### 1c. 主要ソースファイルの内部読み取り\n\n設定ファイルとディレクトリ構造から、以下の種類のファイルを特定し Read ツールで内容を確認する:\n- エントリポイント（main.ts, index.ts, main.go, app.py 等）\n- ルーター/コントローラー（routes/, controllers/, handlers/ 配下）\n- モデル/スキーマ定義（models/, schemas/, types/ 配下）\n- 設定/ミドルウェア（config/, middleware/ 配下）\n\n### 1d. capability 候補の抽出\n\n解析結果から capability 候補をグルーピングする。各 capability には:\n- **名前**: ケバブケースの識別子（例: `user-auth`, `data-export`, `api-gateway`）\n- **概要**: 1-2 文の説明\n- **関連ファイル**: この capability に関連する主要ファイルパス\n\ncapability の粒度は「独立してテスト・変更可能な機能単位」を目安とする。\n\nReport: `Step 1 complete — <N> capability 候補を検出`\n\n### 1e. capability 候補が 0 件の場合\n\ncapability 候補が検出されなかった場合（プロジェクト構造が最小限、または認識可能なパターンがない場合）:\n\n```\nAskUserQuestion:\n  question: "⚠️ capability 候補を自動検出できませんでした。手動で capability を定義してください。\\n\\ncapability 名をカンマ区切りで入力してください（例: user-auth, data-export）"\n  options: (なし — 自由入力)\n```\n\nユーザーの入力をカンマで分割し、各値をトリムして capability リストを構築する。空の入力の場合は再度プロンプトを表示する。\n\n構築した capability リストで Step 3 に進む（Step 2 の選択ステップはスキップ）。',
			},
			{
				title: "Step 2: capability 選択",
				content:
					'\n検出した capability 一覧をユーザーに提示し、生成対象を選択させる。\n\n`AskUserQuestion` の multiSelect モードを使用する:\n\n```\nAskUserQuestion:\n  question: "以下の capability が検出されました。spec を生成する対象を選択してください。"\n  multiSelect: true\n  options:\n    - label: "<capability-1-name>"\n      description: "<capability-1-summary>"\n    - label: "<capability-2-name>"\n      description: "<capability-2-summary>"\n    ...\n```\n\n**注意**: AskUserQuestion の options は最大 4 つ。候補が 5 つ以上ある場合は、優先度の高い上位 3 つを options に含め、4 つ目を「その他（追加入力）」とする。追加入力で残りの capability を指定可能にする。\n\nユーザーが「その他」を選んだ場合、自由入力で capability 名を追加できる。\n\nReport: `Step 2 complete — <N> capability を選択`',
			},
			{
				title: "Step 3: capability ごとのインタラクティブ質問",
				content:
					'\n選択された各 capability について、以下の質問を AskUserQuestion で1つずつ提示する。\n\n### 質問 1: スコープ確認\n\n```\nAskUserQuestion:\n  question: "<capability-name> のスコープ: この capability がカバーする範囲を確認します。以下の推定は正しいですか？\\n\\n推定スコープ: <コード解析から推定したスコープの説明>\\n関連ファイル: <detected files>"\n  options:\n    - label: "正しい"\n      description: "推定スコープで spec を生成する"\n    - label: "修正する"\n      description: "スコープを修正してから spec を生成する"\n```\n\n「修正する」を選んだ場合、自由入力でスコープの修正を受け付ける。\n\n### 質問 2: 主要要件\n\n```\nAskUserQuestion:\n  question: "<capability-name> の主要要件: コード解析から以下の要件を推定しました。追加・修正はありますか？\\n\\n<推定要件リスト>"\n  options:\n    - label: "このまま進む"\n      description: "推定要件で spec を生成する"\n    - label: "追加・修正する"\n      description: "要件を追加・修正する"\n```\n\n### 質問 3: 制約・前提条件\n\n```\nAskUserQuestion:\n  question: "<capability-name> の制約: 依存関係、パフォーマンス要件、セキュリティ要件などの制約はありますか？"\n  options:\n    - label: "特になし"\n      description: "制約なしで spec を生成する"\n    - label: "制約を追加"\n      description: "制約を記述する"\n```\n\nReport: `Step 3 complete — <capability-name> の質問完了`',
			},
			{
				title: "Step 4: spec ファイル生成",
				content:
					"\n選択された各 capability について spec ファイルを生成する。\n\n### 4a. capability 名の正規化\n\n入力された capability 名を正規化する:\n1. 小文字化\n2. スペース・アンダースコアをハイフンに置換\n3. 連続ハイフンを単一ハイフンに\n4. 先頭末尾のハイフンを除去\n\n重複する正規化後の名前がある場合、警告を表示して統合する。\n\n### 4b. ディレクトリ作成\n\n```bash\nmkdir -p openspec/specs/<normalized-name>\n```\n\n### 4c. spec ファイル生成（CLI 優先 + フォールバック）\n\n**CLI プローブ**: まず OpenSpec CLI のテンプレートを取得を試みる:\n\n```bash\nopenspec templates --json\n```\n\nJSON 出力の `specs` キーにテンプレートパスが存在する場合:\n1. そのテンプレートファイルを Read ツールで読み取る\n2. テンプレートの構造に従って spec を生成する（ただしベースライン spec はデルタ形式ではないため、`## ADDED Requirements` ヘッダは `## Requirements` に読み替える）\n\nCLI テンプレートが取得できない場合（コマンド失敗、`specs` キーなし等）、以下の **canonical fallback template** を使用する:\n\n```markdown\n# <capability-name> Specification",
			},
			{
				title: "Purpose",
				content: "<capability の目的を1-2文で記述>",
			},
			{
				title: "Requirements",
				content:
					'### Requirement: <requirement name>\n<requirement description using SHALL/MUST>\n\n#### Scenario: <scenario name>\n- **WHEN** <condition>\n- **THEN** <expected outcome>\n```\n\nStep 3 の質問回答とコード解析の結果を統合して、各セクションを具体的に記述する。\n\n### 4d. spec 検証\n\n生成した各 spec ファイルに対して構造検証を実行する:\n\n```bash\nopenspec validate "<normalized-name>" --type spec --json\n```\n\nvalidation エラーがある場合:\n- エラー内容をユーザーに表示\n- `AskUserQuestion` で「修正する」/「スキップ」を選択させる\n- 「修正する」を選んだ場合、エラーを修正して再度 validate\n\nReport: `Step 4 complete — openspec/specs/<name>/spec.md を生成`',
			},
			{
				title: "Step 5: 完了報告とハンドオフ",
				content: "\n生成結果のサマリーを表示する:\n\n```",
			},
			{
				title: "Spec Bootstrap 完了",
				content:
					'\n| # | Capability | Path | Status |\n|---|-----------|------|--------|\n| 1 | <name> | openspec/specs/<name>/spec.md | ✅ |\n| 2 | <name> | openspec/specs/<name>/spec.md | ✅ |\n\n生成された spec: <N> 件\n```\n\n`AskUserQuestion` で次のアクションを提示:\n\n```\nAskUserQuestion:\n  question: "次のアクションを選択してください"\n  options:\n    - label: "specflow に進む"\n      description: "/specflow で change の proposal 作成に進む"\n    - label: "spec を修正"\n      description: "生成された spec を手動で編集する"\n    - label: "終了"\n      description: "spec bootstrap を終了する"\n```\n\n- 「specflow に進む」 → 完了メッセージを表示して終了。ユーザーが `/specflow` を実行できる状態にする。\n- 「spec を修正」 → 修正対象の spec を選択させ、編集後に再度ハンドオフを表示。\n- 「終了」 → 完了メッセージを表示して終了。',
			},
			{
				title: "Important Rules",
				content:
					"\n- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all relative paths.\n- Baseline spec は `openspec/specs/<name>/spec.md` に配置する（`openspec/changes/` ではない）。\n- `openspec new spec` コマンドは現在サポートされていないため、`mkdir -p` で直接ディレクトリを作成する。\n- spec のフォーマットは既存の `openspec/specs/*/spec.md` と互換性を保つこと。\n- If any tool call fails, report the error and ask the user how to proceed.",
			},
		],
	},
};
