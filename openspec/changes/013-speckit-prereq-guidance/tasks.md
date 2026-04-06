<!-- Historical Migration
  Source: specs/013-specflow-prereq-guidance/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: specflow 前提条件チェック時のガイダンス改善

**Input**: Design documents from `/specs/013-specflow-prereq-guidance/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions
- US1（specflow エラーメッセージ）と US2（config.env エラーメッセージ）はファイル単位で同時修正

---

## Phase 1: コマンドファイルの Prerequisites 修正（US1 + US2 統合）

**Goal**: 全 10 ファイルの Prerequisites セクションを統一フォーマットに更新し、各 failure state に対応する recovery command をステップ形式で案内する

### パターン C: 詳細形式 + チェック順序統一

- [x] T001 specflow.md の Prerequisites セクションを修正: (1) チェック順序を specflow → config.env に統一、(2) 両 failure state のエラーメッセージをステップ形式に更新 in `global/specflow.md`

### パターン A: 短縮形式（7 ファイル）

- [x] T002 [P] specflow.plan.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.plan.md`
- [x] T003 [P] specflow.spec_fix.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.spec_fix.md`
- [x] T004 [P] specflow.plan_fix.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.plan_fix.md`
- [x] T005 [P] specflow.fix.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.fix.md`
- [x] T006 [P] specflow.spec_review.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.spec_review.md`
- [x] T007 [P] specflow.plan_review.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.plan_review.md`
- [x] T008 [P] specflow.approve.md の Prerequisites（Step 0.5 内）: 両 failure state のエラーメッセージをステップ形式に追加 in `global/specflow.approve.md`

### パターン B: 短縮形式 + config 読み取り（2 ファイル）

- [x] T009 [P] specflow.impl.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加（4行目の SPECFLOW_MAX_AUTOFIX_ROUNDS 読み取りを保持） in `global/specflow.impl.md`
- [x] T010 [P] specflow.impl_review.md の Prerequisites セクション: 両 failure state のエラーメッセージをステップ形式に追加（4行目の SPECFLOW_MAX_AUTOFIX_ROUNDS 読み取りを保持） in `global/specflow.impl_review.md`

**Checkpoint**: 全 10 ファイルの Prerequisites が統一フォーマットになっている

---

## Phase 2: README 更新（US3）

**Goal**: README に前提条件セクションを追加し、Failure State → Command Mapping を記載する

**Independent Test**: README の手順のみで specflow セットアップが完了する

- [x] T011 README.md に Prerequisites セクションを追加: specflow インストール（`npx specy init`）と specflow 初期化（`/specflow.setup`）の手順を Failure State → Command Mapping テーブルとともに記載 in `README.md`

**Checkpoint**: README の手順に従うだけで specflow セットアップが完了する

---

## Phase 3: 検証

**Goal**: 全 acceptance scenario を個別に検証する

- [ ] T012 検証: specflow 未インストール状態で `/specflow` を実行し、`npx specy init` がステップ形式で案内されることを確認（US1 Acceptance Scenario 1, 2）
- [ ] T013 検証: `npx specy init` 実行後に `/specflow` を再実行し、Failure State 1 が解消され Failure State 2（`/specflow.setup` 案内）に進むことを確認（US1 Acceptance Scenario 3）
- [ ] T014 検証: specflow インストール済み + config.env 未存在の状態で `/specflow` を実行し、`/specflow.setup` がステップ形式で案内されることを確認（US2 Acceptance Scenario 1）
- [ ] T015 検証: `/specflow.setup` 実行後に `/specflow` を再実行し、正常に動作することを確認（US2 Acceptance Scenario 2）
- [ ] T016 検証: README のセットアップ手順に specflow インストール方法と specflow 初期化手順が記載されていることを確認（US3 Acceptance Scenario 1, 2）
- [ ] T017 検証: README end-to-end — クリーン状態から README の手順のみで `npx specy init` → `/specflow.setup` → `/specflow` を順に実行し、specflow が正常に動作することを確認（US3 Acceptance Scenario 3, SC-003）
- [ ] T018 検証: 全 10 ファイルの Prerequisites セクションが統一フォーマットであること、チェック順序が specflow → config.env であることを静的に確認（SC-004 回帰チェック）
- [ ] T019 検証: パターン A 代表ファイル（`/specflow.plan`）で specflow 未インストール / config.env 未存在の各状態を実行し、エラーメッセージが正しく表示されることを確認（パターン A 回帰チェック）
- [ ] T020 検証: パターン B 代表ファイル（`/specflow.impl`）で specflow 未インストール / config.env 未存在の各状態を実行し、エラーメッセージが正しく表示され、かつ SPECFLOW_MAX_AUTOFIX_ROUNDS の読み取りが正常に動作することを確認（パターン B 回帰チェック）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: 依存なし — 即座に開始可能。T002-T010 は全て [P]（並列実行可能）。T001 は specflow.md 固有の順序変更があるため先行推奨
- **Phase 2**: 依存なし — Phase 1 と並行可能
- **Phase 3**: Phase 1 + Phase 2 完了後

### Parallel Opportunities

- T002-T010 は全て異なるファイルを編集するため並列実行可能
- T011 (README) は他のタスクと独立

---

## Implementation Strategy

### 推奨実施順序

1. T001: specflow.md（チェック順序統一 + エラーメッセージ更新 — 最も複雑なので先行）
2. T002-T010: 残り 9 ファイルを並列で修正
3. T011: README 更新
4. T012-T017: 検証

### エラーメッセージテンプレート（各タスクで使用）

**Failure State 1（specflow チェック）:**
```markdown
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm specflow is installed.
   - If missing:
     ```
     ❌ specflow が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
```

**Failure State 2（config.env チェック）:**
```markdown
1. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `/specflow.setup` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
```

**統一チェック順序（全ファイル共通）:**
1. specflow チェック（`.specify/scripts/bash/check-prerequisites.sh`）
2. config.env チェック（`.specflow/config.env`）
3. `source .specflow/config.env`

---

## Notes

- 全タスクは 1 ファイル = 1 タスク（US1 + US2 統合）に組み替え済み
- specflow.approve.md は Step 0.5 内のチェックを修正（他ファイルとは構造が異なる）
- specflow.md のチェック順序統一は FR-004 に合致させるための修正
