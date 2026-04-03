# Feature Specification: Split Review Commands

**Feature Branch**: `010-split-review-commands`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "specflow.reviewが何のreviewかわからない。spec, plan, implのreviewをそれぞれ分割して適切なhandoffを設定する"

## Clarifications

### Session 2026-04-03

- Q: 新しいレビューコマンドの命名規則は？ → A: `spec_review` / `plan_review` / `impl_review`（fix コマンドと同じアンダースコアパターン）
- Q: 新コマンドの役割はスタンドアロン再レビューのみか、フロー内レビューも置換するか？ → A: フロー内レビューも新コマンドを呼ぶ形に置換する
- Q: 旧 `/specflow.review` コマンドの扱いは？ → A: 完全削除（CLAUDE.md から記載を除去するのみ。コマンドファイルは元々存在しない）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spec レビューの実行 (Priority: P1)

ユーザーが spec を作成・修正した後、`/specflow.spec_review` で spec のみをレビューできる。レビュー結果に基づいて「Plan に進む」「Spec を修正」「中止」の handoff が提示される。このコマンドは `/specflow` フロー内の spec レビューステップからも呼ばれる。

**Why this priority**: spec レビューはワークフローの最初のゲートであり、最も頻繁に使用される。

**Independent Test**: `/specflow.spec_review` を実行し、spec のみがレビューされること、spec フェーズに適した handoff 選択肢が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** spec が作成済みの状態, **When** ユーザーが `/specflow.spec_review` を実行する, **Then** spec の内容のみがレビューされ、結果（APPROVE/REQUEST_CHANGES/BLOCK）が表示される
2. **Given** spec レビューが完了した状態, **When** レビュー結果が表示される, **Then** レビュー結果に関わらず「Plan に進む」「Spec を修正」「中止」の handoff 選択肢が提示される（ユーザーが判断）
3. **Given** `/specflow` フロー内の spec レビューステップ, **When** フローが spec レビューに到達する, **Then** `/specflow.spec_review` と同じレビューロジックが実行される

**Handoff 定義**:

| 選択肢 | ターゲットコマンド | 説明 |
|---------|-------------------|------|
| Plan に進む | `/specflow.plan` | Plan → Tasks を作成しレビュー |
| Spec を修正 | `/specflow.spec_fix` | レビュー指摘に基づいて Spec を修正し再レビュー |
| 中止 | `/specflow.reject` | 変更を破棄して終了 |

全選択肢はレビュー結果（APPROVE/REQUEST_CHANGES/BLOCK）に関わらず常に表示される。次アクションの判断はユーザーに委ねる。

---

### User Story 2 - Plan/Tasks レビューの実行 (Priority: P1)

ユーザーが plan と tasks を作成した後、`/specflow.plan_review` で plan と tasks のみをレビューできる。レビュー後に「実装に進む」「Plan を修正」「中止」の handoff が提示される。このコマンドは `/specflow.plan` フロー内の plan レビューステップからも呼ばれる。

**Why this priority**: plan レビューは実装前の重要なゲートであり、spec レビューと同等に重要。

**Independent Test**: `/specflow.plan_review` を実行し、plan/tasks のみがレビューされること、plan フェーズに適した handoff が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** plan と tasks が作成済みの状態, **When** ユーザーが `/specflow.plan_review` を実行する, **Then** plan と tasks の内容がレビューされ、結果が表示される
2. **Given** plan レビューが完了した状態, **When** レビュー結果が表示される, **Then** レビュー結果に関わらず「実装に進む」「Plan を修正」「中止」の handoff 選択肢が提示される（ユーザーが判断）
3. **Given** `/specflow.plan` フロー内の plan レビューステップ, **When** フローが plan レビューに到達する, **Then** `/specflow.plan_review` と同じレビューロジックが実行される

**Handoff 定義**:

| 選択肢 | ターゲットコマンド | 説明 |
|---------|-------------------|------|
| 実装に進む | `/specflow.impl` | 実装を実行しレビュー |
| Plan を修正 | `/specflow.plan_fix` | レビュー指摘に基づいて Plan を修正し再レビュー |
| 中止 | `/specflow.reject` | 変更を破棄して終了 |

全選択肢はレビュー結果に関わらず常に表示される。

---

### User Story 3 - 実装レビューの実行 (Priority: P1)

ユーザーが実装を完了した後、`/specflow.impl_review` で実装コードのみをレビューできる。レビュー後に「承認」「修正」「却下」の handoff が提示される。このコマンドは `/specflow.impl` フロー内の impl レビューステップからも呼ばれる。

**Why this priority**: 実装レビューは品質保証の最終ゲートであり、approve/reject の判断に直結する。

**Independent Test**: `/specflow.impl_review` を実行し、実装 diff のみがレビューされること、impl フェーズに適した handoff が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** 実装が完了した状態, **When** ユーザーが `/specflow.impl_review` を実行する, **Then** 実装の diff がレビューされ、結果が表示される
2. **Given** impl レビューが完了した状態, **When** レビュー結果が表示される, **Then** 既存の `/specflow.impl` と同じ handoff ロジック（auto-fix loop / 手動ハンドオフ）が実行される
3. **Given** `/specflow.impl` フロー内の impl レビューステップ, **When** フローが impl レビューに到達する, **Then** `/specflow.impl_review` と同じレビューロジックが実行される

**Handoff 定義**（既存の `/specflow.impl` と同一）:

- **auto-fix loop 対象の場合**（unresolved high findings あり）: auto-fix loop → 成功時は「Approve & Commit」「Reject」、停止時は「Fix All (manual)」「Approve & Commit」「Reject」
- **通常の場合**（unresolved high なし）: 「Approve & Commit (`/specflow.approve`)」「Fix All (`/specflow.fix`)」「Reject (`/specflow.reject`)」

**Diff ベースライン**: `git diff` で working tree の変更を取得する。`.specflow/`, `.specify/`, `review-ledger.json`, `current-phase.md` 等のメタファイルは除外する（既存の `/specflow.impl` と同じ除外パターン）。

---

### User Story 4 - 旧 review コマンドの削除 (Priority: P2)

曖昧な `/specflow.review` の記載を CLAUDE.md から完全に削除する。コマンドファイルは元々存在しないため、ドキュメント更新のみ。

**Why this priority**: 新コマンドの導入後に対応できるため、やや優先度を下げる。

**Independent Test**: CLAUDE.md に `/specflow.review` の記載がないこと、新しい3つのレビューコマンドが記載されていることを確認する。

**Acceptance Scenarios**:

1. **Given** 新レビューコマンドが実装済みの状態, **When** CLAUDE.md を確認する, **Then** `/specflow.review` の記載がなく、`/specflow.spec_review`, `/specflow.plan_review`, `/specflow.impl_review` が記載されている

---

### Edge Cases

- spec が未作成の状態で `/specflow.spec_review` を実行した場合、エラーメッセージを表示する
- plan が未作成の状態で `/specflow.plan_review` を実行した場合、エラーメッセージを表示する
- 実装変更がない状態で `/specflow.impl_review` を実行した場合、エラーメッセージを表示する
- review-ledger.json が存在しない場合、新規作成して処理を続行する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/specflow.spec_review` コマンドは spec.md の内容のみを対象にレビューを実行すること
- **FR-002**: `/specflow.plan_review` コマンドは plan.md と tasks.md の内容を対象にレビューを実行すること
- **FR-003**: `/specflow.impl_review` コマンドは `git diff`（working tree 変更、`.specflow/`, `.specify/`, `review-ledger.json`, `current-phase.md` 除外）を対象にレビューを実行すること
- **FR-004**: 各レビューコマンドは、そのフェーズに適した handoff 選択肢を提示すること
- **FR-005**: `/specflow.impl_review` のレビュー結果は review-ledger.json に記録されること（spec/plan レビューは結果表示のみで ledger には記録しない — impl 専用の ledger スキーマとの干渉を防ぐため）
- **FR-006**: `/specflow`、`/specflow.plan`、`/specflow.impl` の各フローコマンド内のレビューステップは、対応する新レビューコマンドのロジックを使用すること
- **FR-007**: 旧 `/specflow.review` の記載を CLAUDE.md から完全に削除すること
- **FR-008**: 各レビューコマンドは、対象成果物が未作成の場合にエラーメッセージを表示すること

### Key Entities

- **Review Command**: レビュー対象フェーズ（spec/plan/impl）、レビュープロンプト、handoff 定義を持つコマンド。コマンド名: `specflow.spec_review`, `specflow.plan_review`, `specflow.impl_review`
- **Handoff**: レビュー完了後にユーザーに提示される次アクションの選択肢。フェーズごとに異なる
- **Review Ledger Entry**: レビュー結果の記録。フェーズ種別（spec/plan/impl）を含む

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ユーザーがレビューコマンド名だけで対象フェーズを判別できる（`spec_review`, `plan_review`, `impl_review`）
- **SC-002**: 各レビューコマンド実行後、そのフェーズに適切な handoff 選択肢のみが提示される
- **SC-003**: review-ledger.json の各エントリからレビューフェーズ（spec/plan/impl）が一意に特定できる
- **SC-004**: フローコマンド（`/specflow`, `/specflow.plan`, `/specflow.impl`）内のレビューステップが新レビューコマンドと同一のロジックを使用している

## Assumptions

- review-ledger.json のスキーマは既存のものを拡張し、フェーズ種別フィールドを追加する
- 新コマンド名は `/specflow.spec_review`, `/specflow.plan_review`, `/specflow.impl_review` とする
- フロー内のレビューステップは新コマンドファイルの内容を参照（Read）する形で置換する
- handoff の選択肢は既存の specflow フローと整合する
