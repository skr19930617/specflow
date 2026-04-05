# Tasks: ローカルにpromptを入れない — Prompt のグローバルインストール

**Input**: Design documents from `/specs/015-global-prompt-install/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: テスト不要（ファイル移動・テキスト置換のみ。手動検証で確認）

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: なし。本機能はプロジェクト構造の変更を伴わない。

（セットアップタスクなし — 既存リポジトリ上の変更のみ）

---

## Phase 2: User Story 1 + 2 — Prompt ファイルの移動 + Markdown 化 (Priority: P1)

**Goal**: `.specflow/review_*_prompt.txt` の内容を `global/review_*_prompt.md` として作成し、全スラッシュコマンドの参照パスを更新する

**Independent Test**: `/specflow.spec_review` を実行し、`global/review_spec_prompt.md` が読み込まれてレビューが正常完了することを確認

### Prompt ファイル作成

- [x] T001 [P] [US1] `.specflow/review_spec_prompt.txt` の内容を `global/review_spec_prompt.md` にコピー（拡張子変更、内容同一保持）
- [x] T002 [P] [US1] `.specflow/review_plan_prompt.txt` の内容を `global/review_plan_prompt.md` にコピー
- [x] T003 [P] [US1] `.specflow/review_impl_prompt.txt` の内容を `global/review_impl_prompt.md` にコピー
- [x] T004 [P] [US1] `.specflow/review_impl_rereview_prompt.txt` の内容を `global/review_impl_rereview_prompt.md` にコピー

### スラッシュコマンドの参照パス更新

- [x] T005 [P] [US2] `global/specflow.spec_review.md` の `.specflow/review_spec_prompt.txt` を `~/.config/specflow/global/review_spec_prompt.md` に更新
- [x] T006 [P] [US2] `global/specflow.spec_fix.md` の `.specflow/review_spec_prompt.txt` を `~/.config/specflow/global/review_spec_prompt.md` に更新
- [x] T007 [P] [US2] `global/specflow.plan_review.md` の `.specflow/review_plan_prompt.txt` を `~/.config/specflow/global/review_plan_prompt.md` に更新
- [x] T008 [P] [US2] `global/specflow.plan_fix.md` の `.specflow/review_plan_prompt.txt` を `~/.config/specflow/global/review_plan_prompt.md` に更新
- [x] T009 [P] [US2] `global/specflow.impl_review.md` の `.specflow/review_impl_prompt.txt` を `~/.config/specflow/global/review_impl_prompt.md` に更新
- [x] T010 [US2] `global/specflow.fix.md` の `.specflow/review_impl_prompt.txt` (L96) を `~/.config/specflow/global/review_impl_prompt.md` に、`.specflow/review_impl_rereview_prompt.txt` (L110) を `~/.config/specflow/global/review_impl_rereview_prompt.md` に更新

### エラーハンドリング追加

- [x] T010a [US2] 各スラッシュコマンドファイル（T005-T010 で更新済み）に、prompt ファイルが存在しない場合のエラーメッセージを追加。Read で `~/.config/specflow/global/review_*_prompt.md` を読む指示の直後に「ファイルが存在しない場合: `"❌ review prompt が見つかりません（~/.config/specflow/global/review_*_prompt.md）。specflow を再インストールしてください: specflow-install"` → STOP」を記述

**Checkpoint**: この時点で全レビューコマンドが `global/` の `.md` prompt を参照し、不在時にはエラーメッセージが表示される

---

## Phase 2.5: コマンドマッピング検証

**Purpose**: 全コマンドが正しい prompt を参照することを確認

- [x] T010b 各スラッシュコマンドファイルの prompt 参照パスが正しいことを grep で検証: `~/.config/specflow/global/review_spec_prompt.md` が `specflow.spec_review.md` と `specflow.spec_fix.md` に、`~/.config/specflow/global/review_plan_prompt.md` が `specflow.plan_review.md` と `specflow.plan_fix.md` に、`~/.config/specflow/global/review_impl_prompt.md` が `specflow.impl_review.md` と `specflow.fix.md` に、`~/.config/specflow/global/review_impl_rereview_prompt.md` が `specflow.fix.md` に含まれることを確認
- [x] T010c `.specflow/review_` への旧参照が `global/` 配下のコマンドファイルに残っていないことを grep で確認: `grep -r '.specflow/review_' global/` が 0 件であること

### E2E 検証

- [x] T010d `specflow-install` を実行し、`~/.config/specflow/global/review_spec_prompt.md` が存在することを `ls` で確認
- [x] T010e `specflow-install` 後、全 6 コマンドの prompt 参照が動作することを確認。各コマンドファイルを Read し、参照先の prompt ファイル（`~/.config/specflow/global/review_*_prompt.md`）が Read で正常に読めることを検証。対象: spec_review, spec_fix, plan_review, plan_fix, impl_review, fix
- [x] T010f missing-prompt 負パス検証: `~/.config/specflow/global/review_spec_prompt.md` を一時的にリネームし、`/specflow.spec_review` のコマンドファイル内のエラー分岐が正しく記述されていることを目視確認。検証後にファイル名を復元

**Checkpoint**: 全マッピングが正しく、旧パスへの参照が残っておらず、6 コマンドすべての正常パスと 1 コマンドのエラーパスを検証済み

---

## Phase 3: User Story 3 — テンプレート + init スクリプトのクリーンアップ (Priority: P2)

**Goal**: テンプレートから prompt ファイルを除去し、`specflow-init` の出力メッセージを更新する

**Independent Test**: `specflow-install` → `specflow-init` を新規ディレクトリで実行し、`.specflow/` に prompt ファイルが含まれないことを確認

- [x] T011 [P] [US3] `template/.specflow/review_spec_prompt.txt` を削除
- [x] T012 [P] [US3] `template/.specflow/review_plan_prompt.txt` を削除
- [x] T013 [P] [US3] `template/.specflow/review_impl_prompt.txt` を削除
- [x] T014 [P] [US3] `template/.specflow/review_impl_rereview_prompt.txt` を削除
- [x] T015 [US3] `bin/specflow-init` の出力メッセージ（L154-L157）から `review_*_prompt.txt` の 4 行を削除

**Checkpoint**: テンプレートから prompt ファイルが除去され、新規初期化時に配置されない

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: specflow 開発リポジトリ（本リポジトリ）のクリーンアップのみ。ユーザープロジェクトの `.specflow/` は一切変更しない（FR-006 準拠）。

- [x] T016 [P] 本リポジトリ（specflow 開発リポジトリ）の `.specflow/review_spec_prompt.txt` を git rm で削除
- [x] T017 [P] 本リポジトリの `.specflow/review_plan_prompt.txt` を git rm で削除
- [x] T018 [P] 本リポジトリの `.specflow/review_impl_prompt.txt` を git rm で削除
- [x] T019 [P] 本リポジトリの `.specflow/review_impl_rereview_prompt.txt` を git rm で削除
- [x] T020 quickstart.md の検証手順を実行して全体動作を確認

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (US1+US2)**: 依存なし — 即時開始可能
  - T001-T004（prompt 作成）は並行実行可能
  - T005-T010（参照更新）は T001-T004 完了後に実行
- **Phase 3 (US3)**: Phase 2 完了後に実行（動作確認してからクリーンアップ）
- **Phase 4 (Polish)**: Phase 2 + 3 完了後に実行

### User Story Dependencies

- **User Story 1 (P1)**: 依存なし
- **User Story 2 (P1)**: US1 完了後（prompt ファイルが `global/` に存在する必要がある）
- **User Story 3 (P2)**: US1 + US2 完了後

### Parallel Opportunities

- T001-T004: 4 ファイルの prompt 作成は完全並行
- T005-T009: 5 ファイルのパス更新は完全並行
- T011-T014: 4 ファイルのテンプレート削除は完全並行
- T016-T019: 4 ファイルのローカル削除は完全並行

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Phase 2 を完了 → prompt が `global/` から読み込まれ、エラーハンドリングも追加
2. Phase 2.5 で検証 → 全マッピング正しいことを確認
3. **STOP and VALIDATE**: `/specflow.spec_review` を実行して動作確認
4. 問題なければ Phase 3, 4 を順次実行

### 全体見積

- タスク総数: 25
- Phase 2 (US1+US2): 11 タスク（T001-T010a）
- Phase 2.5 (検証): 5 タスク（T010b-T010f）
- Phase 3 (US3): 5 タスク（T011-T015）
- Phase 4 (Polish): 5 タスク（T016-T020）
- 並行実行可能: 18/23 タスク（[P] マーク付き）

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- prompt 内容は変更しない（拡張子のみ `.txt` → `.md`）
- Commit after each phase completion
