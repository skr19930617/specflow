# Feature Specification: Auto-fix Loop Confirmation Prompt

**Feature Branch**: `012-autofix-loop-prompt`
**Created**: 2026-04-05
**Status**: Draft
**Input**: GitHub Issue #30 — auto-fixループが始まらない: ユーザーにauto-fixを始めるかボタンで聞いて始めるようにする

## Clarifications

### Session 2026-04-05

- Q: 「スキップする」選択後の handoff 内容は？ → A: 既存 Case B の handoff をそのまま使用する
- Q: 確認プロンプトでの finding 詳細表示レベルは？ → A: 件数とタイトル一覧のみ（説明文は含めない）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-fix Loop 開始前の確認プロンプト (Priority: P1)

impl review 完了後に actionable high findings がある場合、ユーザーに auto-fix loop を始めるかどうかをボタンで確認する。ユーザーが「開始する」を選択した場合のみ、auto-fix loop が実行される。

**Why this priority**: 現状では auto-fix loop が自動的に開始されるが、ユーザーが認識しないまま修正が行われる問題がある。ユーザーに制御権を渡すことが最優先。

**Independent Test**: impl review で high findings がある状態を作り、確認プロンプトが表示されること、「開始する」を選んだ場合のみループが実行されることを確認できる。

**Acceptance Scenarios**:

1. **Given** impl review 完了後に actionable high findings が存在する, **When** review 結果が表示される, **Then** auto-fix loop を開始するかどうかの確認ボタンが表示される
2. **Given** 確認プロンプトが表示されている, **When** ユーザーが「開始する」を選択する, **Then** auto-fix loop が通常通り実行される
3. **Given** 確認プロンプトが表示されている, **When** ユーザーが「スキップする」を選択する, **Then** auto-fix loop は実行されず、通常の handoff オプションが表示される

---

### User Story 2 - 確認プロンプトでの情報表示 (Priority: P2)

確認プロンプトには、ユーザーが判断するための情報（actionable high findings の件数と概要）が含まれる。

**Why this priority**: ユーザーが開始するか判断するために、何件の指摘があるかを知る必要がある。

**Independent Test**: high findings が複数ある状態で、確認プロンプトに件数と概要が表示されることを確認できる。

**Acceptance Scenarios**:

1. **Given** actionable high findings が 3 件ある, **When** 確認プロンプトが表示される, **Then** 「3 件の high findings があります」といった件数情報が表示される
2. **Given** actionable high findings が存在する, **When** 確認プロンプトが表示される, **Then** 各 finding のタイトルが一覧として表示される

---

### User Story 3 - Auto-fix 不要時はプロンプトなし (Priority: P2)

actionable high findings が 0 件の場合（全て resolved / accepted_risk / ignored の場合を含む）、確認プロンプトは表示されず、通常の handoff に直接進む。

**Why this priority**: 不要な確認ステップでワークフローを中断しないことが重要。

**Independent Test**: high findings が 0 件の状態で、確認プロンプトが表示されないことを確認できる。

**Acceptance Scenarios**:

1. **Given** actionable high findings が 0 件, **When** impl review が完了する, **Then** 確認プロンプトは表示されず、直接 handoff オプションが表示される

### Edge Cases

- auto-fix loop が MAX_AUTOFIX_ROUNDS に達した場合や divergence が検出された場合の動作は既存のロジックに従う（確認プロンプトは開始前の 1 回のみ）
- ユーザーが「スキップする」を選択後に手動で `/specflow.fix` を実行することは引き続き可能

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: impl review 完了後、既存の auto-fix loop 開始条件（`severity == "high"` かつ `status ∈ {"new", "open"}` の finding が 1 件以上）を満たす場合、auto-fix loop 開始前にユーザー確認プロンプトを表示する MUST。この条件は既存 `specflow.impl_review` の Case A 判定条件と同一であり、確認プロンプトは既存の自動開始を置き換える形で挿入される
- **FR-002**: 確認プロンプトは選択式 UI を使用し、「開始する」「スキップする」のボタン選択肢を提供する MUST
- **FR-003**: 確認プロンプトには actionable high findings の件数と各 finding のタイトル一覧を含める MUST
- **FR-004**: ユーザーが「開始する」を選択した場合、既存の auto-fix loop ロジックをそのまま実行する MUST
- **FR-005**: ユーザーが「スキップする」を選択した場合、auto-fix loop を実行せず、既存 Case B の handoff オプションを表示する MUST
- **FR-006**: actionable high findings が 0 件の場合、確認プロンプトを表示せずに既存フローに従う MUST

### Key Entities

- **Confirmation Prompt**: auto-fix loop 開始前にユーザーに表示される確認 UI。件数・一覧・開始/スキップボタンで構成。
- **Actionable High Findings**: review-ledger.json 内の `severity == "high"` かつ `status ∈ {"new", "open"}` の finding。auto-fix 対象の判定基準。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: actionable high findings がある場合、100% の確率で auto-fix loop 開始前に確認プロンプトが表示される
- **SC-002**: ユーザーが「スキップする」を選択した場合、auto-fix loop が一切実行されない
- **SC-003**: ユーザーが「開始する」を選択した場合、既存の auto-fix loop が正常に動作する
- **SC-004**: actionable high findings が 0 件の場合、不要な確認ステップなしに handoff に到達する

## Assumptions

- 確認プロンプトの発火条件は既存 `specflow.impl_review` の Case A 判定条件（`actionable_high_count > 0`）と完全に同一。現行コードで auto-fix loop が開始される条件以外で確認プロンプトが表示されることはない
- 確認プロンプトはプロジェクト標準の選択式 UI（ボタン）で実装する
- 既存の auto-fix loop ロジック（divergence detection, max rounds, severity scoring）は変更しない
- `accepted_risk`/`ignored` ステータスの扱いは既存ルールに従う（auto-fix 対象外、ループ開始判定に含めない）
