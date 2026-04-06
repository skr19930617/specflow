<!-- Historical Migration
  Source: specs/019-autofix-loop-reliability/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: Auto-fix Loop Reliability

**Branch**: `019-autofix-loop-reliability` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/019-autofix-loop-reliability/spec.md`

## Summary

Ensure the specflow auto-fix workflow never stalls by adding a "dual-display" pattern (text prompt + AskUserQuestion) at every handoff point, defining explicit state-based option sets, and skipping unnecessary confirmations when no actionable findings exist.

## Technical Context

**Language/Version**: Markdown (Claude Code slash commands) + Bash  
**Primary Dependencies**: Claude Code CLI, AskUserQuestion tool, specflow slash commands  
**Storage**: File-based — `specs/<feature>/review-ledger.json` (read-only for this feature)  
**Testing**: Manual — run `/specflow.impl_review` and verify prompts appear correctly  
**Target Platform**: Claude Code CLI / VS Code extension  
**Project Type**: CLI tool (slash command prompts)  
**Constraints**: Changes are limited to Markdown prompt files; no new scripts or data schemas

## Constitution Check

*No project constitution is configured (template only). Skipping gates.*

## Project Structure

### Source Code (repository root)

```text
global/
├── specflow.impl_review.md   # Primary target — 5 handoff points
└── specflow.fix.md            # Secondary target — 2 handoff points
```

## Implementation Phases

### Phase 1: Define Actionable Findings (specflow.impl_review.md)

Add an explicit definition of "actionable findings" near the existing actionable_count logic (~line 255):

```
**Actionable findings definition**: A finding is "actionable" if its `status` is `"new"` or `"open"`. 
Findings with status `"resolved"`, `"accepted_risk"`, or `"ignored"` are non-actionable.
```

### Phase 2: Add Dual-Display to impl_review.md (5 Handoff Points)

For each of the 5 AskUserQuestion calls in `specflow.impl_review.md`, add a text-based prompt immediately before the AskUserQuestion call:

1. **Line ~75** (diff line count warning): Add status line before AskUserQuestion
2. **Line ~276-283** (zero actionable findings → approval): Add status `"✅ Review complete — all findings resolved"` + text options (Approve / 手動修正 / 中止) before AskUserQuestion
3. **Line ~293-300** (actionable findings → auto-fix confirmation): Add status `"⚠ Review complete — N actionable finding(s)"` + text options (Auto-fix 実行 / 手動修正) before AskUserQuestion
4. **Line ~431-441** (auto-fix loop success): Add status `"✅ Auto-fix complete — all findings resolved"` + text options (Approve / 手動修正 / 中止) before AskUserQuestion
5. **Line ~448-457** (auto-fix loop stopped with remaining): Add status `"⚠ Auto-fix stopped — N finding(s) remaining"` + text options (Auto-fix 続行 / 手動修正 / Approve / 中止) before AskUserQuestion

**Dual-display pattern** (applied at each point):
```markdown
[1-line status message]

次のアクションを選択してください（テキスト入力またはボタンで回答）:
- **Auto-fix 実行** → `/specflow.fix autofix`
- **手動修正** → `/specflow.fix`

[AskUserQuestion call with the same options]
```

Add a note after each AskUserQuestion: "最初に受理された入力（ボタンまたはテキスト）のみを採用する。"

**Fallback interaction pattern** (applied at each handoff point after the dual-display):
1. AskUserQuestion is called. If the user clicks a button, that response is used. Done.
2. If AskUserQuestion is dismissed/timed out/not rendered, the text prompt is already visible.
3. The system waits for the user's next text message.
4. On receiving text input, validate against the exact canonical commands for the current state (see State-to-Option Mapping below).
5. Accepted inputs per option: the exact label text OR the exact slash command (e.g., "Auto-fix 実行" or "/specflow.fix autofix"). Case-insensitive match only on the label. No partial matches.
6. If the input does not match any accepted value: re-display the text prompt with available options and wait again.
7. Repeat until a valid input is received. Never auto-select or proceed without user input.

**State-to-Option Mapping** (FR-006 — must be applied at each handoff):

| State | Condition | Options (label → command) |
|-------|-----------|--------------------------|
| `review_with_findings` | `actionable_count > 0` after review | "Auto-fix 実行" → `/specflow.fix autofix`, "手動修正" → `/specflow.fix` |
| `review_no_findings` | `actionable_count == 0` after review | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix`, "中止" → `/specflow.reject` |
| `loop_with_findings` | `actionable_count > 0` after loop | "Auto-fix 続行" → `/specflow.fix autofix`, "手動修正" → `/specflow.fix`, "Approve" → `/specflow.approve`, "中止" → `/specflow.reject` |
| `loop_no_findings` | `actionable_count == 0` after loop | "Approve" → `/specflow.approve`, "手動修正" → `/specflow.fix`, "中止" → `/specflow.reject` |
| `diff_warning` | Diff line count exceeds threshold | "続行" → continue, "中止" → abort |

### Phase 3: Add Dual-Display to specflow.fix.md (2 Handoff Points)

1. **Line ~108** (diff line count warning): Add status line before AskUserQuestion
2. **Line ~367-376** (normal mode handoff): Add dual-display pattern with state-appropriate options

### Phase 4: Add Skip Logic for Zero Findings

In `specflow.impl_review.md`, ensure the auto-fix confirmation is skipped when `actionable_count == 0`:
- The existing logic at ~line 265-269 already branches on `actionable_count`
- Verify the zero-findings branch goes directly to approval handoff (not auto-fix confirmation)
- Add the dual-display pattern to the approval handoff

### Phase 5: Verify and Test

1. Read both modified files end-to-end to verify consistency
2. Ensure every AskUserQuestion has a preceding text prompt
3. Verify option sets match FR-006 for each state
4. Ensure status messages are present at all transition points

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Text prompt duplicates button options visually | Medium | Low | Acceptable — redundancy is the point |
| Long text prompts clutter the conversation | Low | Low | Keep text prompts to 3-4 lines max |
| Existing handoff logic disrupted by edits | Medium | Medium | Read full file before editing; test manually |

## Complexity Tracking

No constitution violations to justify.
