<!-- Historical Migration
  Source: specs/002-review-ledger/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: Review Ledger for Impl Review Loop

**Input**: Design documents from `/specs/002-review-ledger/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not requested in spec. テストは手動で実施（specflow はプロンプトベースのツール）。

**Organization**: Tasks are grouped by user story. All tasks target both global/specflow.impl.md AND global/specflow.fix.md unless noted otherwise.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: 両コマンドに ledger 更新セクションの挿入ポイントを確保

- [x] T001 Add "Step 2.5: Update Review Ledger" section header to both global/specflow.impl.md (after Codex review JSON parse, before findings table) and global/specflow.fix.md (after Codex re-review JSON parse, before findings table). Initially empty placeholder with comment "Ledger logic will be added by subsequent tasks"

---

## Phase 2: User Story 1 - Initial Review Ledger Creation (Priority: P1) 🎯 MVP

**Goal**: Codex impl review 実行後に review-ledger.json が自動生成される

**Independent Test**: specflow.impl を 1 回実行し、specs/<issue>-<slug>/review-ledger.json が生成され、feature_id, phase, current_round=1, status, findings[], round_summaries[] が含まれることを確認

### Implementation for User Story 1

- [x] T002 [US1] Implement ledger read/create in both global/specflow.impl.md and global/specflow.fix.md — Read review-ledger.json from FEATURE_DIR via Read tool. If file does not exist: create new ledger JSON with feature_id from branch name, phase="impl", current_round=0, status="all_resolved", findings=[], round_summaries=[]
- [x] T003 [US1] Implement backup and corrupted JSON handling in both global/specflow.impl.md and global/specflow.fix.md — On JSON parse failure: rename corrupt file to review-ledger.json.corrupt via Bash, attempt Read of review-ledger.json.bak. If bak succeeds, use it with warning "⚠ review-ledger.json が破損していました。バックアップから復旧しました（破損ファイルは .corrupt に退避）". If bak also fails: ask user via AskUserQuestion "新規 ledger を作成しますか？ (既存データは失われます)" with options "新規作成" / "中止". Backup creation: only when main ledger was successfully read (not after recovery from bak), copy content to review-ledger.json.bak via Write tool before writing updated ledger
- [x] T004 [US1] Implement initial finding creation in both global/specflow.impl.md and global/specflow.fix.md — When ledger has current_round=0 (fresh): increment to 1, map each Codex finding to Finding format: id=R{round}-F{seq}, origin_round=current_round, latest_round=current_round, severity/category/file/title/detail from Codex, status="new", relation="new", supersedes=null, notes=""
- [x] T005 [US1] Implement round summary generation in both global/specflow.impl.md and global/specflow.fix.md — After findings processed: compute pure end-of-round snapshot per FR-009 — round, total (all findings count), open (status=open), new (status=new), resolved (status=resolved), overridden (status in [accepted_risk, ignored]), by_severity with per-severity {open, resolved, new, overridden}. Append to round_summaries[]
- [x] T006 [US1] Implement top-level status derivation in both global/specflow.impl.md and global/specflow.fix.md — Apply FR-002: has_open_high if any high finding has status in [open, new] OR any high finding has status in [accepted_risk, ignored]; all_resolved if all findings have status=resolved OR findings is empty; in_progress otherwise
- [x] T007 [US1] Implement ledger write and summary display in both global/specflow.impl.md and global/specflow.fix.md — Write updated JSON to review-ledger.json via Write tool. Display: "Review Ledger: Round {n} | Status: {status} | Findings: {new} new, {open} open, {resolved} resolved"

**Checkpoint**: US1 complete — initial ledger creation and persistence works

---

## Phase 3: User Story 2 - Multi-Round Review Tracking (Priority: P1)

**Goal**: 2 回目以降の review で findings が自動マッチングされ、status/relation が正しく設定される

**Independent Test**: 2 回の review を実行し、1 回目の finding が resolved/open に分類され、2 回目の新規 finding が new として記録される

### Implementation for User Story 2

- [x] T008 [US2] Implement round metadata pre-processing and unified matching in both global/specflow.impl.md and global/specflow.fix.md — Pre-processing: increment current_round, init seq counter=0. Unified matching: extract ALL non-resolved findings (open, new, accepted_risk, ignored) into candidate pool. Step 1 Same: file+category+severity exact match, 1:1→same, N:M→title normalization (lowercase + whitespace collapse + trim) then exact match else index-order pairing. Matched active→status=open/relation=same/latest_round=current_round. Matched override→preserve status/relation=same/latest_round=current_round. Step 2 Reframed: file+category match with severity change, 1:1 index-order pairing. Old finding (active or override)→resolved+reframed. New finding created→status=open, relation=reframed, supersedes=old.id, id=R{round}-F{seq++}, origin_round=current_round. Step 3 Remaining: unmatched Codex→new finding (id=R{round}-F{seq++}, origin_round=current_round, latest_round=current_round). Unmatched active→resolved (latest_round unchanged). Unmatched override→preserved
- [x] T009 [US2] Implement status transitions in both global/specflow.impl.md and global/specflow.fix.md — Apply lifecycle table: matched same→if was "new" then "open" else keep "open", update relation="same", update latest_round. New findings→status="new", relation="new". Disappeared→status="resolved", relation=keep previous value. Reframed→old finding status="resolved" relation="reframed", new finding created
- [x] T010 [US2] Update ledger summary display in both files to show round-over-round diff — "Round {n}: +{new} new, {resolved} resolved, {open} remaining ({reframed} reframed)"

**Checkpoint**: US2 complete — multi-round tracking works

---

## Phase 4: User Story 3 - Round Summary Enhancement (Priority: P2)

**Goal**: round_summaries[] の集計が正確に記録され、進捗が一目で把握できる

**Independent Test**: 2 ラウンド実行後に round_summaries を確認し、各ラウンドのスナップショット集計が正確

### Implementation for User Story 3

- [x] T011 [US3] Add round_summaries progress display in both global/specflow.impl.md and global/specflow.fix.md — When round_summaries has more than 1 entry: show compact table of all rounds for quick progress overview (round | total | open | new | resolved | overridden)

**Checkpoint**: US3 complete — round summaries with progress overview

---

## Phase 5: User Story 4 - Manual Status Override (Priority: P3)

**Goal**: ユーザーが JSON を直接編集して accepted_risk/ignored を設定でき、次回 review で正しく処理される

**Independent Test**: finding の status を accepted_risk に手動変更し、次の review で status が維持されることを確認

### Implementation for User Story 4

- [x] T012 [US4] Implement override-specific status transitions in unified matching in both global/specflow.impl.md and global/specflow.fix.md — Ensure that when an override finding (accepted_risk/ignored) is matched in the unified pool: same match→preserve override status, relation=same, update latest_round. Reframed match→resolve old override (status=resolved, relation=reframed), create new finding as status=open (do NOT inherit override). Not detected→preserve override status unchanged (cumulative model). This extends T008's unified matching with override-aware transitions
- [x] T013 [US4] Implement high-severity override validation in both global/specflow.impl.md and global/specflow.fix.md — On ledger load: check all high-severity findings with accepted_risk/ignored status. If notes is empty/whitespace-only: auto-revert to status="open", display "⚠ high severity finding の override には notes が必須です: {id}"
- [x] T014 [US4] Implement override warning display in both global/specflow.impl.md and global/specflow.fix.md — When high-severity findings have accepted_risk/ignored with valid notes: display "⚠ high severity finding が override されています: {id}" in ledger summary

**Checkpoint**: US4 complete — manual overrides work with validation and reframing

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: エッジケース対応と全体整合性

- [x] T015 Implement zero-findings edge case in both global/specflow.impl.md and global/specflow.fix.md — When Codex returns 0 findings: preserve existing findings (cumulative), resolve all open/new findings, generate round summary with updated counts
- [x] T016 Update git diff command in both global/specflow.impl.md and global/specflow.fix.md to exclude review-ledger.json from diff shown to Codex — add ':(exclude)*/review-ledger.json' to git diff command
- [x] T017 [P] Update template/CLAUDE.md to document review-ledger.json purpose and manual override instructions
- [x] T018 [P] Document in README.md that re-running specflow-install is needed after update to pick up new slash command versions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **US1 (Phase 2)**: Depends on Phase 1
- **US2 (Phase 3)**: Depends on US1 (extends matching logic that US1 establishes)
- **US3 (Phase 4)**: Depends on US1 (enhances summary display)
- **US4 (Phase 5)**: Depends on US2 (override matching is Phase B of US2's Phase A)
- **Polish (Phase 6)**: Depends on US1-US4

### User Story Dependencies

- **US1 (P1)**: Can start after Setup — standalone ledger creation
- **US2 (P1)**: Depends on US1 — matching extends basic creation
- **US3 (P2)**: Depends on US1 — enhances summary display
- **US4 (P3)**: Depends on US2 — override matching interacts with Phase A matching

### Parallel Opportunities

- US3 and US4 could start in parallel after US2 (different aspects of the logic)
- T017 and T018 in Polish can run in parallel (different files)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: User Story 1
3. **STOP and VALIDATE**: Run specflow.impl once, verify review-ledger.json created
4. Functional MVP — ledger is created on first review

### Incremental Delivery

1. Setup → placeholder sections added
2. US1 → Ledger creation + backup + summary works (MVP!)
3. US2 → Multi-round matching works
4. US3 → Round summaries show progress
5. US4 → Override support
6. Polish → Edge cases handled

---

## Notes

- All tasks explicitly target BOTH global/specflow.impl.md AND global/specflow.fix.md
- No separate "foundational" phase — US1 is the foundation
- Backup (.bak) created only when main ledger was read successfully, not after recovery (T003)
- Matching is unified: all non-resolved findings (active + override) in single candidate pool (T008)
- 18 tasks total: Setup 1, US1 6, US2 3, US3 1, US4 3, Polish 4
