# Data Model: Issue-Local current-phase.md

**Date**: 2026-04-02

## Entities

### current-phase.md (Output File)

A Markdown file at `specs/<feature>/current-phase.md` with the following key-value structure:

```markdown
# Current Phase: <feature_id>

- Phase: <impl-review | fix-review>
- Round: <integer>
- Status: <has_open_high | all_resolved | in_progress>
- Open High Findings: <count> 件 — "<title1>", "<title2>" | 0 件
- Accepted Risks: <title1> (accepted_risk, notes: "..."), <title2> (ignored, notes: "...") | none
- Latest Changes:
  - <commit_hash> <commit_subject>
  - ...
- Next Recommended Action: </specflow.fix | /specflow.approve>
```

### Field Derivation Sources

| Field | Source | Type |
|-------|--------|------|
| feature_id | `review-ledger.feature_id` or directory name | string |
| Phase | `review-ledger.current_round` | string (derived: round 1 → `impl-review`, round ≥ 2 → `fix-review`) |
| Round | `review-ledger.current_round` | integer |
| Status | `review-ledger.status` | enum: `has_open_high`, `all_resolved`, `in_progress` |
| Open High Findings | `review-ledger.findings[]` filtered by `severity=="high" AND status in ["new","open"]` | count + title list |
| Accepted Risks | `review-ledger.findings[]` filtered by `status in ["accepted_risk","ignored"]` | title + status + notes list |
| Latest Changes | `git log --oneline -5 $(git merge-base HEAD $BASE_BRANCH)..HEAD` | commit list |
| Next Recommended Action | Derived from Open High Findings count | string (command path) |

### review-ledger.json (Input — Existing, Not Modified)

See existing schema. Key fields consumed:
- `feature_id`: string
- `current_round`: integer
- `status`: enum
- `findings[]`: array of finding objects with `severity`, `status`, `title`, `notes` fields

No schema changes to review-ledger.json are in scope.

## State Transitions

```
[No current-phase.md] 
  → specflow.impl completes review → [current-phase.md created, Round 1]
  → specflow.fix completes re-review → [current-phase.md updated, Round N]
  → specflow.fix completes re-review → [current-phase.md updated, Round N+1]
  → ...
  → specflow.approve → [current-phase.md committed with other artifacts]
```

## Validation Rules

- All 7 fields MUST be present in every generation/update
- Open High Findings excludes findings with `status in ["accepted_risk", "ignored"]`
- Accepted Risks includes findings with `status in ["accepted_risk", "ignored"]` regardless of severity
- Latest Changes is capped at 5 lines
- Phase is derived from Round (not stored independently in ledger)
- Next Recommended Action: `Open High Findings > 0` → `/specflow.fix`; `== 0` → `/specflow.approve`
