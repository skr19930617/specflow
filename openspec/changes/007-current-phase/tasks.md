<!-- Historical Migration
  Source: specs/007-current-phase/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: Issue-Local current-phase.md

**Input**: Design documents from `/specs/007-current-phase/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project structure needed. This feature modifies existing files only.

- [x] T001 Read and understand the current `global/specflow.impl.md` structure, identifying the exact insertion points for producer (after Step 2.5 ledger write) and consumer (at command start) logic
- [x] T002 [P] Read and understand the current `global/specflow.fix.md` structure, identifying the exact insertion points for producer (after ledger write) and consumer (at command start) logic
- [x] T003 [P] Read and understand the current `global/specflow.approve.md` structure, identifying the exact insertion point for consumer (at command start, before quality gate) logic

**Checkpoint**: All three slash command files have been read and insertion points identified

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared current-phase.md generation logic that both producers will use

- [x] T004 Define the canonical current-phase.md generation instructions as a reusable text block. This block will be inserted into both specflow.impl and specflow.fix. It must include:
  1. Read the just-written `review-ledger.json` from `FEATURE_DIR`
  2. Extract `feature_id` (or derive from directory name), `current_round`, `status`, `findings[]`
  3. Filter findings where `severity == "high"` AND `status in ["new", "open"]` → count + titles for Open High Findings
  4. Filter findings where `status in ["accepted_risk", "ignored"]` → titles + notes + status label for Accepted Risks
  5. Run `git log --oneline -5 $(git merge-base HEAD ${BASE_BRANCH:-main})..HEAD` → Latest Changes (capped at 5 lines). **Error handling**: If `git merge-base` fails (e.g., no common ancestor) or `git log` returns empty output, use fallback value `(no commits yet)`. Wrap in a conditional: run the command, check exit code and output; if either is bad, use fallback.
  6. Derive Phase: if `current_round == 1` → `impl-review`; else → `fix-review`
  7. Derive Next Recommended Action: if Open High Findings count > 0 → `/specflow.fix`; else → `/specflow.approve`
  8. Write all fields to `FEATURE_DIR/current-phase.md` using Markdown key-value format with `# Current Phase: <feature_id>` heading
  9. Overwrite entirely (no append)
  10. **Field-level output contract** (each field MUST be produced as follows):
      - **Phase**: `impl-review` if `current_round == 1`, else `fix-review`
      - **Round**: Integer from `review-ledger.current_round`
      - **Status**: Direct read from `review-ledger.status` (`has_open_high` | `all_resolved` | `in_progress`)
      - **Open High Findings**: Filter `findings[]` where `severity == "high"` AND `status in ["new", "open"]` → `<count> 件 — "<title1>", "<title2>"` or `0 件`
      - **Accepted Risks**: Filter `findings[]` where `status in ["accepted_risk", "ignored"]` → `<title> (<status>, notes: "<notes>")` per finding, or `none`
      - **Latest Changes**: Each git log line as `  - <hash> <subject>`. Fallback: `(no commits yet)`
      - **Next Recommended Action**: Open High > 0 → `/specflow.fix`; == 0 → `/specflow.approve`
      - **Overwrite semantics**: Write complete file from scratch every time (no read-modify-write)
  11. **Malformed/missing ledger recovery** (fallback order — ledger data first):
      1. **First**: Attempt partial recovery of the ledger file — extract any readable top-level fields (`feature_id`, `current_round`, `status`, `findings[]`). Use whatever is available.
      2. **Second**: For fields still missing after partial ledger recovery, supplement with in-memory Codex review data (findings, decision) available in the slash command context.
      3. **Third**: For any remaining unreadable fields, use spec-defined fallback values (Phase: `impl-review`, Round: `1`, Status: `in_progress`, Open High Findings: `0 件`, Accepted Risks: `none`, Next Recommended Action: `/specflow.fix`).
      - **If `findings[]` is missing from both ledger and in-memory**: Set Open High Findings to `0 件 (ledger findings unavailable)`, Accepted Risks to `none (ledger findings unavailable)`.
      - **If the file is completely absent**: Use all spec-defined fallback values and append `(ledger not found)` to the Status field.
      - **Missing-data representation**: Append parenthetical note to fallback values (e.g., `in_progress (ledger parse error)`).

- [x] T005 Define the canonical current-phase.md consumer read instructions as a reusable text block. This block will be inserted into specflow.impl, specflow.fix, and specflow.approve. It must include:
  1. Check if `FEATURE_DIR/current-phase.md` exists
  2. If exists: read the file and display as "Current Phase Context" summary
  3. If absent: proceed without error (first-run scenario), optionally note "No prior phase context found"

**Checkpoint**: Reusable instruction blocks are defined and ready for insertion

---

## Phase 3: User Story 1 - Phase State Generation After Review (Priority: P1) 🎯 MVP

**Goal**: After impl review completes, `current-phase.md` is automatically generated with all 7 mandatory fields.

**Independent Test**: Run `/specflow.impl` on a test feature with a review-ledger.json and verify `current-phase.md` is created correctly.

### Implementation for User Story 1

- [x] T006 [US1] Add producer logic to `global/specflow.impl.md`: Insert "Step 2.6: Generate current-phase.md" section **after the review-ledger.json has been fully updated, backed up, and persisted to disk** (i.e., after the ledger backup+write step completes — Step 2.5 IS the ledger persistence step) and before Step 3 (Present Review Results). At this point, the ledger contains the final round, status, and findings data from the just-completed Codex review. Use the generation instructions defined in T004. The section header should be clearly labeled for maintainability.
- [x] T007 [US1] Add consumer logic to `global/specflow.impl.md`: Insert "Step 0.5: Read Current Phase Context" section near the command start (after setup/prerequisites, before implementation). Use the consumer read instructions defined in T005.

**Checkpoint**: specflow.impl generates current-phase.md after review and reads it at start

---

## Phase 4: User Story 2 - Phase State Update After Fix (Priority: P1)

**Goal**: After fix re-review completes, `current-phase.md` is updated with latest state.

**Independent Test**: Run `/specflow.fix` on a feature with an existing `current-phase.md` and verify it is updated with new round data.

### Implementation for User Story 2

- [x] T008 [US2] Add producer logic to `global/specflow.fix.md`: Insert "Step N+1: Update current-phase.md" section after the existing ledger backup+write and before "Present Review Results". Use the same generation instructions defined in T004 (identical logic).
- [x] T009 [US2] Add consumer logic to `global/specflow.fix.md`: Insert "Step 0.5: Read Current Phase Context" section near the command start (after setup/prerequisites, before applying fixes). Use the consumer read instructions defined in T005.

**Checkpoint**: specflow.fix updates current-phase.md after re-review and reads it at start

---

## Phase 5: User Story 3 - Next-Phase Commands Read current-phase.md (Priority: P2)

**Goal**: specflow.approve reads current-phase.md as context input at command start.

**Independent Test**: Run `/specflow.approve` on a feature with an existing `current-phase.md` and verify it uses the file's contents in the approval summary.

### Implementation for User Story 3

- [x] T010 [US3] Add consumer logic to `global/specflow.approve.md`: Insert "Step 0.5: Read Current Phase Context" section at command start (before the quality gate). Use the consumer read instructions defined in T005. The current-phase.md content should be available as context for the approval summary generation step.
- [x] T010b [US3] **Verify commit scope (FR-009)**: Read the actual `git add` command in `global/specflow.approve.md` and confirm that `specs/<feature>/current-phase.md` is included in the staging scope. The current command is `git add -A -- . ':(exclude).specflow'` which should include it. If the exclude pattern accidentally excludes `specs/` or `current-phase.md`, update the staging command to explicitly include it.

**Checkpoint**: specflow.approve reads current-phase.md for context AND commits it during the approve flow.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and edge case handling

- [x] T011 Verify edge case handling in the generation logic: ensure that when `review-ledger.json` has an empty findings array, current-phase.md is generated with `0 件` for Open High Findings and `none` for Accepted Risks
- [x] T012 Verify that the Status vs Next Recommended Action divergence is correctly handled: Status may show `has_open_high` while Next Recommended Action shows `/specflow.approve` when all high findings are `accepted_risk` or `ignored`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — read existing files
- **Foundational (Phase 2)**: Depends on Phase 1 — define shared logic blocks
- **US1 (Phase 3)**: Depends on Phase 2 — insert logic into specflow.impl
- **US2 (Phase 4)**: Depends on Phase 2 — insert logic into specflow.fix (can run in parallel with Phase 3)
- **US3 (Phase 5)**: Depends on Phase 2 — insert consumer logic into specflow.approve (can run in parallel with Phase 3 and 4)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US2 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US3 (P2)**: Can start after Foundational (Phase 2) — No dependencies on other stories

### Parallel Opportunities

- T001, T002, T003 can all run in parallel (reading different files)
- T004 and T005 can run in parallel (defining different instruction blocks)
- T006+T007 (US1), T008+T009 (US2), T010 (US3) can all run in parallel (modifying different files)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Read existing files
2. Complete Phase 2: Define shared logic blocks
3. Complete Phase 3: Add generation + read to specflow.impl
4. **STOP and VALIDATE**: Run specflow.impl and verify current-phase.md is created

### Incremental Delivery

1. Setup + Foundational → Logic blocks ready
2. Add US1 (specflow.impl) → Test → MVP ready
3. Add US2 (specflow.fix) → Test → Fix loop works
4. Add US3 (specflow.approve) → Test → Full cycle complete
5. Polish → Edge cases verified

---

## Notes

- All modifications are to Markdown slash command files (`global/specflow.*.md`)
- No new scripts, no new dependencies
- Generation logic is identical for both producers (specflow.impl and specflow.fix)
- Consumer read logic is identical for all three consumers
- `.specflow/` directory remains read-only
- `current-phase.md` is not gitignored — committed during approve flow
