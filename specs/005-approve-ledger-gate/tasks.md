# Tasks: approve-ledger-gate

**Input**: Design documents from `/specs/005-approve-ledger-gate/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: 既存ファイルの確認と変更準備

- [x] T001 現在の `global/specflow.approve.md` の内容を確認し、quality gate 挿入位置（既存の `## Commit` セクションの前、approve フローの最初のステップ）を特定する

**Checkpoint**: 挿入位置が確定

---

## Phase 2: User Story 1 - 未解決 high がある状態で approve がブロックされる (Priority: P1) 🎯 MVP

**Goal**: `has_open_high` 時に approve を停止し、未解決 high finding の概要を表示する

**Independent Test**: review-ledger.json に `status: has_open_high` を設定し `/specflow.approve` を実行。停止メッセージと finding 一覧が表示されることを確認

### Implementation for User Story 1

- [x] T002 [US1] `global/specflow.approve.md` の既存 `## Commit` セクションの前に新しい `## Quality Gate` セクションを追加: `check-prerequisites.sh --json --paths-only` で FEATURE_DIR を取得し、`FEATURE_DIR/review-ledger.json` を読み込む指示を記述 in `global/specflow.approve.md`
- [x] T003 [US1] Quality Gate セクションに `status` フィールドの判定ロジックを追加: `has_open_high` → 停止、`all_resolved` → 通過、`in_progress` → 通過、その他 → 停止（「不明な ledger status です。ファイルを確認してください」と表示して **STOP**） in `global/specflow.approve.md`
- [x] T004 [US1] 停止時の表示フォーマットを追加: findings 配列から severity=high かつ status≠resolved の finding を抽出し、id/title/detail/status をテーブル形式で表示する指示を記述 in `global/specflow.approve.md`
- [x] T005 [US1] 停止メッセージに `/specflow.fix` で修正するよう案内する文言を追加 in `global/specflow.approve.md`

**Checkpoint**: `has_open_high` の ledger で approve が停止し、finding 一覧が表示される

---

## Phase 3: User Story 2 - 未解決 high がない状態で approve が正常に進む (Priority: P1)

**Goal**: `all_resolved` または `in_progress` 時に通常の commit/push/PR フローへ進む

**Independent Test**: review-ledger.json の status を `all_resolved` に設定し `/specflow.approve` を実行。通常通り commit/push/PR が行われることを確認

### Implementation for User Story 2

- [x] T006 [US2] Quality Gate 通過時に「Quality Gate: PASSED」メッセージを表示し、既存の commit/push/PR フローへ続行する指示を記述 in `global/specflow.approve.md`

**Checkpoint**: `all_resolved` / `in_progress` の ledger で approve が通常通り進む

---

## Phase 4: User Story 3 - review-ledger.json が存在しない場合は停止する (Priority: P2)

**Goal**: ledger 不在時に approve を停止し、review 実行を促す

**Independent Test**: review-ledger.json を削除して `/specflow.approve` を実行。停止メッセージが表示されることを確認

### Implementation for User Story 3

- [x] T007 [US3] Quality Gate セクションの先頭に review-ledger.json の存在チェックを追加: 不在時は「review-ledger.json が見つかりません。先に impl/fix フェーズで review を実行してください」と表示して停止する指示を記述 in `global/specflow.approve.md`
- [x] T008a [US3] JSON パース失敗時のエラーハンドリングを追加: 「review-ledger.json のパースに失敗しました。ファイルを確認してください」と表示して停止する指示を記述 in `global/specflow.approve.md`
- [x] T008b [US3] `status` フィールド欠落時のエラーハンドリングを追加: 「review-ledger.json に status フィールドがありません。ledger の形式を確認してください」と表示して停止する指示を記述 in `global/specflow.approve.md`
- [x] T009 [US3] `findings` 配列が存在しないまたは配列でない場合の停止時表示をスキップする指示（停止メッセージのみ表示）を追加 in `global/specflow.approve.md`

**Checkpoint**: ledger 不在・パース不可・フィールド欠落のすべてのケースで適切に停止する

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 最終確認と整合性チェック

- [x] T010 `global/specflow.approve.md` 全体を通して読み、quality gate の挿入が既存フローを壊していないことを確認
- [x] T011 quality gate セクション内のステップ番号が既存のステップと整合していることを確認し、必要に応じてリナンバリング

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 依存なし
- **Phase 2 (US1 - Block)**: Phase 1 完了後
- **Phase 3 (US2 - Pass)**: Phase 2 完了後（gate ロジックが存在する前提）
- **Phase 4 (US3 - Missing ledger)**: Phase 2 完了後
- **Phase 5 (Polish)**: Phase 2-4 完了後

### User Story Dependencies

- **US1 (P1)**: Phase 1 後に即開始可能。gate ロジックの本体
- **US2 (P1)**: US1 の gate ロジックが存在する前提。通過パスの確認
- **US3 (P2)**: US1 の gate ロジックが存在する前提。エラーハンドリングの追加

### Parallel Opportunities

- T007, T008, T009 (Phase 4) は同一ファイルだが、異なるセクション内の変更であり、US1 の gate ロジック完了後に順次実行

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001: 挿入位置確認
2. T002-T005: quality gate の基本ロジック実装
3. **STOP and VALIDATE**: `has_open_high` の ledger で停止することを確認

### Incremental Delivery

1. Phase 1-2: gate の基本実装 → 停止テスト (MVP)
2. Phase 3: 通過パスの確認
3. Phase 4: エラーハンドリング追加
4. Phase 5: 最終整合性チェック

---

## Notes

- 全タスクは `global/specflow.approve.md` の 1 ファイルに対する変更
- slash command (Markdown) の編集であり、コードのコンパイルやテスト実行は不要
- `.specflow/` 配下のファイルは変更不可（read-only）
