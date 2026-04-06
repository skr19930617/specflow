<!-- Historical Migration
  Source: specs/009-legacy-cleanup/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: レガシーコードのリファクタリング

**Input**: Design documents from `/specs/009-legacy-cleanup/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: 現状の参照マップを確認し、削除対象を確定する

- [x] T001 リポジトリ全ファイルの参照マップを作成: 全ファイル（.git/, .specify/, specs/, .claude/ を除く）に対して grep でクロスリファレンスを検索し、参照元ゼロのファイルを特定する
- [x] T002 削除対象ファイルリストを作成: T001 の結果に基づき、削除候補と根拠（参照元ゼロ）を `specs/009-legacy-cleanup/` にメモとして記録する

**Checkpoint**: 削除対象が確定 — 現時点の調査では参照元ゼロのファイルはなし

---

## Phase 2: User Story 1 — 不要なスクリプトの削除 (Priority: P1) 🎯 MVP

**Goal**: リポジトリから不要ファイルを削除し、既存ワークフローが正常に動作することを確認

**Independent Test**: `specflow-install` と `specflow-init` を実行してエラーが出ないことを確認

### Implementation for User Story 1

- [x] T003 [US1] T001 の結果に基づき、参照元ゼロのファイルがあれば削除する（現時点の調査では該当なし）
- [x] T004 [US1] 削除後（または変更なしの場合）、`bin/specflow-install` を実行して既存ワークフローがエラーなく動作することを検証する

**Checkpoint**: リポジトリに不要ファイルがないことを確認済み

---

## Phase 3: User Story 2 — ドキュメントの更新 (Priority: P2)

**Goal**: README.md のファイル構成セクションとセットアップ手順を実際のディレクトリ構造・コマンドと一致させる

**Independent Test**: README.md に記載された全ファイルパスが実在し、セットアップ手順が end-to-end で実行可能であることを確認

### Implementation for User Story 2

- [x] T005 [US2] `README.md` のファイル構成セクション（行 210-217 付近の `template/.specflow/` 配下）に `review_impl_rereview_prompt.txt` の行を追加する
- [x] T006 [US2] `README.md` のセットアップ手順セクション（「前提ツール」「インストール」「初期化」）を audit し、現行のコマンド名・ファイルパス・手順と一致していることを確認する。不一致があれば修正する
- [x] T007 [US2] `README.md` のファイル構成セクションが実際のディレクトリ構造と一致していることを、`find` と diff で検証する
- [x] T008 [US2] `README.md` のセットアップ手順を上から順に実行し（`specflow-install` → `specflow-init` → `specflow-init --update`）、すべてのステップがエラーなく完了することを end-to-end で検証する

**Checkpoint**: README.md のファイル構成・セットアップ手順が実態と一致

---

## Phase 4: User Story 3 — install スクリプトの更新 (Priority: P3)

**Goal**: specflow-install と specflow-init を現行のファイル構成に合わせて更新

**Independent Test**: クリーン環境で `specflow-install` → `specflow-init` を実行してエラーなし、コピーされたファイルセットが正しいこと

### Implementation for User Story 3

- [x] T009 [P] [US3] `bin/specflow-init` 行 136-138 の完了メッセージを更新: `review_plan_prompt.txt` と `review_impl_rereview_prompt.txt` を一覧に追加する (`bin/specflow-init`)
- [x] T010 [P] [US3] `bin/specflow-install` のセクション 2（bin/ scripts → ~/bin）の後に、古いシンボリックリンク掃除機能を追加する: `~/bin/` 配下で `specflow*` にマッチするシンボリックリンクのうち、(a) ターゲットファイルが存在しない（壊れたリンク）、または (b) 現在の `bin/` ディレクトリに対応するスクリプトが存在しない、のいずれかに該当するリンクを検出・自動削除し、削除したリンク名を表示する (`bin/specflow-install`)
- [x] T011 [US3] `bin/specflow-install` を実行して、新しい掃除機能がエラーなく動作することを検証する
- [x] T012 [US3] 新規の一時ディレクトリで `bin/specflow-init` を実行し、以下を検証する: (a) `.specflow/` 配下に template/.specflow/ の全ファイル（config.env, review_spec_prompt.txt, review_plan_prompt.txt, review_impl_prompt.txt, review_impl_rereview_prompt.txt）がコピーされること、(b) `.mcp.json` がコピーされること、(c) `CLAUDE.md` がコピーされること
- [x] T013 [US3] 既に `CLAUDE.md` と `.mcp.json` が存在するディレクトリで `bin/specflow-init` の非上書き動作を検証する: (a) `.specflow/` が既に存在する場合はエラーメッセージが出て上書きしないこと、(b) `CLAUDE.md` が既存の場合はスキップされること、(c) `.mcp.json` が既存の場合はスキップされること
- [x] T014 [US3] `bin/specflow-init --update` を実行して、スラッシュコマンドのみが更新されることを検証する

**Checkpoint**: install/init スクリプトが現行のファイル構成と一致、全パスで正常動作

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 全体の整合性確認とスラッシュコマンドの実行検証

- [x] T015 README.md に記載されたすべてのファイルパスが実在するファイルと一致することを最終確認する
- [x] T016 全スラッシュコマンド（`/specflow`, `/specflow.plan`, `/specflow.impl`, `/specflow.approve`, `/specflow.reject`, `/specflow.fix`, `/specflow.spec_fix`, `/specflow.plan_fix`, `/specflow.setup`）について、各コマンドファイルが参照する外部ファイル（prompt ファイル、config.env、bin スクリプト）がすべて存在し、install/init 後の環境で利用可能であることを検証する。検証方法: 各 specflow*.md から参照されているファイルパスを抽出し、そのすべてが template/ または .specflow/ に存在することを確認する
- [x] T017 `quickstart.md` の検証手順を実行して全項目がパスすることを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — 参照マップ作成
- **Phase 2 (US1)**: Phase 1 完了後 — 削除対象の確定が前提
- **Phase 3 (US2)**: Phase 2 完了後 — 削除が完了してからドキュメント更新
- **Phase 4 (US3)**: Phase 2 完了後 — 削除が完了してからスクリプト更新（Phase 3 と並行可能）
- **Phase 5 (Polish)**: Phase 3, 4 完了後 — 全変更完了後の最終検証

### User Story Dependencies

- **US1 (P1)**: 独立 — 他のストーリーに依存しない
- **US2 (P2)**: US1 完了後 — ファイル削除後にドキュメントを更新
- **US3 (P3)**: US1 完了後 — ファイル削除後にスクリプトを更新。US2 とは独立して並行実行可能

### Parallel Opportunities

- T009 と T010 は異なるファイルのため並行実行可能
- Phase 3 (US2) と Phase 4 (US3) は Phase 2 完了後に並行実行可能

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: 参照マップ作成・削除対象確定
2. Phase 2: 不要ファイル削除（該当なしの場合はスキップ）
3. **STOP and VALIDATE**: 既存ワークフロー動作確認

### Incremental Delivery

1. US1 完了 → ファイル整理完了
2. US2 追加 → README 更新 + セットアップ手順 end-to-end 検証
3. US3 追加 → install スクリプト更新 + init 新規/既存/update 全パス検証
4. Polish → スラッシュコマンド実行検証 + 最終整合性確認

---

## Notes

- 現時点の調査では参照元ゼロのファイルはない（research.md R1 参照）
- 主な作業はドキュメント不整合修正と install スクリプト改善
- [P] tasks = different files, no dependencies
- Commit after each phase checkpoint
