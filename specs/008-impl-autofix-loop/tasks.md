# Tasks: impl フェーズ auto-fix loop

**Input**: Design documents from `/specs/008-impl-autofix-loop/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. No test tasks included.

**Organization**: Tasks are grouped by user story. All stop conditions are implemented together in the core loop (US1+US2+US3) to avoid re-work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Configuration preparation

- [x] T001 Add `SPECFLOW_MAX_AUTOFIX_ROUNDS` setting example as comment in `.specflow/config.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Read and understand the existing specflow.impl.md and specflow.fix.md structure before modifying

**⚠️ CRITICAL**: Must understand the existing handoff flow before adding loop logic

- [x] T002 Read `global/specflow.impl.md` to understand the current Handoff section structure (AskUserQuestion with "Approve & Commit" / "Fix All" / "Reject")
- [x] T003 Read `global/specflow.fix.md` to understand the re-review → ledger update → current-phase.md → handoff flow

**Checkpoint**: Existing flow understood — auto-fix loop implementation can begin

---

## Phase 3: User Story 1+2+3 — Core Loop with All Stop Conditions (Priority: P1+P2) 🎯 MVP

**Goal**: impl レビュー後に unresolved high がある場合、自動的に fix → re-review を繰り返す。全停止条件（成功、発散、max rounds）を一括で実装する。

**Independent Test**: `/specflow.impl` 実行後、auto-fix loop が (1) high=0 で成功停止、(2) max rounds で安全停止、(3) 発散検知で早期停止、のいずれかの動作をすることを確認

### Implementation

- [x] T004 [US1] Add MAX_ROUNDS configuration reading logic to `global/specflow.impl.md` Prerequisites section — after `source .specflow/config.env`, read `SPECFLOW_MAX_AUTOFIX_ROUNDS` with default 4, validate range 1-10, fallback to 4 if out of range

- [x] T005 [US1] Add round 0 baseline snapshot to `global/specflow.impl.md` Handoff section — when ledger status is `has_open_high`, before starting the loop: read review-ledger.json and store (1) `baseline_score` = severity weight sum of all unresolved findings (high=3, medium=2, low=1), (2) `baseline_new_high_count` = `round_summaries[-1].by_severity.high.new`, (3) `baseline_resolved_high_titles` = list of `title` from findings where status=="resolved" AND severity=="high". These values serve as the round 0 comparison baseline per FR-005.

- [x] T006 [US1] Implement the auto-fix loop body in `global/specflow.impl.md` — WHILE unresolved high > 0 AND round < max_rounds AND NOT divergence_detected: (1) display round progress header, (2) call `Skill(skill: "specflow.fix")`, (3) read updated `review-ledger.json`

- [x] T007 [US1] Add success stop (unresolved high = 0) in `global/specflow.impl.md` — after reading updated ledger, count findings where severity=="high" AND status in ["new","open"]. If count == 0 → display success message, break loop

- [x] T008 [US2] Add max rounds stop in `global/specflow.impl.md` — when round >= max_rounds AND unresolved high > 0, display "最大ラウンド到達" with round count and remaining high count, break loop

- [x] T009 [US3] Implement same-type recurrence detection in `global/specflow.impl.md` — per FR-009: (1) get previous round's resolved high titles (or baseline_resolved_high_titles for round 1), (2) get current round's unresolved high titles (status in ["new","open"], severity=="high"), (3) for each pair check case-insensitive substring containment: `lowercase(a).includes(lowercase(b))` OR `lowercase(b).includes(lowercase(a))`, (4) if any match → set divergence with reason "同種 finding の再発"

- [x] T010 [US3] Implement quality gate score check in `global/specflow.impl.md` — compute `current_score = Σ weight(f.severity) for f in findings where f.status ∉ {"resolved"}` (high=3, medium=2, low=1). Compare with `previous_score` (initially baseline_score). If current_score > previous_score → set divergence with reason "quality gate 悪化". Update previous_score = current_score for next round.

- [x] T011 [US3] Implement new high count tracking in `global/specflow.impl.md` — read `round_summaries[-1].by_severity.high.new` as current new high count. For round 2+, compare with previous round's count. If increased → set divergence with reason "new high が増加傾向". For round 1, store count as baseline for next comparison only (no stop). Update previous_new_high_count for next round.

- [x] T012 [US3] Add divergence stop execution in `global/specflow.impl.md` — after all divergence checks (T009-T011), if divergence_detected is true: display the specific stop reason, break loop

- [x] T013 [US1] Wire stop condition priority order in `global/specflow.impl.md` — ensure checks run in order: success (high=0) → same-type recurrence → quality gate → new high (round 2+) → max rounds. First triggered condition wins.

- [x] T014 [US1] Add post-loop handoff in `global/specflow.impl.md` — after loop ends: if success → "Approve & Commit" / "Reject"; if stopped (high > 0) → "Fix All (manual)" / "Approve & Commit" / "Reject" via AskUserQuestion

- [x] T015 [US1] Add fallback for non-auto-fix cases in `global/specflow.impl.md` — when ledger status is NOT `has_open_high` (i.e., `all_resolved` or `in_progress` without high), preserve the existing manual handoff flow unchanged

**Checkpoint**: Complete auto-fix loop works — all stop conditions (success, divergence x3, max rounds) properly ordered and handled

---

## Phase 4: User Story 4 — ループ進行状況の可視化 (Priority: P3)

**Goal**: 各ラウンドの進行状況をユーザーに表示

**Independent Test**: auto-fix loop 中に各ラウンドのサマリーが正しく表示されることを確認

- [x] T016 [US4] Implement round progress display in `global/specflow.impl.md` — at the start of each round and after completion, display: `Auto-fix Round {n}/{max_rounds}: Unresolved high: {count} ({delta}), Severity score: {score} ({delta}), New high: {count}, Status: {continuing|stopped: reason}`
- [x] T017 [US4] Implement loop completion summary in `global/specflow.impl.md` — after loop ends (any reason), display: `Auto-fix Loop Complete: Total rounds: {n}, Result: {success|stopped}, Reason: {reason}, Remaining unresolved high: {count}`

**Checkpoint**: Users can see loop progress and final result clearly

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases and final verification

- [x] T018 Add error handling for ledger read failures during auto-fix loop in `global/specflow.impl.md` — if `review-ledger.json` cannot be read during loop, stop loop and handoff to user with error message
- [x] T019 Add error handling for specflow.fix Skill call failure in `global/specflow.impl.md` — if fix call fails, stop loop and handoff to user with error message
- [x] T020 Verify existing manual handoff still works when auto-fix loop is not triggered in `global/specflow.impl.md` — ensure specflow.impl behavior is unchanged when no unresolved high exists

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: No dependencies — can start in parallel with Phase 1
- **Phase 3 (US1+US2+US3)**: Depends on Phase 1 + Phase 2. All stop conditions implemented together to avoid re-work.
- **Phase 4 (US4)**: Depends on Phase 3 (adds display to loop body)
- **Phase 5 (Polish)**: Depends on Phase 3-4

### User Story Dependencies

- **US1+US2+US3 (P1+P2)**: Merged into single phase — core loop with all stop conditions
- **US4 (P3)**: Depends on US1 — adds display to loop

### Within Each Phase

- All modifications target `global/specflow.impl.md`
- Tasks within a phase are sequential (same file)

---

## Implementation Strategy

### MVP First (Phase 3 Only)

1. Complete Phase 1: Config setup
2. Complete Phase 2: Read existing files
3. Complete Phase 3: Core auto-fix loop with ALL stop conditions
4. **STOP and VALIDATE**: Test loop for all stop paths (success, divergence x3, max rounds)
5. Ready for basic use

### Incremental Delivery

1. Setup + Foundational → Ready
2. Phase 3: Core loop + all stops → Test → Fully functional auto-fix (MVP!)
3. Phase 4: Progress display → Test → Full visibility
4. Phase 5: Polish → Error handling, edge cases

---

## Notes

- All implementation tasks modify a single file: `global/specflow.impl.md`
- `global/specflow.fix.md` is NOT modified — called via Skill tool as-is
- `.specflow/config.env` gets a commented example only (T001)
- No new files are created in `global/`
- `review-ledger.json` schema is NOT changed
- Finding照合は `findings[].title` のみ使用（`id` は使用しない — FR-009 準拠）
- 初回ラウンドの比較基準は impl レビュー直後の ledger 状態（round 0 baseline — T005 で取得）
