# Tasks: レビュー対象 Diff フィルタリング

**Input**: Design documents from `/specs/016-diff-filter-review/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: config.env テンプレートへの新設定追加

- [x] T001 Add `DIFF_EXCLUDE_PATTERNS` and `DIFF_WARN_THRESHOLD` variables to `template/.specflow/config.env` with commented-out defaults

---

## Phase 2: Foundational — `specflow-filter-diff` スクリプト

**Purpose**: diff フィルタリングの中核ロジック。全ユーザーストーリーがこのスクリプトに依存する

**CRITICAL**: User Story の実装はこの Phase 完了後に開始する

- [x] T002 Create `bin/specflow-filter-diff` script skeleton with argument parsing (accept pathspec args to forward to git diff), help text, and executable permissions
- [x] T003 Implement file classification logic in `bin/specflow-filter-diff`: use `git diff --name-status -M100 <forwarded pathspecs>` to detect `D` (deleted file) and `R100` (rename-only, similarity index 100%) files
- [x] T004 Implement `DIFF_EXCLUDE_PATTERNS` parsing in `bin/specflow-filter-diff` (FR-002 + FR-006): split colon-separated patterns via `IFS=':'`, validate each glob pattern by testing with bash `[[ "x" == $pattern ]]` in a subshell to catch syntax errors, collect invalid patterns into JSON `warnings` array (not as separate stderr text), ignore empty string patterns
- [x] T005 Implement pattern matching in `bin/specflow-filter-diff`: match each changed file path against validated patterns using bash glob matching, for rename files match against new path (repo-root-relative)
- [x] T006 Implement filtered diff output in `bin/specflow-filter-diff`: re-run `git diff <forwarded pathspecs> -- <included files>` with only included files, output filtered diff to stdout
- [x] T007 Implement JSON filter summary in `bin/specflow-filter-diff`: output single-line JSON to stderr final line containing `excluded` array (files with reasons), `warnings` array (FR-006 invalid pattern messages), `included_count`, `excluded_count`, and `total_lines`. Caller uses `tail -1` to extract JSON
- [x] T008 Implement `DIFF_WARN_THRESHOLD` validation in `bin/specflow-filter-diff`: validate threshold is a positive integer, fall back to default 1000 if invalid

**Checkpoint**: `specflow-filter-diff` script is complete and can be tested standalone

---

## Phase 3: User Story 1 — 大規模リファクタ後のレビュー実行 (Priority: P1) MVP

**Goal**: impl review と fix re-review で diff フィルタリングが自動適用され、フィルタ後の diff のみが Codex に送信される

**Independent Test**: 削除ファイル・リネームファイルを含む diff がある状態でレビューを実行し、フィルタ後の diff のみが Codex に送信されることを確認する

### Implementation for User Story 1

- [x] T009 [US1] Update `global/specflow.impl_review.md`: replace direct `git diff` command with `specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify' ...` invocation (passing existing pathspecs as arguments), source `config.env` for `DIFF_EXCLUDE_PATTERNS` and `DIFF_WARN_THRESHOLD` before diff generation
- [x] T010 [US1] Update `global/specflow.fix.md`: replace direct `git diff` command with `specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify' ...` invocation (same pathspec passthrough as T009), source `config.env` for filter settings
- [x] T011 [US1] Add empty-diff handling in `global/specflow.impl_review.md`: check if filtered diff is empty (stdout is empty), display "レビュー対象の変更がありません" message, and skip Codex review proceeding to handoff
- [x] T012 [US1] Add empty-diff handling in `global/specflow.fix.md`: same logic as T011
- [x] T013 [US1] Add line-count warning in `global/specflow.impl_review.md`: read `total_lines` from stderr JSON, compare against `DIFF_WARN_THRESHOLD`, if exceeded display warning message with actual/threshold counts and use `AskUserQuestion` with "続行"/"中止" options. If user chooses "中止", skip Codex review and proceed to handoff
- [x] T014 [US1] Add line-count warning in `global/specflow.fix.md`: same AskUserQuestion continue/abort logic as T013

**Checkpoint**: Filtered diff is sent to Codex. Deleted files and rename-only files are excluded. Empty diff and large diff warnings work.

---

## Phase 4: User Story 2 — フィルタリング結果の可視化 (Priority: P2)

**Goal**: レビュー実行前に除外ファイル一覧と除外理由がサマリーとして表示される

**Independent Test**: フィルタリングが適用される diff でレビューを実行し、除外ファイル一覧と理由が表示されることを確認する

### Implementation for User Story 2

- [x] T015 [US2] Add filter summary display in `global/specflow.impl_review.md`: parse JSON summary from `specflow-filter-diff` stderr, display excluded files with reasons in a formatted table, skip display if no files were excluded
- [x] T016 [US2] Add filter summary display in `global/specflow.fix.md`: same logic as T015

**Checkpoint**: Users can see which files were excluded and why before Codex review starts.

---

## Phase 5: User Story 3 — 除外パターンのカスタマイズ (Priority: P3)

**Goal**: ユーザーが `config.env` でカスタム除外パターンを設定できる

**Independent Test**: `config.env` に除外パターンを追加し、該当ファイルの diff がレビューから除外されることを確認する

### Implementation for User Story 3

- [x] T017 [US3] Update `specflow-init` script in `bin/specflow-init`: add `DIFF_EXCLUDE_PATTERNS` and `DIFF_WARN_THRESHOLD` to the generated `config.env` with commented defaults and usage examples

**Checkpoint**: New projects get filter config variables in config.env. Custom patterns work with the filter script.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: ドキュメント更新と最終検証

- [x] T018 [P] Update CLAUDE.md Active Technologies section with new components (bin/specflow-filter-diff, DIFF_EXCLUDE_PATTERNS, DIFF_WARN_THRESHOLD)
- [x] T019 Run quickstart.md validation: verify all described commands and workflows work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2
- **User Story 2 (Phase 4)**: Depends on Phase 2 (can run in parallel with US1)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (can run in parallel with US1/US2)
- **Polish (Phase 6)**: Depends on all user stories

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories. Core filtering and Codex integration.
- **User Story 2 (P2)**: No dependencies on US1. Filter summary display is independent.
- **User Story 3 (P3)**: No dependencies on US1/US2. Config template update is independent.

### Within Each User Story

- `specflow.impl_review.md` and `specflow.fix.md` changes are parallel within each story
- T009/T010 (filter integration) must complete before T011/T012 (empty-diff handling)
- T011/T012 must complete before T013/T014 (line-count warning)

### Parallel Opportunities

- T009 + T010 can run in parallel (different files)
- T011 + T012 can run in parallel (different files)
- T013 + T014 can run in parallel (different files)
- T015 + T016 can run in parallel (different files)
- T018 + T019 can run in parallel (different concerns)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: config.env template update
2. Complete Phase 2: `specflow-filter-diff` script
3. Complete Phase 3: impl_review + fix integration
4. **STOP and VALIDATE**: Test with a repo that has deleted/renamed files
5. Confirm Codex receives filtered diff only

### Incremental Delivery

1. Setup + Foundational → Filter script ready
2. Add US1 → Filtered diff sent to Codex (MVP!)
3. Add US2 → Users see filter summary
4. Add US3 → Config customization for new projects
5. Polish → Docs and validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable
- Commit after each phase completion
- The `specflow-filter-diff` script is the single source of truth for all filtering logic
