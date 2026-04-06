# Quickstart: Issue-Local current-phase.md

**Date**: 2026-04-02

## What This Feature Does

Adds automatic generation and consumption of `specs/<feature>/current-phase.md` — a concise state summary that gives the next-phase Claude immediate orientation without parsing the full review-ledger.

## Files Modified

| File | Role | Change |
|------|------|--------|
| `global/specflow.impl.md` | Producer + Consumer | Add generation step after ledger write; add read step at command start |
| `global/specflow.fix.md` | Producer + Consumer | Add update step after ledger write; add read step at command start |
| `global/specflow.approve.md` | Consumer | Add read step at command start for context |

## Files Created (per feature, at runtime)

| File | When | By |
|------|------|-----|
| `specs/<feature>/current-phase.md` | After first impl review | specflow.impl |

## How It Works

1. **specflow.impl** runs → Codex reviews → ledger updated → **current-phase.md generated**
2. **specflow.fix** runs → reads current-phase.md for context → applies fixes → Codex re-reviews → ledger updated → **current-phase.md updated**
3. **specflow.approve** runs → reads current-phase.md for context → generates approval summary → commits all artifacts including current-phase.md

## Example Output

```markdown
# Current Phase: 007-current-phase

- Phase: fix-review
- Round: 2
- Status: has_open_high
- Open High Findings: 1 件 — "Missing edge case for malformed ledger"
- Accepted Risks: none
- Latest Changes:
  - abc1234 feat: add current-phase generation to specflow.impl
  - def5678 feat: add current-phase update to specflow.fix
  - ghi9012 feat: add current-phase read to specflow.approve
- Next Recommended Action: /specflow.fix
```

## Testing

Run a full specflow cycle on any feature and verify:
1. After `/specflow.impl`: `current-phase.md` exists with all 7 fields
2. After `/specflow.fix`: `current-phase.md` is updated with new round
3. `/specflow.approve`: reads current-phase.md as context
