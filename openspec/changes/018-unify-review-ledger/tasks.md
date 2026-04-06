<!-- Historical Migration
  Source: specs/018-unify-review-ledger/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: spec/planレビューをimpl方式のレビュー台帳に統一する

**Input**: Design documents from `specs/018-unify-review-ledger/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Review Prompt改修)

**Purpose**: CodexレビューのJSON出力をledger互換形式に統一し、re-review用プロンプトを作成

- [x] T001 [P] review_spec_prompt.md を改修: `questions[]` を `findings[]` に変更し、各findingに `id`, `severity`, `category`, `file`, `title`, `detail` フィールドを追加 — `~/.config/specflow/global/review_spec_prompt.md`
- [x] T002 [P] review_plan_prompt.md を改修: 既存の `findings[]` に `file` フィールドを追加（plan.md / tasks.md） — `~/.config/specflow/global/review_plan_prompt.md`
- [x] T003 [P] review_spec_rereview_prompt.md を新規作成: review_impl_rereview_prompt.md をベースにspec用カスタマイズ — `~/.config/specflow/global/review_spec_rereview_prompt.md`
- [x] T004 [P] review_plan_rereview_prompt.md を新規作成: review_impl_rereview_prompt.md をベースにplan用カスタマイズ — `~/.config/specflow/global/review_plan_rereview_prompt.md`

**Checkpoint**: 全reviewプロンプトがledger互換のJSON出力を返す

---

## Phase 2: Foundational (specflow-filter-diff更新)

**Purpose**: 新ledgerファイルをdiffから除外し、レビュー時のノイズを防止

**⚠️ CRITICAL**: Phase 3以降でledgerファイルが生成されるため、先にフィルタを更新

- [x] T005 specflow-filter-diff の除外パターンに `*/review-ledger-spec.json`, `*/review-ledger-plan.json`, `*/review-ledger-spec.json.bak`, `*/review-ledger-plan.json.bak` を追加 — `bin/specflow-filter-diff`

**Checkpoint**: 新ledgerファイルがdiffフィルタで除外される

---

## Phase 3: User Story 1 - specレビューでレビュー台帳が記録される (Priority: P1) 🎯 MVP

**Goal**: spec reviewコマンドでreview-ledger-spec.jsonにレビュー結果を記録し、再レビュー時にfinding状態遷移を追跡

**Independent Test**: `/specflow.spec_review` 実行後にreview-ledger-spec.jsonが生成され、`/specflow.spec_fix` 後にfinding状態が正しく遷移

### Implementation for User Story 1

- [x] T006 [US1] specflow.spec_review.md に「Step 1.5: Review Ledger Update」を追加: review-ledger-spec.jsonの読み込み/新規作成。初回（ledger未存在）: 新規作成、round 1、全findingsを"new"で登録。再実行（ledger既存在）: current_roundインクリメント、3段階findingマッチング（same→reframed→remaining）で既存findingsとの状態遷移を追跡。round_summaries計算、バックアップ(.bak)作成 — `global/specflow.spec_review.md`
- [x] T007 [US1] specflow.spec_review.md に「Step 1.6: current-phase.md 生成」を追加: phase="spec-review" — `global/specflow.spec_review.md`
- [x] T008 [US1] specflow.spec_review.md に「Step 1.7: low severity自動適用」を追加: severity "low" findingのみspecファイルに修正を適用し、ledger上で該当findingのstatusを"resolved"に更新する。**自動適用後の再レビュー（Codex再呼び出し）は一切行わない**。medium以上はユーザーへ手動修正を提示 — `global/specflow.spec_review.md`
- [x] T009 [US1] specflow.spec_fix.md を改修: review-ledger-spec.json の存在確認、ledger存在時はre-reviewプロンプト(review_spec_rereview_prompt.md)使用、未存在時は初回プロンプト使用、re-review後のledger更新、current-phase.md生成(phase="spec-fix-review")、low severity自動適用 — `global/specflow.spec_fix.md`

**Checkpoint**: spec reviewでledger記録・再レビューでfinding追跡が動作

---

## Phase 4: User Story 2 - planレビューでレビュー台帳が記録される (Priority: P1)

**Goal**: plan reviewコマンドでreview-ledger-plan.jsonにレビュー結果を記録し、auto-fixループでfindingを自動追跡

**Independent Test**: `/specflow.plan_review` 実行後にreview-ledger-plan.jsonが生成され、auto-fixループが動作

### Implementation for User Story 2

- [x] T010 [US2] specflow.plan_review.md に「Step 1.5: Review Ledger Update」を追加: review-ledger-plan.json の読み込み/新規作成、findingマッチングアルゴリズム、round_summaries計算、バックアップ — `global/specflow.plan_review.md`
- [x] T011 [US2] specflow.plan_review.md に「Step 1.6: current-phase.md 生成」を追加: phase="plan-review" — `global/specflow.plan_review.md`
- [x] T012 [US2] specflow.plan_review.md に「Step 2: Auto-fix ループ」を追加: impl_reviewのauto-fixロジック移植（baseline snapshot、specflow.plan_fix autofix呼び出し、divergence detection、max rounds制御） — `global/specflow.plan_review.md`
- [x] T013 [US2] specflow.plan_fix.md を改修: review-ledger-plan.json の存在確認、re-reviewプロンプト選択、ledger更新、current-phase.md生成(phase="plan-fix-review")、autofix引数対応（handoffスキップ） — `global/specflow.plan_fix.md`

**Checkpoint**: plan reviewでledger記録・auto-fixループが動作

---

## Phase 5: User Story 3 - phase別のledgerファイルで独立管理 (Priority: P2)

**Goal**: 既存のimpl ledgerに影響を与えず、各phaseのledgerが独立動作することを確認

**Independent Test**: spec→plan→implのフロー全体で各ledgerが独立して正しく動作

### Implementation for User Story 3

- [x] T014 [US3] specflow.approve.md を改修: review-ledger-spec.json と review-ledger-plan.json の読み込み対応、approval-summary の Review Loop Summary をphase別に拡張、quality gate checkで全phaseのledgerを確認 — `global/specflow.approve.md`
- [x] T015 [US3] specflow-install を改修 (既存ロジックが新規ファイルを自動的にインストールするため変更不要): 新規ファイル（specflow.dashboard.md, review_spec_rereview_prompt.md, review_plan_rereview_prompt.md）のインストール追加 — `bin/specflow-install`

**Checkpoint**: approve時にspec/plan/impl全phaseのledgerが参照され、既存impl ledgerに影響なし

---

## Phase 6: User Story 4 - レビュー台帳の可視化 (Priority: P3)

**Goal**: 全featureのレビュー状況をダッシュボードで一覧確認

**Independent Test**: 複数featureのledgerファイルが存在する状態でdashboardコマンド実行→テーブル表示+Markdown保存

### Implementation for User Story 4

- [x] T016 [US4] specflow.dashboard.md を新規作成: specs/配下の全featureディレクトリ探索（spec.md存在するディレクトリのみ）、各featureのreview-ledger-spec.json/review-ledger-plan.json/review-ledger.jsonを読み込み、集計ルール（data-model.mdの表示値マッピング準拠）に基づくテーブル生成。**出力は2つ**: (1) CLIターミナルにMarkdownテーブルを表示、(2) `specs/review-dashboard.md` にMarkdownファイルとして保存（タイムスタンプ付きヘッダー含む） — `global/specflow.dashboard.md`

**Checkpoint**: dashboardコマンドで全featureのレビュー状況が一覧表示される

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: ドキュメント更新と整合性確認

- [x] T017 [P] CLAUDE.md のspecflow slash commandsテーブルに `/specflow.dashboard` を追加 — `CLAUDE.md`
- [x] T018 [P] CLAUDE.md の Active Technologies セクションに本featureの技術情報を追加 — `CLAUDE.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — 全promptを並列改修可能
- **Phase 2 (Foundational)**: Phase 1完了後 — filter-diffの更新
- **Phase 3 (US1 - spec review)**: Phase 1, 2完了後
- **Phase 4 (US2 - plan review)**: Phase 1, 2完了後 — Phase 3と独立して実装可能
- **Phase 5 (US3 - 独立管理)**: Phase 3, 4完了後 — approve改修はspec/plan ledgerの存在が前提
- **Phase 6 (US4 - 可視化)**: Phase 3, 4完了後 — ledgerファイルの存在が前提
- **Phase 7 (Polish)**: 全Phase完了後

### User Story Dependencies

- **User Story 1 (spec review)**: Phase 1, 2完了後 — 他のstoryに依存しない
- **User Story 2 (plan review)**: Phase 1, 2完了後 — US1に依存しない
- **User Story 3 (独立管理)**: US1, US2完了後 — approve時に全ledgerを参照するため
- **User Story 4 (可視化)**: US1, US2完了後 — ledgerファイルが存在する前提

### Within Each User Story

- ledger記録ロジック → current-phase.md生成 → auto-fix/自動適用（順序依存）

### Parallel Opportunities

- Phase 1: T001, T002, T003, T004 は全て並列実行可能（別ファイル）
- Phase 3 と Phase 4: US1とUS2は並列実行可能（spec_reviewとplan_reviewは独立ファイル）
- Phase 5: T014, T015 は並列実行可能（approve.mdとinstallは別ファイル）
- Phase 7: T017, T018 は並列実行可能（同一ファイルだが別セクション）

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Review Prompt改修
2. Complete Phase 2: filter-diff更新
3. Complete Phase 3: spec review ledger統合
4. **STOP and VALIDATE**: spec_review → spec_fix でledger記録・finding追跡を確認

### Incremental Delivery

1. Phase 1 + 2 → 基盤完了
2. Phase 3 (US1) → spec review ledger動作確認 (MVP)
3. Phase 4 (US2) → plan review + auto-fix動作確認
4. Phase 5 (US3) → approve時の全phase参照確認
5. Phase 6 (US4) → dashboard可視化確認
6. Phase 7 → ドキュメント整備

---

## Notes

- 全タスクはMarkdown slash commandファイルの編集であり、共通コードの抽出は不可能
- impl_reviewの既存ロジックを参照テンプレートとして各コマンドに移植する
- ledgerのJSONスキーマは既存のimpl ledgerと完全に同一（phaseフィールドの値のみ異なる）
- auto-fixループはplan reviewのみ（spec reviewは手動修正フロー）
