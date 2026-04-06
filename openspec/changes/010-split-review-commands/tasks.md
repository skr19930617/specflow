<!-- Historical Migration
  Source: specs/010-split-review-commands/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: Split Review Commands

**Input**: Design documents from `/specs/010-split-review-commands/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No setup needed — all infrastructure exists. Skip to Phase 2.

---

## Phase 2: User Story 1 - Spec Review コマンド作成 (Priority: P1)

**Goal**: `/specflow.spec_review` を作成し、`/specflow` フロー内の spec レビューステップを委譲する

**Independent Test**: `/specflow.spec_review` を単独実行し、spec のみがレビューされ、「Plan に進む」「Spec を修正」「中止」の handoff が表示されることを確認

### Implementation for User Story 1

- [x] T001 [US1] Create spec review command file at `global/specflow.spec_review.md` — extract Step 5 (Codex Spec Review) + Handoff from `global/specflow.md`. Include: prerequisites, read review_spec_prompt.txt, read FEATURE_SPEC + issue body, call Codex MCP, parse JSON, present review table, AskUserQuestion handoff (Plan に進む → specflow.plan, Spec を修正 → specflow.spec_fix, 中止 → specflow.reject)
- [x] T002 [US1] Update `global/specflow.md` Step 5 — replace inline spec review logic with delegation: "Read the file `global/specflow.spec_review.md` and follow its complete workflow." Remove the duplicated review logic and handoff section.

**Checkpoint**: `/specflow.spec_review` works standalone and `/specflow` delegates to it

---

## Phase 3: User Story 2 - Plan Review コマンド作成 (Priority: P1)

**Goal**: `/specflow.plan_review` を作成し、`/specflow.plan` フロー内の plan レビューステップを委譲する

**Independent Test**: `/specflow.plan_review` を単独実行し、plan/tasks のみがレビューされ、「実装に進む」「Plan を修正」「中止」の handoff が表示されることを確認

### Implementation for User Story 2

- [x] T003 [US2] Create plan review command file at `global/specflow.plan_review.md` — extract Step 3 (Codex Plan/Tasks Review) + Handoff from `global/specflow.plan.md`. Include: prerequisites, read review_plan_prompt.txt, read FEATURE_SPEC + plan.md + tasks.md, call Codex MCP, parse JSON, present review table, AskUserQuestion handoff (実装に進む → specflow.impl, Plan を修正 → specflow.plan_fix, 中止 → specflow.reject)
- [x] T004 [US2] Update `global/specflow.plan.md` Step 3 — replace inline plan review logic with delegation: "Read the file `global/specflow.plan_review.md` and follow its complete workflow." Remove the duplicated review logic and handoff section.

**Checkpoint**: `/specflow.plan_review` works standalone and `/specflow.plan` delegates to it

---

## Phase 4: User Story 3 - Impl Review コマンド作成 (Priority: P1)

**Goal**: `/specflow.impl_review` を作成し、`/specflow.impl` フロー内の impl レビューステップを委譲する

**Independent Test**: `/specflow.impl_review` を単独実行し、実装 diff のみがレビューされ、auto-fix loop または手動 handoff が表示されることを確認

### Implementation for User Story 3

- [x] T005 [US3] Create impl review command file at `global/specflow.impl_review.md` — extract Step 2 (Codex Implementation Review) + Step 2.5 (Update Review Ledger) + Step 2.6 (Generate current-phase.md) + Step 3 (Present Review Results) + Handoff (Auto-fix Loop / 手動ハンドオフ / Case A/B/C) from `global/specflow.impl.md`. This is the largest extraction — include the full review-ledger integration, finding matching, round tracking, current-phase.md generation, and all handoff cases.
- [x] T006 [US3] Update `global/specflow.impl.md` Step 2 onward — replace inline impl review logic (Step 2, 2.5, 2.6, 3, Handoff) with delegation: "Read the file `global/specflow.impl_review.md` and follow its complete workflow." Keep Step 0.5 (Read Current Phase Context) and Step 1 (Implement) in specflow.impl.md.

**Checkpoint**: `/specflow.impl_review` works standalone and `/specflow.impl` delegates to it

---

## Phase 5: User Story 4 - 旧コマンド削除 & ドキュメント更新 (Priority: P2)

**Goal**: CLAUDE.md から `/specflow.review` を削除し、3 つの新コマンドを追加する

**Independent Test**: CLAUDE.md に `/specflow.review` がなく、新コマンド 3 つが記載されていることを確認

### Implementation for User Story 4

- [x] T007 [P] [US4] Update `CLAUDE.md` specflow slash commands table — remove `/specflow.review` row, add `/specflow.spec_review`, `/specflow.plan_review`, `/specflow.impl_review` rows with descriptions. Update the flow description accordingly.

**Checkpoint**: CLAUDE.md reflects the new command structure

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (US1: spec_review)**: No dependencies — can start immediately
- **Phase 3 (US2: plan_review)**: No dependencies on Phase 2 — can run in parallel
- **Phase 4 (US3: impl_review)**: No dependencies on Phase 2/3 — can run in parallel
- **Phase 5 (US4: docs)**: Depends on Phases 2-4 completion (all new commands must exist)

### Within Each User Story

- T001 before T002 (create new file before modifying existing flow)
- T003 before T004 (same pattern)
- T005 before T006 (same pattern)
- T007 after all other tasks

### Parallel Opportunities

- US1, US2, US3 (Phases 2-4) can all be implemented in parallel — they touch different files
- Within each US: create → modify is sequential (2 tasks each)

---

## Parallel Example: All Review Commands

```bash
# These three can run in parallel (different files):
Task: "T001 Create spec review command at global/specflow.spec_review.md"
Task: "T003 Create plan review command at global/specflow.plan_review.md"
Task: "T005 Create impl review command at global/specflow.impl_review.md"

# Then update flow commands in parallel:
Task: "T002 Update global/specflow.md to delegate"
Task: "T004 Update global/specflow.plan.md to delegate"
Task: "T006 Update global/specflow.impl.md to delegate"

# Finally:
Task: "T007 Update CLAUDE.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T002: spec_review command + delegation
2. **STOP and VALIDATE**: Run `/specflow.spec_review` standalone
3. Verify handoff options are correct

### Incremental Delivery

1. US1: spec_review → validate
2. US2: plan_review → validate
3. US3: impl_review → validate (largest, most complex)
4. US4: docs update → validate

---

## Notes

- The impl_review extraction (T005) is the most complex task — it includes ~250 lines of review-ledger logic, auto-fix loop, and multiple handoff cases
- The spec_review and plan_review are simpler — no review-ledger integration beyond recording the decision
- When modifying flow commands (T002, T004, T006), preserve all non-review steps unchanged
- Each new command file needs the standard `---` frontmatter with `description`
