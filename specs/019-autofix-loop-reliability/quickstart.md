# Quickstart: Auto-fix Loop Reliability

## What This Feature Does

Ensures the specflow auto-fix workflow never stalls by:
1. Displaying a text prompt before every AskUserQuestion button prompt (dual-display)
2. Showing the correct options for each handoff state
3. Skipping auto-fix confirmation when no actionable findings exist
4. Adding 1-line status messages at each transition point

## Files to Modify

1. `global/specflow.impl_review.md` — 5 handoff points
2. `global/specflow.fix.md` — 2 handoff points

## Testing

Run `/specflow.impl_review` on a feature with review findings. Verify:
- Text prompt appears before button prompt at every handoff
- Correct options shown for each state
- Clean reviews skip auto-fix confirmation
- 1-line status message at each transition
