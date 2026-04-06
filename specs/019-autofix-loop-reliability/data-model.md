# Data Model: Auto-fix Loop Reliability

## No New Entities

This feature modifies behavior in existing slash command files (Markdown prompts). No new data entities, schemas, or storage are introduced.

## Existing Entities Referenced

### Review Ledger (`review-ledger.json`)

Already defined in the existing impl review system. Key fields relevant to this feature:

- `findings[].status`: One of `new`, `open`, `resolved`, `accepted_risk`, `ignored`
- **Actionable**: `status ∈ {"new", "open"}` — triggers auto-fix confirmation
- **Non-actionable**: `status ∈ {"resolved", "accepted_risk", "ignored"}` — triggers approval handoff

### Handoff State Model (New — implicit in command logic)

| State | Condition | Options |
|-------|-----------|---------|
| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" / "手動修正" |
| `review_no_findings` | `actionable_count == 0` after review | "Approve" / "手動修正" / "中止" |
| `loop_with_findings` | `actionable_count > 0` after loop | "Auto-fix 続行" / "手動修正" / "Approve" / "中止" |
| `loop_no_findings` | `actionable_count == 0` after loop | "Approve" / "手動修正" / "中止" |
