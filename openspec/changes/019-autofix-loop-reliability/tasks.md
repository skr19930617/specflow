<!-- Historical Migration
  Source: specs/019-autofix-loop-reliability/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: Auto-fix Loop Reliability

**Input**: Design documents from `/specs/019-autofix-loop-reliability/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — modifying existing files only.

- [x] T001 Read `global/specflow.impl_review.md` fully and identify all AskUserQuestion call locations and handoff logic
- [x] T002 [P] Read `global/specflow.fix.md` fully and identify all AskUserQuestion call locations and handoff logic

---

## Phase 2: Foundational

**Purpose**: Add the actionable findings definition that all user stories depend on.

- [x] T003 Add explicit "actionable findings" definition (`status ∈ {"new", "open"}`) near the existing `actionable_count` logic (~line 255) in `global/specflow.impl_review.md`
- [x] T003a Add the State-to-Option Mapping table (FR-006) as a reference section in `global/specflow.impl_review.md` near the handoff logic, listing all 5 states with their exact label → command mappings
- [x] T003b Add the fallback validation/retry instruction template (exact label or slash command match, case-insensitive on label only, no partial matches, re-display on invalid) as a reusable pattern in `global/specflow.impl_review.md`

**Checkpoint**: Actionable findings definition + state mapping + fallback pattern in place — user story implementation can begin.

---

## Phase 3: User Story 1 - Auto-fix confirmation always visible (Priority: P1) 🎯 MVP

**Goal**: Ensure a confirmation prompt is always visible after impl review by adding dual-display at the two post-review handoff points.

**Independent Test**: Run `/specflow.impl_review` on a feature with actionable findings. Verify text prompt + AskUserQuestion both appear.

### Implementation for User Story 1

- [x] T004 [US1] Add 1-line status message `"⚠ Review complete — N actionable finding(s)"` before the auto-fix confirmation AskUserQuestion (~line 293) in `global/specflow.impl_review.md`
- [x] T005 [US1] Add text-based option list (Auto-fix 実行 / 手動修正 with canonical commands) before the auto-fix confirmation AskUserQuestion (~line 293) in `global/specflow.impl_review.md`
- [x] T006 [US1] Add first-wins rule note after the auto-fix confirmation AskUserQuestion in `global/specflow.impl_review.md`
- [x] T007 [US1] Add 1-line status message before the zero-findings approval AskUserQuestion (~line 276) in `global/specflow.impl_review.md`
- [x] T008 [US1] Add text-based option list (Approve / 手動修正 / 中止 with canonical commands) before the zero-findings approval AskUserQuestion (~line 276) in `global/specflow.impl_review.md`
- [x] T009 [US1] Add first-wins rule note after the zero-findings approval AskUserQuestion in `global/specflow.impl_review.md`

**Checkpoint**: Post-review handoffs always show dual-display.

---

## Phase 4: User Story 2 - Loop completion always transitions clearly (Priority: P1)

**Goal**: Ensure a next-action prompt is always visible after auto-fix loop completion by adding dual-display at the two post-loop handoff points.

**Independent Test**: Run auto-fix loop to completion. Verify text prompt + AskUserQuestion both appear at the end.

### Implementation for User Story 2

- [x] T010 [US2] Add 1-line status message `"✅ Auto-fix complete — all findings resolved"` before the loop-success AskUserQuestion (~line 431) in `global/specflow.impl_review.md`
- [x] T011 [US2] Add text-based option list (Approve / 手動修正 / 中止 with canonical commands) before the loop-success AskUserQuestion (~line 431) in `global/specflow.impl_review.md`
- [x] T012 [US2] Add first-wins rule note after the loop-success AskUserQuestion in `global/specflow.impl_review.md`
- [x] T013 [US2] Add 1-line status message `"⚠ Auto-fix stopped — N finding(s) remaining"` before the loop-stopped AskUserQuestion (~line 448) in `global/specflow.impl_review.md`
- [x] T014 [US2] Add text-based option list (Auto-fix 続行 / 手動修正 / Approve / 中止 with canonical commands) before the loop-stopped AskUserQuestion (~line 448) in `global/specflow.impl_review.md`
- [x] T015 [US2] Add first-wins rule note after the loop-stopped AskUserQuestion in `global/specflow.impl_review.md`
- [x] T016 [P] [US2] Add 1-line status message AND text-based fallback prompt with canonical commands before the diff line count AskUserQuestion (~line 108) in `global/specflow.fix.md`
- [x] T017 [P] [US2] Add 1-line status message AND text-based fallback prompt with canonical commands before the normal-mode handoff AskUserQuestion (~line 367) in `global/specflow.fix.md`

**Checkpoint**: All loop-completion handoffs show dual-display.

---

## Phase 5: User Story 3 - Auto-proceed when no fixes needed (Priority: P2)

**Goal**: Skip auto-fix confirmation when no actionable findings exist and go directly to approval handoff.

**Independent Test**: Run `/specflow.impl_review` on a feature with no actionable findings. Verify auto-fix confirmation is skipped and approval options appear directly.

### Implementation for User Story 3

- [x] T018 [US3] Verify the existing branching logic (~line 265-269) in `global/specflow.impl_review.md` correctly routes `actionable_count == 0` to the approval handoff (not auto-fix confirmation)
- [x] T019 [US3] If needed, update the zero-findings branch to skip auto-fix confirmation and display approval handoff with dual-display pattern in `global/specflow.impl_review.md`

**Checkpoint**: Clean reviews skip auto-fix and go to approval.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistency verification and status messages at remaining transition points.

- [x] T020 Add 1-line status message + text-based fallback prompt + fallback validation/retry (using the pattern from T003b) before the diff line count warning AskUserQuestion (~line 75) in `global/specflow.impl_review.md`
- [x] T021 Read both modified files end-to-end to verify ALL 7 AskUserQuestion calls have: 1-line status + text fallback prompt + first-wins note + fallback validation/retry
- [x] T022 Verify option sets at every handoff match the State-to-Option Mapping table from T003a
- [x] T023 Run quickstart.md validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — read files first
- **US1 (Phase 3)**: Depends on Foundational (T003)
- **US2 (Phase 4)**: Depends on Foundational (T003), can run in parallel with US1 (different line ranges in same file)
- **US3 (Phase 5)**: Depends on Foundational (T003), can run in parallel with US1/US2
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — post-review handoff points only
- **User Story 2 (P1)**: Independent — post-loop handoff points + specflow.fix.md
- **User Story 3 (P2)**: Independent — zero-findings branch only

### Parallel Opportunities

- T001/T002: Read both files in parallel
- US1 + US2: Can be implemented in parallel (different sections of same file + different file)
- T016/T017: specflow.fix.md edits can run in parallel with impl_review.md edits

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Read files
2. Complete Phase 2: Add actionable findings definition
3. Complete Phase 3: Dual-display at post-review handoffs
4. **STOP and VALIDATE**: Test `/specflow.impl_review` with findings
5. Deploy if ready

### Incremental Delivery

1. Setup + Foundational → Definition in place
2. Add US1 → Post-review handoffs have dual-display → Test
3. Add US2 → Post-loop handoffs have dual-display → Test
4. Add US3 → Zero-findings skip auto-fix → Test
5. Polish → Verify consistency across all files

---

## Notes

- All edits are to Markdown prompt files — no code compilation or build steps
- Line numbers are approximate — read files before editing to confirm exact locations
- The dual-display pattern is identical at every handoff: status line → text options → AskUserQuestion
- Total tasks: 25 (2 setup, 3 foundational, 6 US1, 8 US2, 2 US3, 4 polish)
- All 7 handoff points enumerated: impl_review.md (5: line ~75, ~276, ~293, ~431, ~448) + specflow.fix.md (2: line ~108, ~367)
