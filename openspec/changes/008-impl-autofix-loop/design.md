<!-- Historical Migration
  Source: specs/008-impl-autofix-loop/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: impl フェーズ auto-fix loop

**Branch**: `008-impl-autofix-loop` | **Date**: 2026-04-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-impl-autofix-loop/spec.md`

## Summary

impl/fix フェーズで unresolved high finding が残る限り、自動的に fix → re-review を最大 N ラウンド（デフォルト 4、設定可能）繰り返す auto-fix loop を導入する。specflow.impl.md のハンドオフセクションにループ制御ロジックを追加し、既存の specflow.fix を各ラウンドで呼び出す。発散検知（new high 増加、同種再発、quality gate 悪化）で安全に停止する。

## Technical Context

**Language/Version**: Markdown (Claude Code slash command), Bash (config.env)
**Primary Dependencies**: specflow.impl.md, specflow.fix.md, review-ledger.json
**Storage**: File-based (review-ledger.json — 既存スキーマ変更なし)
**Testing**: 手動統合テスト（specflow サイクルの実行による検証）
**Target Platform**: Claude Code CLI
**Project Type**: CLI slash command (Markdown instruction files)
**Constraints**: review-ledger.json の既存スキーマに変更を加えない、specflow.fix.md は変更しない

## Constitution Check

*Constitution is a template (not filled in). No gate violations.*

## Project Structure

### Documentation (this feature)

```text
specs/008-impl-autofix-loop/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-contract.md  # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
global/
├── specflow.impl.md     # ★ Modified: auto-fix loop エントリポイント + ループロジック追加
└── specflow.fix.md      # Unchanged: ループの各ラウンドで呼び出し

.specflow/
└── config.env           # ★ SPECFLOW_MAX_AUTOFIX_ROUNDS の設定例をコメントで追加
```

**Structure Decision**: 既存の global/ ディレクトリ内のファイルを修正。新しいファイルは追加しない。

## Implementation Design

### 1. specflow.impl.md の変更箇所

#### 1a. Prerequisites に MAX_ROUNDS の読み込み追加

`source .specflow/config.env` の後に、`SPECFLOW_MAX_AUTOFIX_ROUNDS` の読み込みとバリデーションロジックを追加:
- 未設定 or 範囲外（1〜10） → デフォルト 4

#### 1b. Handoff セクションの変更

現在のハンドオフ（AskUserQuestion で "Approve & Commit" / "Fix All" / "Reject"）を以下に変更:

**ループ開始条件**: ledger の `status` が `"has_open_high"`

**ループ前の基準スナップショット（round 0 baseline）**:
ループ開始前に impl レビュー直後の review-ledger.json を読み、以下を保存する:
- `baseline_score`: 全 unresolved findings の severity 重み付けスコア（`Σ weight(f.severity) for f where f.status ∉ {"resolved"}`、high=3, medium=2, low=1）
- `baseline_new_high_count`: `round_summaries` 末尾の `by_severity.high.new` の値（初回 impl review の結果）
- `baseline_resolved_high_titles`: `findings[]` 内の `status == "resolved"` かつ `severity == "high"` の `title` 一覧（空の場合あり）
これらが以降のラウンドでの比較基準（round 0 baseline）となる。

**ループ本体**:
```
WHILE unresolved_high > 0 AND round < max_rounds AND NOT divergence_detected:
  1. Display round progress header
  2. Call Skill(skill: "specflow.fix")
  3. Read updated review-ledger.json
  4. Run ALL stop condition checks (優先順位順):
     a. unresolved high == 0 → SUCCESS stop
     b. same-type recurrence check → DIVERGENCE stop
     c. quality gate score comparison → DIVERGENCE stop
     d. new high count comparison (round 2+) → DIVERGENCE stop
     e. round >= max_rounds → MAX_ROUNDS stop
  5. Update tracking variables for next round:
     - previous_score = current_score
     - previous_new_high_count = current_new_high_count
     - previous_resolved_high_titles = current round's resolved high titles
```

**停止条件の優先順位**: success > divergence(再発) > divergence(quality gate) > divergence(new high) > max_rounds

**ループ後のハンドオフ**:
- 成功（high = 0）: "Approve & Commit" / "Reject"
- 停止（high > 0）: "Fix All (manual)" / "Approve & Commit" / "Reject"

#### 1c. 発散検知ロジック（inline）

**照合ルール（FR-009 準拠）**:
- **Finding 同一性**: `findings[].title` の完全一致（`id` フィールドは使用しない）
- **同種判定**: `findings[].title` の部分文字列包含（case-insensitive）。具体的には `lowercase(title_A).includes(lowercase(title_B))` または `lowercase(title_B).includes(lowercase(title_A))`
- **解消判定**: `findings[].status == "resolved"` の finding を前ラウンドで解消済みとみなす

ledger 読み込み後に以下を判定:

1. **同種 high 再発**（全ラウンドで有効）:
   - 前ラウンド（or baseline）の `resolved` かつ `severity == "high"` の findings の `title` 一覧を取得
   - 現ラウンドの `status ∈ {"new", "open"}` かつ `severity == "high"` の findings の `title` と**部分文字列比較**（case-insensitive）
   - 1 件でも一致 → 停止

2. **Quality gate 悪化**（全ラウンドで有効）:
   - 現ラウンドの quality gate score を算出: `current_score = Σ weight(f.severity) for f in findings where f.status ∉ {"resolved"}`（weight: high=3, medium=2, low=1）
   - 前ラウンド終了時の score（初回は baseline_score）と比較
   - `current_score > previous_score` → 停止

3. **New high 増加**（round 2+ のみ）:
   - 現ラウンドの `round_summaries` 末尾の `by_severity.high.new` を取得
   - 前ラウンドの `by_severity.high.new` と比較（初回は baseline_new_high_count）
   - 現ラウンド > 前ラウンド → 停止
   - **初回ラウンド**: 比較基準の確立のみ。停止判定は行わない

#### 1d. ラウンド進行状況表示

各ラウンド完了後に:
```
Auto-fix Round {n}/{max_rounds}:
  - Unresolved high: {count} ({+/-delta})
  - Severity score: {score} ({+/-delta})
  - New high: {count}
  - Status: continuing / stopped: <reason>
```

### 2. config.env の変更

コメントで設定例を追加:
```bash
# Auto-fix loop の最大ラウンド数（デフォルト: 4、範囲: 1〜10）
# export SPECFLOW_MAX_AUTOFIX_ROUNDS=4
```

### 3. specflow.fix.md — 変更なし

既存のまま。auto-fix loop から Skill ツール経由で呼び出される。

## Risk Assessment

| リスク | 影響度 | 軽減策 |
|--------|--------|--------|
| ループが発散検知をすり抜けて多くのラウンドを消費 | Medium | 最大ラウンド数のハードキャップ（上限 10） |
| title 部分一致で誤検知（無関係な finding を同種と判定） | Low | title が十分に具体的であることが前提。誤検知時はループが早期停止するだけで安全側 |
| specflow.fix の呼び出しが失敗 | Medium | エラーハンドリング: fix 失敗時はループ停止してユーザーにハンドオフ |
| review-ledger.json の読み込み失敗 | Low | 既存のエラーハンドリング（corrupt recovery）をそのまま利用 |
