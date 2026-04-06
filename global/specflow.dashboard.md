---
description: 全featureのレビュー台帳を集計し、ダッシュボードとして表示・保存
---

## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing: `"❌ speckit が見つかりません。"` → **STOP**.
2. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing: `"❌ .specflow/config.env が見つかりません。"` → **STOP**.

## Step 1: Discover Features

1. Run via Bash to get the repository root:
   ```bash
   git rev-parse --show-toplevel
   ```

2. List all feature directories under `openspec/changes/`:
   ```bash
   ls -d openspec/changes/*/proposal.md 2>/dev/null | sed 's|/proposal.md||'
   ```
   Each result is a feature directory. Only directories containing `proposal.md` are included.

3. If no features found, display: `"レビュー対象のfeatureがありません。"` → **STOP**.

## Step 2: Collect Ledger Data

For each feature directory found in Step 1:

1. Extract the feature name from the directory path (e.g., `openspec/changes/007-current-phase` → `007-current-phase`).

2. Attempt to read each of the 3 ledger files via Read tool:
   - `<feature_dir>/review-ledger-spec.json` (spec phase)
   - `<feature_dir>/review-ledger-plan.json` (plan phase)
   - `<feature_dir>/review-ledger.json` (impl phase)

3. For each ledger file:
   - **If file does not exist**: record phase as "missing"
   - **If file exists but JSON parse fails**: record phase as "error"
   - **If file exists and valid JSON**: extract:
     - `rounds`: length of `round_summaries` array
     - `finding_count`: length of `findings` array
     - `resolved_count`: count of findings where `status == "resolved"`
     - `resolution_rate`: if `finding_count > 0`, compute `resolved_count / finding_count * 100` (rounded to integer). If `finding_count == 0`, record as "-"

## Step 3: Generate Dashboard Table

Build a Markdown table with the following columns:

```
| Feature | Spec Rounds | Spec Findings | Spec Rate | Plan Rounds | Plan Findings | Plan Rate | Impl Rounds | Impl Findings | Impl Rate |
```

### Display Value Mapping

For each phase cell:

| State | Rounds | Findings | Rate |
|-------|--------|----------|------|
| Ledger file missing | `-` | `-` | `-` |
| Ledger exists, findings empty | `<rounds>` | `0` | `-` |
| Ledger exists, findings non-empty | `<rounds>` | `<count>` | `<rate>%` |
| Ledger parse error | `⚠️` | `⚠️` | `⚠️` |

### Table Footer

After the table, display a summary line:
```
**Total**: <N> features | Spec reviewed: <N> | Plan reviewed: <N> | Impl reviewed: <N>
```
Where "reviewed" means the ledger file exists (regardless of error state).

## Step 4: Display and Save

1. **Display in terminal**: Output the dashboard as a formatted CLI table. Use Markdown table syntax (which renders well in Claude Code's terminal output). Include the header, data rows, and summary line.

2. **Save to file**: Write the dashboard to `openspec/review-dashboard.md` with the following format:

```markdown
# Review Dashboard

**Generated**: <current timestamp in YYYY-MM-DD HH:MM format>
**Repository**: <repository root directory name>

<table from Step 3>

<summary line from Step 3>
```

Report: `Dashboard saved to openspec/review-dashboard.md`

## Important Rules

- Use the git repository root as the base for all relative paths.
- Never modify ledger files — read-only access.
- If a feature directory exists but has no ledger files at all, include it in the table with all phases showing `-`.
- Sort features by directory name (natural sort order).
