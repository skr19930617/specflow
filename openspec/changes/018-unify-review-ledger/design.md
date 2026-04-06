<!-- Historical Migration
  Source: specs/018-unify-review-ledger/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: spec/planレビューをimpl方式のレビュー台帳に統一する

**Branch**: `018-unify-review-ledger` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/018-unify-review-ledger/spec.md`

## Summary

既存のspec/plan reviewコマンド（Markdown slash commands）にimpl reviewと同じレビュー台帳（review-ledger）記録ロジックを追加する。phase別に独立ファイル（review-ledger-spec.json, review-ledger-plan.json）として管理し、既存のimpl ledger（review-ledger.json）は変更しない。spec reviewではlow severity自動適用のみ、plan reviewではimplと同じauto-fixループを有効化する。最終的に全featureのレビュー状況を可視化するdashboardコマンドを追加する。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)  
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit (.specify/)  
**Storage**: File-based — `specs/<feature>/review-ledger-{spec,plan}.json`, `specs/review-dashboard.md`  
**Testing**: 手動テスト（slash commandのため自動テスト不可）  
**Target Platform**: macOS / Linux (CLIツール)  
**Project Type**: CLI tool / developer workflow automation  
**Performance Goals**: N/A (インタラクティブCLIツール)  
**Constraints**: Markdown slash commandファイルのため共通ロジックの抽出不可、各コマンドに個別記述  
**Scale/Scope**: 6コマンドファイル変更 + 2新規ファイル + 2新規プロンプト + 1スクリプト変更

## Constitution Check

*GATE: Constitution is template (not configured) — skipped.*

## Project Structure

### Documentation (this feature)

```text
specs/018-unify-review-ledger/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
global/
├── specflow.spec_review.md    # 変更: ledger記録 + current-phase.md + low自動適用
├── specflow.spec_fix.md       # 変更: ledger読み込み + re-review分類モード + current-phase.md
├── specflow.plan_review.md    # 変更: ledger記録 + current-phase.md + auto-fixループ
├── specflow.plan_fix.md       # 変更: ledger読み込み + re-review分類モード + current-phase.md
├── specflow.approve.md        # 変更: 新ledgerファイル対応 + approval-summary拡張
└── specflow.dashboard.md      # 新規: 可視化コマンド

bin/
├── specflow-filter-diff       # 変更: 除外パターン追加
└── specflow-install           # 変更: 新規ファイルのインストール

~/.config/specflow/global/
├── review_spec_prompt.md          # 変更: findings構造をledger互換に
├── review_plan_prompt.md          # 変更: findings構造にfile/category追加
├── review_spec_rereview_prompt.md # 新規: spec re-review分類プロンプト
└── review_plan_rereview_prompt.md # 新規: plan re-review分類プロンプト
```

**Structure Decision**: 既存のファイル構造に準拠。新規ファイルは最小限（dashboard slash command + 2つのre-reviewプロンプト）。

## Implementation Strategy

### Phase A: Review Prompt改修 (Foundation)

既存のreview promptのJSON出力をledger互換形式に変更し、re-review用プロンプトを新規作成する。

1. **review_spec_prompt.md 改修**: `questions[]` 配列を `findings[]` 配列に変更。各findingに `id`, `severity`, `category`, `file`, `title`, `detail` フィールドを追加。file は spec.md 固定。category は spec用カテゴリ（ambiguity, completeness, contradiction, edge_case, assumption, scope）を使用。
2. **review_plan_prompt.md 改修**: 既存の `findings[]` に `file` フィールドを追加（plan.md / tasks.md）。category は既存のもの（completeness, feasibility, ordering, granularity, scope, consistency, risk）を維持。
3. **review_spec_rereview_prompt.md 新規作成**: impl の `review_impl_rereview_prompt.md` をベースに、spec用にカスタマイズ。入力に`PREVIOUS_FINDINGS`と`MAX_FINDING_ID`を受け取り、`resolved_previous_findings`, `still_open_previous_findings`, `new_findings` を返す。
4. **review_plan_rereview_prompt.md 新規作成**: 同上、plan用にカスタマイズ。

### Phase B: Spec Review Ledger統合

specflow.spec_review.md と specflow.spec_fix.md にledger記録ロジックを追加する。

1. **specflow.spec_review.md 改修**:
   - Step 1 (Codex review) の後に「Step 1.5: Review Ledger Update」を追加
   - `review-ledger-spec.json` の読み込み / 新規作成
   - **Ledger round/matching semantics（impl準拠）**:
     - 初回（ledger未存在）: 新規作成、`current_round = 1`、全findingsを `status = "new"` で登録
     - 再実行（ledger既存在）: `current_round` をインクリメントし、新ラウンドを追加。既存findingsとの3段階マッチング:
       1. Same match: file + category + severity 完全一致 → `status = "open"`, `relation = "same"`
       2. Reframed match: file + category 一致、severity 異 → 旧finding resolved、新finding作成 with `supersedes`
       3. Remaining: 未マッチCodex findings → `status = "new"`、未マッチ既存active → `status = "resolved"`
     - Override findings (accepted_risk/ignored) はstatus保持
   - round_summaries の計算と追記
   - バックアップ (.bak) 作成
   - Step 1.6: current-phase.md 生成（phase = "spec-review"）
   - Step 1.7: severity "low" findingの単発自動適用 → specファイルに修正適用 → ledger上で該当findingの `status = "resolved"` に更新（**この後の再レビューは行わない** — low自動適用はledger更新のみで完結する）
   - handoff はそのまま維持

2. **specflow.spec_fix.md 改修**:
   - Setup で `review-ledger-spec.json` の存在確認
   - ledger存在時: re-reviewプロンプト（review_spec_rereview_prompt.md）を使用
   - ledger未存在時: 初回レビュープロンプト（review_spec_prompt.md）を使用
   - re-review後のledger更新（分類結果に基づくstatus遷移）
   - current-phase.md 生成（phase = "spec-fix-review"）
   - low severity自動適用（spec_reviewと同じロジック）

### Phase C: Plan Review Ledger統合 + Auto-fix

specflow.plan_review.md と specflow.plan_fix.md にledger記録 + auto-fixループを追加する。

1. **specflow.plan_review.md 改修**:
   - Step 1.5: Review Ledger Update（spec_reviewと同じledger round/matchingセマンティクス、ファイル名は `review-ledger-plan.json`）
     - 初回: 新規作成 + round 1。再実行: round increment + 3段階マッチング（same → reframed → remaining）
   - Step 1.6: current-phase.md 生成（phase = "plan-review"）
   - Step 2: Auto-fix ループ追加（impl_reviewのauto-fixロジックを移植）
     - baseline snapshot記録
     - `specflow.plan_fix` を `autofix` 引数で呼び出し
     - divergence detection（質gate悪化、high再発、new high増加）
     - max rounds制御（`SPECFLOW_MAX_AUTOFIX_ROUNDS`）
   - handoff はループ終了後に表示

2. **specflow.plan_fix.md 改修**:
   - Setup で `review-ledger-plan.json` の存在確認
   - ledger存在時: re-reviewプロンプト（review_plan_rereview_prompt.md）を使用
   - ledger未存在時: 初回レビュープロンプト（review_plan_prompt.md）を使用
   - re-review後のledger更新
   - current-phase.md 生成（phase = "plan-fix-review"）
   - autofix モード対応: `autofix` 引数でhandoffスキップ

### Phase D: 周辺ファイル更新

1. **specflow-filter-diff 改修**: 除外パターンに `*/review-ledger-spec.json`, `*/review-ledger-plan.json`, `*/review-ledger-spec.json.bak`, `*/review-ledger-plan.json.bak` を追加
2. **specflow.approve.md 改修**: 
   - approval-summary生成時に `review-ledger-spec.json` と `review-ledger-plan.json` も読み込み
   - Review Loop Summary セクションをphase別に拡張
   - quality gate checkで全phaseのledgerを確認
3. **specflow-install 改修**: 新規ファイル（dashboard slash command, re-reviewプロンプト2つ）のインストール追加

### Phase E: Dashboard可視化コマンド

1. **specflow.dashboard.md 新規作成**:
   - specs/配下の全featureディレクトリを探索
   - 各featureの `review-ledger-spec.json`, `review-ledger-plan.json`, `review-ledger.json` を読み込み
   - 集計ルール（data-model.mdの表示値マッピング参照）に基づいてテーブル生成
   - CLIテーブルとしてターミナルに表示
   - specs/review-dashboard.md に保存

### Phase F: CLAUDE.md更新

1. CLAUDE.md のspecflow slash commandsテーブルに `/specflow.dashboard` を追加
2. Active Technologies セクションに本featureの技術情報を追加
