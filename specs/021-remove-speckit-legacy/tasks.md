# Tasks: speckit時代のレガシー排除

**Input**: Design documents from `/specs/021-remove-speckit-legacy/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: 作業前の状態確認と準備

- [ ] T001 speckit 参照の現状を確認: `grep -r "speckit" . --exclude-dir=.git --exclude-dir=specs/021-remove-speckit-legacy -l` を実行し対象ファイル一覧を記録
- [ ] T002 migration 関連ファイルの存在を確認: `ls bin/specflow-migrate-* specs/020-openspec-migration/ openspec/changes/020-openspec-migration/` を実行

---

## Phase 2: Foundational — コマンドファイルのリネーム・統合 (Blocking)

**Purpose**: speckit.* → specflow.* コマンド統合。後続の全参照更新の前提。

**⚠️ CRITICAL**: Phase 3 以降の参照更新はこのフェーズの完了が前提

- [ ] T003 [P] `.claude/commands/speckit.specify.md` を `.claude/commands/specflow.specify.md` にリネームし、ファイル内の speckit 参照を specflow に更新
- [ ] T004 [P] `.claude/commands/speckit.clarify.md` を `.claude/commands/specflow.clarify.md` にリネームし、内容の speckit 参照を更新
- [ ] T005 [P] `.claude/commands/speckit.tasks.md` を `.claude/commands/specflow.tasks.md` にリネームし、内容の speckit 参照を更新
- [ ] T006 [P] `.claude/commands/speckit.analyze.md` を `.claude/commands/specflow.analyze.md` にリネームし、内容の speckit 参照を更新
- [ ] T007 [P] `.claude/commands/speckit.checklist.md` を `.claude/commands/specflow.checklist.md` にリネームし、内容の speckit 参照を更新
- [ ] T008 [P] `.claude/commands/speckit.constitution.md` を `.claude/commands/specflow.constitution.md` にリネームし、内容の speckit 参照を更新
- [ ] T009 [P] `.claude/commands/speckit.taskstoissues.md` を `.claude/commands/specflow.taskstoissues.md` にリネームし、内容の speckit 参照を更新
- [ ] T010 `.claude/commands/speckit.plan.md` の内容を `global/specflow.plan.md` に統合し、speckit.plan.md を削除。specflow.plan.md 内の `Read speckit.plan.md` 参照を統合後の内容に置き換え
- [ ] T011 `.claude/commands/speckit.implement.md` の内容を `global/specflow.impl.md` に統合し、speckit.implement.md を削除。specflow.impl.md 内の `Read speckit.implement.md` 参照を統合後の内容に置き換え

**Checkpoint**: 全 speckit.* コマンドファイルが specflow.* に移行完了

---

## Phase 3: User Story 1 — 新規ユーザーがプロジェクトをセットアップする (Priority: P1) 🎯 MVP

**Goal**: README, インストールスクリプト, テンプレートから speckit 参照を排除し、新規ユーザーが混乱なくセットアップできるようにする

**Independent Test**: `grep -i "speckit" README.md CLAUDE.md template/CLAUDE.md bin/specflow-init` が 0 件

### Implementation

- [ ] T012 [P] [US1] `README.md` 内の speckit 参照を全て specflow に更新
- [ ] T013 [P] [US1] `bin/specflow-init` 内の speckit 参照を全て更新
- [ ] T014 [P] [US1] `template/CLAUDE.md` 内の speckit 参照を全て specflow に更新
- [ ] T015 [US1] `CLAUDE.md` の Active Technologies セクションから feature 別履歴エントリを全削除し、現行の技術スタック（Bash scripts, Markdown, Claude Code CLI, Codex CLI, GitHub CLI）のみ簡潔に記載
- [ ] T016 [US1] `CLAUDE.md` 内の speckit 参照（Prerequisites セクション、Spec Kit Slash Commands セクション等）を specflow に更新

**Checkpoint**: 新規ユーザー向けドキュメントから speckit 参照が完全に排除

---

## Phase 4: User Story 2 — 既存ユーザーが migration なしで運用する (Priority: P1)

**Goal**: マイグレーション関連ファイル・ディレクトリを完全削除し、migration 参照をドキュメントから除去

**Independent Test**: `ls bin/specflow-migrate-* specs/020-openspec-migration openspec/changes/020-openspec-migration 2>/dev/null` が 0 件、`grep -r "migration\|migrate" openspec/README.md` が 0 件

### Implementation

- [ ] T017 [P] [US2] `bin/specflow-migrate-openspec.sh` を削除
- [ ] T018 [P] [US2] `specs/020-openspec-migration/` ディレクトリを全削除
- [ ] T019 [P] [US2] `openspec/changes/020-openspec-migration/` ディレクトリを全削除
- [ ] T020 [US2] `openspec/README.md` から legacy migration 関連の参照を削除

**Checkpoint**: マイグレーション関連が完全除去

---

## Phase 5: User Story 3 — 開発者がコードベースを理解する (Priority: P2)

**Goal**: global/ コマンドファイル、.specify/ 内部、履歴ファイルから speckit 参照を排除し、コードベース全体で統一された名称体系にする

**Independent Test**: `grep -r "speckit" . --exclude-dir=.git --exclude-dir=specs/021-remove-speckit-legacy --include="*.md" --include="*.json" --include="*.sh" -l` が 0 件（外部依存除く）

### グローバルコマンド更新

- [ ] T021 [P] [US3] `global/specflow.md` 内の speckit.* 呼び出しを specflow.* に更新
- [ ] T022 [P] [US3] `global/specflow.spec_review.md` 内の speckit 参照を更新
- [ ] T023 [P] [US3] `global/specflow.spec_fix.md` 内の speckit 参照を更新
- [ ] T024 [P] [US3] `global/specflow.plan_review.md` 内の speckit 参照を更新
- [ ] T025 [P] [US3] `global/specflow.plan_fix.md` 内の speckit 参照を更新
- [ ] T026 [P] [US3] `global/specflow.impl_review.md` 内の speckit 参照を更新
- [ ] T027 [P] [US3] `global/specflow.fix.md` 内の speckit 参照を更新
- [ ] T028 [P] [US3] `global/specflow.approve.md` 内の speckit 参照を更新
- [ ] T029 [P] [US3] `global/specflow.reject.md` 内の speckit 参照を更新
- [ ] T030 [P] [US3] `global/specflow.dashboard.md` 内の speckit 参照を更新
- [ ] T031 [P] [US3] `global/specflow.decompose.md` 内の speckit 参照を更新
- [ ] T032 [P] [US3] `global/specflow.setup.md` 内の speckit 参照を更新

### .specify/ 内部更新

- [ ] T033 [P] [US3] `.specify/scripts/bash/check-prerequisites.sh` 内の speckit エラーメッセージを更新
- [ ] T034 [P] [US3] `.specify/templates/plan-template.md` 内の speckit.plan, speckit.tasks 参照を specflow.* に更新
- [ ] T035 [P] [US3] `.specify/templates/tasks-template.md` 内の speckit.tasks, speckit.implement 参照を specflow.* に更新
- [ ] T036 [P] [US3] `.specify/templates/checklist-template.md` 内の speckit 参照を specflow に更新
- [ ] T037 [US3] `.specify/init-options.json` の `speckit_version` キー名を確認し、可能であれば更新

### 履歴ファイル更新

- [ ] T038 [US3] `specs/` 配下の全 feature ディレクトリ（021 を除く）内の `*.md` ファイルの speckit 参照を一括更新
- [ ] T039 [US3] `specs/` 配下の全 feature ディレクトリ（021 を除く）内の `*.json` ファイルの speckit 参照を一括更新
- [ ] T040 [US3] JSON lint 検証: `specs/` 配下および `openspec/changes/` 配下の全 `*.json` ファイル（`*.json.bak` 含む）が有効な JSON であることを `python3 -m json.tool` 等で確認
- [ ] T041 [US3] `openspec/changes/` 配下の全ディレクトリ（020 を除く）内の speckit 参照を一括更新

**Checkpoint**: プロジェクト全体で speckit 参照が 0 件（外部依存・本 feature spec 除く）

---

## Phase 6: Polish & Verification

**Purpose**: 全変更の検証とクリーンアップ。各 Success Criteria を個別に検証。

### SC-001: speckit grep 0 件検証
- [ ] T042 最終 grep 検証: `grep -r "speckit" . --exclude-dir=.git --exclude-dir=specs/021-remove-speckit-legacy` が 0 件であることを確認（全拡張子対象: *.md, *.json, *.json.bak, *.sh 等。外部依存の npm パッケージ名等は例外として許容）

### SC-002: migration 完全除去検証
- [ ] T043 削除確認: `bin/specflow-migrate-*`, `specs/020-openspec-migration/`, `openspec/changes/020-openspec-migration/` が存在しないことを確認
- [ ] T044 migration 参照検証: `grep -r "migrate\|migration" openspec/README.md template/ README.md` が 0 件であることを確認

### SC-003: README 手順での初期化検証
- [ ] T045 README に記載されたセットアップ手順を実行し、`bin/specflow-init` が正常に動作することを確認

### SC-004: 全コマンドリネーム後の動作検証
- [ ] T046 リネームされた specflow.* コマンド（specflow.specify, specflow.clarify, specflow.tasks, specflow.analyze, specflow.checklist, specflow.constitution, specflow.taskstoissues）のファイル存在を確認: `ls .claude/commands/specflow.{specify,clarify,tasks,analyze,checklist,constitution,taskstoissues}.md`
- [ ] T047 吸収された speckit.* コマンドの削除確認: `ls .claude/commands/speckit.*.md 2>/dev/null` が 0 件
- [ ] T048 specflow ワークフロー動作確認: `/specflow` コマンドが正常に起動することを確認

### SC-005: CLAUDE.md 検証
- [ ] T049 CLAUDE.md の Active Technologies セクションに feature 別履歴エントリがなく、現行スタックのみ簡潔に記載されていることを目視確認

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 2 completion — can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 completion — can run in parallel with Phase 3/4
- **Phase 6 (Verification)**: Depends on Phase 3, 4, 5 completion

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only
- **US2 (P1)**: Depends on Phase 2 only — independent of US1
- **US3 (P2)**: Depends on Phase 2 only — independent of US1/US2

### Parallel Opportunities

- Phase 2: T003-T009 can all run in parallel (7 independent file renames)
- Phase 3: T012-T014 can run in parallel
- Phase 4: T017-T019 can run in parallel
- Phase 5: T021-T037 can all run in parallel (different files)
- Phase 3, 4, 5 can run in parallel after Phase 2

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (state confirmation)
2. Complete Phase 2: Command rename/merge (CRITICAL)
3. Complete Phase 3: Documentation cleanup (US1)
4. Complete Phase 4: Migration deletion (US2)
5. **STOP and VALIDATE**: grep 検証 + ワークフロー確認

### Incremental Delivery

1. Phase 2 完了 → コマンド統合完了
2. Phase 3 完了 → 新規ユーザー向けドキュメント完了
3. Phase 4 完了 → migration 完全除去
4. Phase 5 完了 → 全履歴・内部ファイル更新
5. Phase 6 完了 → 最終検証

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- speckit.plan と speckit.implement の「吸収」は内容の統合が必要で、単純リネームより作業量が多い
- .specify/init-options.json の `speckit_version` は npm パッケージとの連携がある可能性があるため、変更前に影響調査が必要
- 履歴ファイルの一括更新は sed/grep で効率的に実行可能
