# Feature Specification: impl fix ループで review-ledger.json を更新する

**Feature Branch**: `004-impl-fix-ledger-update`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "impl fix ループで review-ledger.json を更新する"

## Clarifications

### Session 2026-03-30

- Q: finding の同一性判定方法は？ → A: Codex re-review の出力（resolved/still_open/new の分類）をそのまま信頼し、ledger はその結果を記録するだけとする。独自のマッチングロジックは持たない。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 初回 impl review 結果を ledger に保存する (Priority: P1)

開発者が `/specflow.impl` を実行して Codex impl review を完了した後、review の findings が自動的に `review-ledger.json` に保存される。これにより、レビュー結果の履歴管理が開始される。

**Why this priority**: ledger への初回書き込みがなければ、以降の fix ループでの差分追跡が成り立たない。全体の基盤となる機能。

**Independent Test**: `/specflow.impl` を実行し、review 完了後に `review-ledger.json` が作成され、`current_round` が 1 に設定されていることを確認する。

**Acceptance Scenarios**:

1. **Given** spec と plan/tasks が完成している状態, **When** `/specflow.impl` を実行し Codex impl review が完了する, **Then** `review-ledger.json` が作成され、findings が保存され、`current_round` が 1 に設定される
2. **Given** review-ledger.json がまだ存在しない状態, **When** 初回の impl review 結果が返される, **Then** ledger ファイルが新規作成され、全 findings が記録される

---

### User Story 2 - fix 後の re-review 結果を ledger に反映する (Priority: P1)

開発者が `/specflow.fix` を実行して re-review を完了した後、結果の resolved_previous_findings / still_open_previous_findings / new_findings が ledger に反映される。`current_round` がインクリメントされ、`round_summaries` が更新される。

**Why this priority**: fix ループの状態を追跡する中核機能。初回保存と同等に重要。

**Independent Test**: 初回 review 後に `/specflow.fix` を実行し、ledger の `current_round` がインクリメントされ、resolved/still_open/new の各カテゴリが正しく反映されていることを確認する。

**Acceptance Scenarios**:

1. **Given** `current_round` が 1 の ledger が存在する状態, **When** `/specflow.fix` で re-review が完了する, **Then** `current_round` が 2 にインクリメントされ、resolved/still_open/new findings が ledger に反映される
2. **Given** 複数回の fix ループを経た ledger が存在する状態, **When** 再度 `/specflow.fix` を実行する, **Then** `current_round` がさらにインクリメントされ、累積的に追跡される

---

### User Story 3 - round ごとのサマリーで loop 状態を追える (Priority: P2)

開発者が `review-ledger.json` を閲覧するだけで、各 round の open high / resolved high / new high の数が把握でき、fix ループの進捗状況が一目で分かる。

**Why this priority**: ledger の保存・更新が前提にあり、その上に成り立つ可視化機能。

**Independent Test**: 複数 round の fix ループ実行後、`review-ledger.json` の `round_summaries` を読み、各 round の severity 別カウントが正確に記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** 3 round の fix ループを完了した状態, **When** `review-ledger.json` の `round_summaries` を確認する, **Then** 各 round の open_high / resolved_high / new_high 数が正確に記録されている
2. **Given** round 2 で全ての high severity findings が resolved された状態, **When** ledger を確認する, **Then** round 2 の summary で resolved_high が正しくカウントされ、open_high が 0 になっている

---

### Edge Cases

- 初回 review で findings が 0 件の場合、ledger は空の findings 配列で作成される
- Codex re-review レスポンスに resolved/still_open/new のいずれかが欠けている場合、該当カテゴリを空配列として扱う
- fix 中に新たな findings が発生しつつ、既存の findings も resolve された場合、両方が正しく反映される
- ledger ファイルが破損または不正な JSON の場合、エラーを報告しフローを停止する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/specflow.impl` の完了時に、Codex review の findings を `review-ledger.json` に保存しなければならない
- **FR-002**: 初回 review 時に `current_round` を 1 に設定しなければならない
- **FR-003**: `/specflow.fix` の re-review 完了時に、resolved_previous_findings / still_open_previous_findings / new_findings を ledger に反映しなければならない
- **FR-004**: re-review のたびに `current_round` をインクリメントしなければならない
- **FR-005**: 各 round の `round_summaries` に severity 別の open / resolved / new カウントを記録しなければならない
- **FR-006**: `review-ledger.json` のみで fix ループの全状態を追跡できなければならない
- **FR-007**: 既存の `specflow.impl.md` および `specflow.fix.md` のスラッシュコマンドに ledger 更新ロジックを統合しなければならない

### Key Entities

- **review-ledger.json**: fix ループ全体の状態を管理する JSON ファイル。current_round、findings の履歴、round_summaries を保持する
- **finding**: Codex review が検出した個別の指摘事項。severity（high/medium/low）とステータス（open/resolved）を持つ
- **round_summary**: 各 round における severity 別の open / resolved / new カウントの集計

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: impl review 1 回目の完了後、`review-ledger.json` に全 findings が保存され `current_round` が 1 である
- **SC-002**: fix 後の re-review 完了後、resolved/still_open/new findings が正しく分類されて ledger に反映される
- **SC-003**: 各 round の `round_summaries` に severity 別（high/medium/low）の open / resolved / new カウントが正確に記録される
- **SC-004**: `review-ledger.json` のみを参照して、任意の時点での fix ループの進捗状況を把握できる

## Assumptions

- `review-ledger.json` のスキーマは既存の #2 で定義されたものを使用する
- Codex re-review の出力は `resolved_previous_findings` / `still_open_previous_findings` / `new_findings` フィールドを含む JSON 形式である（#2 で導入済み）。ledger はこの分類結果をそのまま信頼し、独自のマッチングロジックは持たない
- 自動ループ化（人手を介さない連続 fix）はスコープ外
- approve/reject の制御変更はスコープ外
