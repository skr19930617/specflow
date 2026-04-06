<!-- Historical Migration
  Source: specs/011-specflow-input-ux/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: specflow 起動時の入力形式改善

**Input**: Design documents from `/specs/011-specflow-input-ux/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Phase 1: Setup

**Purpose**: Understand current codebase state

- [x] T001 Read current `global/specflow.md` and document the existing Step 1 logic (AskUserQuestion usage, URL validation, branching)

---

## Phase 2: User Story 1 - issue URL をテキストで直接入力する (Priority: P1) + User Story 2 - 引数付き実行 (Priority: P1)

**Goal**: `/specflow` 引数なし実行時にテキスト案内方式で入力を受け取り、issue URL と判定したら issue 取得に進む。引数付き実行は既存動作を維持。

**Independent Test**: `/specflow` を引数なしで実行 → テキスト案内が表示される → issue URL を入力 → issue 取得に進む

### Implementation

- [x] T002 [US1] Rewrite Step 1 in `global/specflow.md`: create shared entry-point that (a) checks `$ARGUMENTS` — if non-empty, use as `INPUT_TEXT` without prompting; if empty, display text prompt and wait for user's next message as `INPUT_TEXT`
- [x] T003 [US1] Add unified input classification logic to Step 1 in `global/specflow.md`: classify `INPUT_TEXT` — empty/whitespace → re-display prompt and wait again (loop); matches `https?://[^/]+/[^/]+/[^/]+/issues/\d+` → MODE=issue_url; otherwise → MODE=inline_spec. Both argument and prompt paths use this same classifier.
- [x] T004 [US1] Update Step 2 (Fetch Issue) in `global/specflow.md`: wrap in conditional — execute only when MODE=issue_url. Add error recovery: if issue fetch fails (not found, access denied, network error), display error message with cause, then re-display text prompt and loop back to input classification (Step 1 input wait)
- [x] T005 [US1] Update Step 3 (Create Spec) in `global/specflow.md`: add branch for inline spec case — if MODE=inline_spec, pass INPUT_TEXT directly as feature description to specflow.specify instead of issue title + body

**Checkpoint**: `/specflow` (no args) shows text prompt, accepts issue URL, and proceeds through full flow

---

## Phase 3: User Story 3 - インライン仕様記述から spec を作成する (Priority: P2)

**Goal**: issue URL 以外の入力をインライン仕様記述として受け付け、issue 取得をスキップして spec 作成に進む

**Independent Test**: `/specflow` 実行後にインライン仕様テキストを入力 → issue 取得スキップ → spec 作成フローが動作する

### Implementation

- [x] T006 [US3] Update Step 5 (Codex Spec Review) in `global/specflow.md`: handle case where issue body is unavailable (inline spec) — already handled by specflow.spec_review.md which reads /tmp/specflow-issue.json silently (skips if not found, marks "(not available)")
- [x] T007 [US3] Add documentation comment at top of Step 1 in `global/specflow.md` explaining the three input modes: (1) argument with URL, (2) argument with text, (3) no argument → text prompt

**Checkpoint**: Full flow works for both issue URL input and inline spec input

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T008 Review all changes in `global/specflow.md` for consistency and completeness — updated description, verified all steps are consistent
- [x] T009 Update Step 4 (Clarify) notes in `global/specflow.md` if any adjustments needed for inline spec case — no changes needed (Clarify reads spec file directly, no issue body dependency)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (US1+US2)**: Depends on Phase 1
- **Phase 3 (US3)**: Depends on Phase 2 (needs the branching logic from US1)
- **Phase 4 (Polish)**: Depends on Phase 3

### Within Each Phase

- T002 → T003 → T004 → T005 (sequential — all modify the same file `global/specflow.md`)
- T006 → T007 (sequential — same file)

### Parallel Opportunities

- Limited parallelism due to single-file changes. All tasks modify `global/specflow.md`.
- T008 and T009 can run in parallel (review vs documentation update in different sections)

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Read current code
2. Complete Phase 2: Rewrite Step 1, add classification, update Step 2/3
3. **STOP and VALIDATE**: Test with issue URL input
4. Deploy if ready

### Incremental Delivery

1. Phase 2 → issue URL input works via text prompt (MVP)
2. Phase 3 → inline spec input also works
3. Phase 4 → Polish and review

---

## Notes

- All changes are in a single file: `global/specflow.md`
- Total tasks: 9
- Tasks per story: US1+US2: 4, US3: 2, Polish: 2, Setup: 1
- No test tasks (this is a Markdown command file — manual testing only)
- T002 now explicitly covers argument bypass (FR-005/FR-006) via shared entry-point
- T003 applies unified classification to both argument and prompt inputs
- T004 now includes error recovery loop for issue fetch failures (FR-007 + edge case)
