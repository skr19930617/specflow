<!-- Historical Migration
  Source: specs/012-autofix-loop-prompt/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: Auto-fix Loop Confirmation Prompt

**Input**: Design documents from `/specs/012-autofix-loop-prompt/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup needed — this feature modifies a single existing file.

(Phase skipped — no new project structure required)

---

## Phase 2: Foundational

**Purpose**: No foundational work needed — the change is self-contained within `global/specflow.impl_review.md`.

(Phase skipped — no blocking prerequisites)

---

## Phase 3: User Story 1 - Auto-fix Loop 開始前の確認プロンプト (Priority: P1) 🎯 MVP

**Goal**: Case A で auto-fix loop を自動開始する代わりに、ユーザーに確認プロンプトを表示し、「開始する」/「スキップする」の選択に応じて分岐する

**Independent Test**: impl review で high findings がある状態で確認プロンプトが表示され、選択に応じて正しく分岐する

### Implementation for User Story 1

- [x] T001 [US1] Case A セクションの `#### Round 0 Baseline Snapshot` の直前に `#### ユーザー確認プロンプト` サブセクションを挿入する in global/specflow.impl_review.md
  - actionable high findings の件数とタイトル一覧を収集する手順を記述
  - AskUserQuestion で「開始する」「スキップする」のボタンを表示する指示を記述
  - 「開始する」→ Round 0 Baseline Snapshot に進む（既存フロー継続）
  - 「スキップする」→ Case B の通常の手動ハンドオフに進む指示を記述

- [x] T002 [US1] Case A セクションの冒頭説明文（L206 付近）を更新し、確認プロンプトの存在を反映する in global/specflow.impl_review.md
  - 「auto-fix loop を開始する」→「ユーザーに確認後、auto-fix loop を開始する」に文言を調整

**Checkpoint**: User Story 1 完了後、actionable high findings がある場合に確認プロンプトが表示され、「開始する」で auto-fix loop が動作、「スキップする」で Case B handoff に遷移する

---

## Phase 4: User Story 2 - 確認プロンプトでの情報表示 (Priority: P2)

**Goal**: 確認プロンプトに actionable high findings の件数とタイトル一覧を表示する

**Independent Test**: high findings が複数ある場合に件数とタイトルが確認プロンプトに含まれる

### Implementation for User Story 2

(T001 で US2 の要件も同時に実装済み — 確認プロンプトの質問テキストに件数・タイトル一覧を含める記述は T001 の scope に含まれる)

**Checkpoint**: 確認プロンプトに件数とタイトル一覧が表示される

---

## Phase 5: User Story 3 - Auto-fix 不要時はプロンプトなし (Priority: P2)

**Goal**: actionable high findings が 0 件の場合は確認プロンプトを表示しない

**Independent Test**: high findings が 0 件の場合に確認プロンプトなしで Case B に到達する

### Implementation for User Story 3

(既存の Case A / Case B 分岐ロジックにより、actionable_high_count == 0 の場合は Case B に進むため、追加実装不要。確認プロンプトは Case A 内にのみ挿入するため、自動的に US3 の要件を満たす)

**Checkpoint**: high findings が 0 件の場合、確認プロンプトなしで Case B handoff に到達する

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T003 quickstart.md のテスト手順に沿って手動検証を実施 in specs/012-autofix-loop-prompt/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 3 (US1)**: 即座に開始可能。全変更の核となるタスク
- **Phase 4 (US2)**: T001 に含まれるため、Phase 3 と同時に完了
- **Phase 5 (US3)**: 追加実装不要。既存ロジックにより自動的に満たされる
- **Phase 6 (Polish)**: Phase 3 完了後に実施

### User Story Dependencies

- **US1 (P1)**: 独立して実装可能
- **US2 (P2)**: US1 の T001 に包含される（タイトル・件数表示は確認プロンプトの構成要素）
- **US3 (P2)**: 既存の Case A/B 分岐で自動的に満たされる

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001: 確認プロンプトサブセクションを挿入
2. T002: Case A 説明文を更新
3. **STOP and VALIDATE**: quickstart.md のテスト手順で検証
4. T003: 手動検証完了

### Summary

- **Total tasks**: 3
- **User Story 1**: 2 tasks (T001, T002)
- **User Story 2**: 0 tasks (T001 に包含)
- **User Story 3**: 0 tasks (既存ロジックで充足)
- **Polish**: 1 task (T003)
- **Parallel opportunities**: なし（全タスクが同一ファイルを対象）
- **Suggested MVP scope**: User Story 1 のみ（= 全 User Story をカバー）

---

## Notes

- 変更対象は `global/specflow.impl_review.md` の 1 ファイルのみ
- 既存の auto-fix loop ロジック、Case B/C handoff は一切変更しない
- US2 と US3 は US1 の実装に自然に含まれるため、独立タスクとしない
