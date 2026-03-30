# Data Model: Approval Summary Generation

## Entities

### approval-summary.md (Output)

A Markdown file with the following fixed structure:

```markdown
# Approval Summary: <feature-id>

**Generated**: <timestamp>
**Branch**: <branch-name>
**Status**: ⚠️ <N> unresolved high | ✅ No unresolved high

## What Changed
<git diff --stat output, excluding approval-summary.md>

## Spec Coverage
| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | <criterion summary> | Yes/No   | <file list>  |

**Coverage Rate**: <covered>/<total> (<percentage>%)

## Review Loop Summary
| Metric             | Count |
|--------------------|-------|
| Initial high       | <n>   |
| Resolved high      | <n>   |
| Unresolved high    | <n>   |
| New high (later)   | <n>   |
| Total rounds       | <n>   |

## Remaining Risks
### Unresolved Review Findings (medium+)
- <finding-id>: <title> (severity: <sev>)

### Diff-Inferred Risks
- <risk description>

## Files Touched
<file list from git diff --name-only, excluding approval-summary.md>

## Human Checkpoints
- [ ] <checkpoint 1>
- [ ] <checkpoint 2>
- [ ] <checkpoint 3>
```

### review-ledger.json (Input — existing, read-only)

Schema per existing features (002, 003, 005):

```json
{
  "feature_id": "string",
  "phase": "string",
  "current_round": "integer",
  "status": "string (has_open_high | all_resolved | in_progress)",
  "max_finding_id": "integer",
  "findings": [
    {
      "id": "string (R{round}-F{number})",
      "origin_round": "integer",
      "latest_round": "integer",
      "severity": "string (high | medium | low)",
      "category": "string",
      "file": "string",
      "title": "string",
      "detail": "string",
      "status": "string (new | open | resolved | overridden)",
      "relation": "string (new | ...)",
      "supersedes": "string | null",
      "notes": "string"
    }
  ],
  "round_summaries": [
    {
      "round": "integer",
      "total": "integer",
      "open": "integer",
      "new": "integer",
      "resolved": "integer",
      "overridden": "integer",
      "by_severity": {
        "high": { "open": "int", "resolved": "int", "new": "int", "overridden": "int" },
        "medium": { "open": "int", "resolved": "int", "new": "int", "overridden": "int" },
        "low": { "open": "int", "resolved": "int", "new": "int", "overridden": "int" }
      }
    }
  ]
}
```

### spec.md (Input — existing, read-only)

Acceptance criteria are extracted from:
1. `Acceptance Scenarios` subsections under each User Story (each `**Given**/**When**/**Then**` line = 1 criterion)
2. Fallback: `Functional Requirements` (each `FR-NNN` bullet = 1 criterion)

## Relationships

```
review-ledger.json ──→ Review Loop Summary (deterministic counting)
review-ledger.json ──→ Remaining Risks: deterministic (unresolved findings)
review-ledger.json ──→ Remaining Risks: untested files (string-match finding.file vs diff)
spec.md ──→ Spec Coverage (LLM-inferred criteria-to-file mapping)
spec.md ──→ Remaining Risks: uncovered criteria (carry-over from Spec Coverage)
git diff ──→ What Changed, Files Touched (deterministic)
git diff ──→ Spec Coverage (LLM input)
git diff ──→ Remaining Risks: untested files (diff file list)
All inputs ──→ Human Checkpoints (LLM-inferred)
```
