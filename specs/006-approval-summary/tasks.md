# Tasks: Approval Summary Generation

**Input**: Design documents from `/specs/006-approval-summary/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Not requested in spec. No test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No new files to create. This feature modifies one existing file (`global/specflow.approve.md`). Setup verifies prerequisites.

- [x] T001 Read existing global/specflow.approve.md and identify insertion point between Quality Gate and Commit sections

---

## Phase 2: User Story 1 + 2 — Summary Generation + Review Loop Summary (Priority: P1) 🎯 MVP

**Goal**: Generate approval-summary.md with all 6 sections before commit, including accurate Review Loop Summary metrics.

**Independent Test**: Run `/specflow.approve` on a feature with a populated review-ledger.json. Verify approval-summary.md is created in `specs/<feature>/` with all sections. Verify Review Loop Summary counts match manual calculation from findings array.

### Implementation for User Story 1 + 2

- [x] T002 [US1] Add "Approval Summary Generation" section to global/specflow.approve.md after Quality Gate, before Commit. Compute normalized diff source ONCE: run `git diff main...HEAD --name-only`, `git diff main...HEAD --stat`, and `git diff main...HEAD` — all excluding `specs/<feature>/approval-summary.md`. Also read FEATURE_SPEC via check-prerequisites.sh and read review-ledger.json. All subsequent sections reuse these cached outputs.
- [x] T003 [US1] Add What Changed section generation logic to global/specflow.approve.md — output the cached `git diff main...HEAD --stat` result from T002 (already excludes approval-summary.md)
- [x] T004 [US1] Add Files Touched section generation logic to global/specflow.approve.md — output the cached `git diff main...HEAD --name-only` result from T002 (already excludes approval-summary.md)
- [x] T005 [US2] Add Review Loop Summary section generation logic to global/specflow.approve.md — compute initial_high, resolved_high, unresolved_high, new_later_high from findings array using the counting formulas from FR-003
- [x] T006 [US1] Add Spec Coverage section generation logic to global/specflow.approve.md — LLM reads acceptance criteria from spec and the cached diff, maps criteria to changed files, outputs Markdown table `| # | Criterion (summary) | Covered? | Mapped Files |` per FR-002a. After the table, compute and render coverage rate as `**Coverage Rate**: <covered>/<total> (<percentage>%)`. Store the covered/total counts for use in T011 terminal summary and the list of uncovered criteria for T007.
- [x] T007 [US1] Add Remaining Risks section generation logic to global/specflow.approve.md. Three sources, in order:
  1. **Deterministic**: Extract findings from review-ledger where `(status == "open" || status == "new") && (severity == "medium" || severity == "high")`. List each as `- <id>: <title> (severity: <sev>)`.
  2. **Untested new files**: From cached diff file list, find new `.sh` or `.md` files (excluding `specs/*/spec.md`, `specs/*/plan.md`, `specs/*/tasks.md`, `specs/*/approval-summary.md`) whose path does not appear in any finding's `file` field. List as warnings.
  3. **Uncovered criteria**: Consume the uncovered criteria list output from T006 (Spec Coverage). List each as a risk item. This creates a data dependency on T006.
- [x] T008 [US1] Add unresolved high indicator to summary header per FR-005 — prominent warning if unresolved_high > 0, clear "no unresolved high" otherwise
- [x] T009 [US3] Add Human Checkpoints section generation logic to global/specflow.approve.md — LLM reads spec, review-ledger findings, and diff to generate 3–5 actionable checkpoints requiring human judgment. Output as checkbox list. This MUST be generated before writing the file.
- [x] T010 [US1] Write the assembled approval-summary.md (all 6 sections complete) to specs/<feature>/approval-summary.md
- [x] T011 [US1] Add terminal summary display with key metrics (unresolved high count, spec coverage rate, risk count) and AskUserQuestion prompt for "続行" / "中止" per FR-009
- [x] T012 [US1] Add abort logic — if user chooses "中止", stop the approve flow without committing
- [x] T013 [US1] Ensure the existing Commit section's `git add -A` command (already present in specflow.approve.md) will pick up `specs/<feature>/approval-summary.md`. Verify that the existing `git add -A -- . ':(exclude).specflow'` pattern does NOT exclude `specs/` — it only excludes `.specflow/`. No modification needed if the pattern is correct; add an explicit note in the approve flow confirming approval-summary.md is staged.

**Checkpoint**: At this point, all 6 sections are generated, file is written, staged, and user confirmation flow works. Full feature is functional.

---

## Phase 3: Edge Cases & Degraded Mode

**Purpose**: Handle missing/malformed inputs gracefully per FR-007.

- [x] T014 Add degraded mode handling to global/specflow.approve.md. Handle each input failure as warning-only (never hard-stop):
  - **review-ledger.json missing or empty**: Review Loop Summary and Remaining Risks (deterministic) display "No review data available". Human Checkpoints generates from spec + diff only.
  - **review-ledger.json malformed (JSON parse error)**: Wrap JSON.parse in try/catch. On failure, display "⚠️ review-ledger.json parse error — review data unavailable" in affected sections. Continue with remaining inputs.
  - **spec.md missing**: Spec Coverage displays "Spec not found — coverage cannot be computed". Coverage rate omitted from terminal summary. Human Checkpoints generates from ledger + diff only.
  - **spec.md malformed (no recognizable acceptance criteria)**: Spec Coverage displays "No criteria found". Coverage rate omitted.
  - **git diff failure** (e.g., main branch not found, git error): What Changed, Files Touched, Spec Coverage, and Remaining Risks (untested files) display "⚠️ Diff unavailable". Summary still generated with ledger-only sections (Review Loop Summary, deterministic Remaining Risks).
  - In ALL warning cases, the terminal summary MUST flag which sections are degraded (e.g., "⚠️ Degraded: Review Loop Summary, Remaining Risks") and still allow "続行".

**Checkpoint**: Approve flow handles all edge cases gracefully.

---

## Phase 4: Verification & Polish

- [x] T015 Verify single-round scenario: use a review-ledger.json with only round 1 findings (all status "new"). Confirm Review Loop Summary shows resolved=0, new_later=0
- [x] T016 Verify multi-round scenario: use a review-ledger.json with round 1 and round 2 findings (mix of resolved, open, new). Confirm counts match manual calculation
- [x] T017 Verify degraded mode: test with missing review-ledger.json, missing spec.md, malformed JSON, and git diff failure. Confirm warnings display and user can still choose "続行"
- [x] T018 Verify abort flow: choose "中止" after summary display and confirm approve flow stops without committing
- [x] T019 Verify complete approve flow end-to-end: Quality Gate → Summary Generation → User Confirmation → Commit → Push → PR. Ensure approval-summary.md appears in committed files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — read existing file
- **Phase 2 (US1+US2+US3)**: Depends on Phase 1 — all 6 sections, file write, staging confirmation, user prompt
- **Phase 3 (Edge Cases)**: Depends on Phase 2 — adds degraded mode handling (T014)
- **Phase 4 (Verification)**: Depends on Phase 2 and 3 — scenario verification and end-to-end (T015–T019)

### Within Phase 2

- T002 (setup/read inputs) must complete first
- T003, T004 (What Changed, Files Touched) can run in parallel — deterministic, independent
- T005 (Review Loop Summary) can run in parallel with T003/T004 — independent computation
- T006 (Spec Coverage) depends on having the diff data from T002
- T007 (Remaining Risks) depends on T005 (unresolved findings) and T006 (uncovered criteria)
- T008 (header indicator) depends on T005 (unresolved_high count)
- T009 (Human Checkpoints) can run in parallel with T007/T008 — independent LLM generation
- T010 (write file) depends on T003–T009 (all 6 sections must be complete)
- T011–T012 (terminal display + abort) depend on T010
- T013 (staging confirmation) depends on T010 (file must exist to verify staging)

### Parallel Opportunities

- T003, T004, T005 can be authored in parallel (independent sections)
- T007, T008, T009 can be authored in parallel (independent sections)

---

## Implementation Strategy

### MVP First (Phase 1 + 2)

1. Read existing approve flow (T001)
2. Implement all 6 sections + terminal prompt (T002–T012)
3. **STOP and VALIDATE**: Test with a real feature's review-ledger.json
4. Verify counting accuracy against manual calculation

### Incremental Delivery

1. Phase 1+2 → Core summary generation with all 6 sections (MVP)
2. Phase 3 → Edge case handling
3. Phase 4 → Verification of all acceptance scenarios

---

## Notes

- All tasks modify a single file: `global/specflow.approve.md`
- The tasks are written as sequential instructions for modifying the same file, so parallelism is logical (designing sections) rather than file-level
- No new source files are created — only the output artifact `specs/<feature>/approval-summary.md` is generated at runtime
- The `.specflow/` directory is read-only — never modify files there
