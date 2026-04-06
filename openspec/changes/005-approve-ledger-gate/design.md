<!-- Historical Migration
  Source: specs/005-approve-ledger-gate/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: approve-ledger-gate

**Branch**: `005-approve-ledger-gate` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-approve-ledger-gate/spec.md`

## Summary

approve フェーズ（`global/specflow.approve.md`）の先頭に review-ledger.json を読み込む quality gate を追加する。top-level `status` フィールドが `has_open_high` の場合は commit/push/PR をブロックし、未解決 high finding の概要を表示する。`all_resolved` または `in_progress` の場合は通過させる。

## Technical Context

**Language/Version**: Markdown (Claude Code slash command) + Bash shell scripts
**Primary Dependencies**: Claude Code CLI, specflow (.specify/), GitHub CLI (gh)
**Storage**: JSON ファイル (`specs/<feature>/review-ledger.json`)
**Testing**: 手動テスト（slash command の動作確認）
**Target Platform**: macOS / Linux ターミナル
**Project Type**: CLI ツール（Claude Code slash commands）
**Performance Goals**: N/A（対話型コマンド）
**Constraints**: `.specflow/` 配下のファイルは変更不可（read-only）
**Scale/Scope**: 単一ファイル変更（`global/specflow.approve.md`）

## Constitution Check

*GATE: Constitution is not configured (template only). No gates to check.*

## Project Structure

### Documentation (this feature)

```text
specs/005-approve-ledger-gate/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── spec.md              # Feature spec
├── checklists/          # Quality checklists
└── tasks.md             # Phase 2 output (by /specflow.tasks)
```

### Source Code (repository root)

```text
global/
└── specflow.approve.md  # 変更対象 — quality gate ロジックを先頭に挿入
```

**Structure Decision**: 変更対象は `global/specflow.approve.md` の 1 ファイルのみ。新規ファイルの追加は不要。

## Implementation Approach

### 変更箇所

`global/specflow.approve.md` のフローの先頭（`## Commit` セクションの前、既存の git status/diff ステップよりも前）に新しい `## Quality Gate` セクションを挿入する。gate 実行に必要な FEATURE_DIR の取得（check-prerequisites.sh）のみ gate 内で行い、git 操作は gate 通過後に初めて実行される。

### Quality Gate アルゴリズム

```
1. check-prerequisites.sh --json --paths-only で FEATURE_DIR を取得
2. LEDGER_PATH = FEATURE_DIR/review-ledger.json
3. if LEDGER_PATH が存在しない → 停止「review-ledger.json が見つかりません。先に impl/fix フェーズで review を実行してください」（FR-002）
4. LEDGER_PATH を読み込み JSON パース
5a. if パース失敗 → 停止「review-ledger.json のパースに失敗しました。ファイルを確認してください」（FR-003a）
5b. if status フィールドなし → 停止「review-ledger.json に status フィールドがありません。ledger の形式を確認してください」（FR-003b）
6. switch (ledger.status):
   - "has_open_high" → 停止、open high finding 一覧表示（FR-004, FR-005, FR-006）
   - "all_resolved" → 通過（FR-004, FR-007）
   - "in_progress" → 通過（FR-004, FR-007）
   - その他 → 停止「不明な ledger status です。ファイルを確認してください」（FR-004, FR-008）
```

### 停止時の表示フォーマット

```markdown
## Quality Gate: BLOCKED

review-ledger.json に未解決の high finding があります。
`/specflow.fix` で修正してから再度 `/specflow.approve` を実行してください。

| ID | Title | Status | Detail |
|----|-------|--------|--------|
| R1-F01 | ... | new | ... |
| R1-F02 | ... | open | ... |
```

### 挿入位置

現在の `specflow.approve.md` の構造:
1. ステップ 1-2: git status / diff 表示
2. ステップ 3: check-prerequisites.sh で spec 読み取り
3. ステップ 4-6: コミットメッセージ生成 & コミット実行

**変更後の構造:**
1. **新 `## Quality Gate` セクション** — approve フローの最初のステップとして挿入
   - check-prerequisites.sh --json --paths-only で FEATURE_DIR を取得
   - review-ledger.json の読み込みと判定
   - 停止 or 通過
2. `## Commit` セクション — gate 通過後に既存フロー（git status/diff → spec 読み取り → コミット）を実行

これにより、未解決 high がある場合は git status/diff すら実行されず、approve が即座に停止する。

## Complexity Tracking

> No violations. Single-file change with straightforward conditional logic.
