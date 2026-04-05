# Tasks: Auto-fix Handoff Bug Fix

**Input**: Design documents from `/specs/014-autofix-handoff-bug/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: 修正対象ファイルの確認と現状把握

- [x] T001 Read current Handoff section (Lines 216-426) in global/specflow.impl_review.md to understand existing structure

---

## Phase 2: User Story 1 & 2 - Handoff 廃止と常時 Auto-fix 確認 (Priority: P1) MVP

**Goal**: handoff を廃止し、AskUserQuestion で auto-fix 確認を直接表示する。スキップ時は手動修正誘導をデフォルト動作とする。

**Independent Test**: impl review 完了後に AskUserQuestion が直接表示され、スキップしてもワークフローが手動修正誘導で継続する。

### Implementation

- [x] T002 [US1] Replace Handoff section header and introductory logic (Lines 216-220) in global/specflow.impl_review.md — remove handoff references, add severity aggregation instructions
- [x] T003 [US1] Replace Case A auto-fix confirmation (Lines 222-254) in global/specflow.impl_review.md — remove title listing from AskUserQuestion, use severity count only, change to 2-choice format ("Auto-fix 実行" / "手動修正")
- [x] T004 [US1] Update auto-fix loop logic (Lines 255-335) in global/specflow.impl_review.md — maintain existing loop mechanism but connect to new AskUserQuestion flow
- [x] T005 [US1] Replace post-loop handoff (Lines 348-379) in global/specflow.impl_review.md — replace handoff buttons with AskUserQuestion (Approve & Commit / 手動修正)
- [x] T006 [US1] Replace Case B normal handoff (Lines 381-399) in global/specflow.impl_review.md — for 0 actionable findings, proceed directly to approval flow without confirmation
- [x] T007 [US1] Replace Case C error handoff (Lines 401-417) in global/specflow.impl_review.md — use AskUserQuestion with error context and 手動修正 option
- [x] T008 [US1] Add skip/dismiss default behavior in global/specflow.impl_review.md — after each AskUserQuestion, add instruction that skip/dismiss/timeout = "手動修正" selected

**Checkpoint**: Handoff 廃止 + 常時確認が動作する。スキップしても停止しない。

---

## Phase 3: User Story 3 - AskQuestion 表示の簡略化 (Priority: P2)

**Goal**: auto-fix 確認の AskUserQuestion 表示を severity 別件数のみに簡略化する。

**Independent Test**: auto-fix 確認プロンプトが severity:件数のみで、タイトルが含まれないことを確認する。

### Implementation

- [x] T009 [US3] Add severity aggregation logic in global/specflow.impl_review.md — collect actionable findings, group by severity, count each, filter 0-count, order CRITICAL→HIGH→MEDIUM→LOW
- [x] T010 [US3] Update AskUserQuestion question text format in global/specflow.impl_review.md — change from "{count} 件の high findings があります:\n- {title1}\n- {title2}" to "レビュー指摘: CRITICAL: N, HIGH: M (severity:件数のみ、0件除外)"

**Checkpoint**: AskQuestion 表示が簡潔な severity:件数形式になっている。

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T011 Verify all AskUserQuestion instances in global/specflow.impl_review.md follow the new format consistently
- [x] T012 Verify edge case handling: 0 findings → approval flow, missing review-ledger.json → error message

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — read-only
- **US1/US2 (Phase 2)**: Depends on Phase 1 completion
- **US3 (Phase 3)**: Can start after Phase 2 (builds on new AskUserQuestion structure)
- **Polish (Phase 4)**: Depends on Phase 2 and 3 completion

### Within Phase 2

- T002 → T003 → T004 → T005 (sequential, same section rewrite)
- T006, T007 depend on T002 (new section structure)
- T008 depends on T003-T007 (adds behavior to all AskUserQuestion instances)

### Parallel Opportunities

- T006 and T007 can run in parallel (different cases in same file, but adjacent sections)
- T009 and T010 (Phase 3) are sequential (T010 depends on T009's aggregation logic)

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete Phase 1: Read and understand current code
2. Complete Phase 2: Rewrite Handoff section with new AskUserQuestion flow
3. **STOP and VALIDATE**: Test handoff 廃止 + スキップ時デフォルト動作
4. Proceed to Phase 3 for display simplification

### Notes

- 修正対象は単一ファイル `global/specflow.impl_review.md` のみ
- テストは手動（specflow ワークフロー実行で確認）
- 既存の auto-fix loop ロジック（specflow.fix autofix 呼び出し）は維持
