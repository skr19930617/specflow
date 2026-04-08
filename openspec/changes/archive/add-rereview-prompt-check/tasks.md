# Tasks: Re-review プロンプトの欠落追加

## Phase 1: プロンプトファイル作成

### Task 1: review_spec_rereview_prompt.md の作成 ✅
- **Priority**: P0
- **Parallel**: Yes (Task 2 と並行可能)
- **File**: `global/prompts/review_spec_rereview_prompt.md`
- **Steps**:
  1. `review_impl_rereview_prompt.md` の構造をベースにする
  2. ロール宣言を "You are the specification re-reviewer." に変更
  3. スコープを "BROAD re-review of the specification" に変更
  4. 入力を PREVIOUS_FINDINGS, MAX_FINDING_ID, ISSUE BODY, SPEC CONTENT に変更
  5. Part 2 のレビュー観点を spec 固有カテゴリに変更:
     - ambiguity, acceptance_criteria, edge_case, contradiction, assumption, vagueness
  6. レビュールールを初回 spec review と整合させる（issue body との忠実性チェック等）
  7. 出力 JSON スキーマの category enum を spec 固有カテゴリに更新
- **Acceptance**: ファイルが存在し、JSON スキーマが proposal.md の「出力 JSON スキーマ」と一致

### Task 2: review_plan_rereview_prompt.md の作成 ✅
- **Priority**: P0
- **Parallel**: Yes (Task 1 と並行可能)
- **File**: `global/prompts/review_plan_rereview_prompt.md`
- **Steps**:
  1. `review_impl_rereview_prompt.md` の構造をベースにする
  2. ロール宣言を "You are the plan and tasks re-reviewer." に変更
  3. スコープを "BROAD re-review of the plan and tasks" に変更
  4. 入力を PREVIOUS_FINDINGS, MAX_FINDING_ID, SPEC CONTENT, PLAN CONTENT, TASKS CONTENT に変更
  5. Part 2 のレビュー観点を plan 固有カテゴリに変更:
     - completeness, feasibility, ordering, granularity, scope, consistency, risk
  6. レビュールールを初回 plan review と整合させる（spec カバレッジ、タスク依存順序等）
  7. 出力 JSON スキーマの category enum を plan 固有カテゴリに更新
- **Acceptance**: ファイルが存在し、JSON スキーマが proposal.md の「出力 JSON スキーマ」と一致

## Phase 2: 検証

### Task 3: specflow-install でのコピー確認 ✅
- **Priority**: P1
- **Depends on**: Task 1, Task 2
- **Steps**:
  1. `specflow-install` を実行
  2. `~/.config/specflow/global/review_spec_rereview_prompt.md` が存在することを確認
  3. `~/.config/specflow/global/review_plan_rereview_prompt.md` が存在することを確認
- **Acceptance**: 両ファイルがインストール先に存在
