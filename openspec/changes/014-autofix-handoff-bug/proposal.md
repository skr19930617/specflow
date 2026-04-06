<!-- Historical Migration
  Source: specs/014-autofix-handoff-bug/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: Auto-fix Handoff Bug Fix

**Feature Branch**: `014-autofix-handoff-bug`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: GitHub Issue #33: "auto-fixのバグ — handoffをスキップすると止まる。スキップしないようにしてほしい。常にユーザーにauto-fixするかの確認を出すようにしてほしい。またaskquestionが煩雑なのでseverityと件数だけでタイトルなしで表記してほしい"

## Clarifications

### Session 2026-04-05

- Q: auto-fix 確認で「スキップ」を選んだ場合の遷移先は？ → A: 手動修正へ誘導（/specflow.fix で修正後に再レビューするフローへ遷移）
- Q: handoff の「スキップ不可」の実現方法は？ → A: handoff を廃止し、auto-fix 確認を AskUserQuestion で直接表示する（スキップ時はデフォルトで手動修正誘導へ進む）
- Q: severity が 0 件のカテゴリは表示するか？ → A: 0 件は非表示、指摘がある severity のみ表示する

## User Scenarios & Testing

### User Story 1 - Handoff 廃止と AskUserQuestion 直接確認 (Priority: P1)

impl review 完了後、従来の handoff ボタンを廃止し、AskUserQuestion で auto-fix 確認を直接表示する。ユーザーが確認をスキップした場合は、デフォルト動作として手動修正誘導（/specflow.fix）へ進む。

**Why this priority**: handoff スキップでワークフロー全体が止まるバグの根本対策。handoff 自体を廃止し、AskUserQuestion 直接表示に切り替えることでスキップ時もデフォルト動作で安全に進行する。

**Independent Test**: impl review 後に AskUserQuestion が直接表示され、スキップしてもワークフローが手動修正誘導で継続することを確認する。

**Acceptance Scenarios**:

1. **Given** impl review が完了し指摘事項がある状態, **When** review 結果が表示される, **Then** handoff なしで AskUserQuestion による auto-fix 確認が直接表示される（選択肢:「Auto-fix 実行」「手動修正（/specflow.fix）」の 2 択）
2. **Given** auto-fix 確認が表示された状態, **When** ユーザーが確認を dismiss/スキップ/タイムアウトする, **Then** 「手動修正（/specflow.fix）」を選択したものとして扱い、手動修正誘導メッセージを表示する

---

### User Story 2 - 常時 Auto-fix 確認プロンプト (Priority: P1)

impl review で指摘事項がある場合、handoff の有無にかかわらず、常にユーザーに auto-fix を実行するかの確認を表示する。ユーザーはワンクリックで auto-fix の実行・スキップを選択できる。

**Why this priority**: handoff をスキップ不可にすることと合わせて、確実にユーザーの意思確認を行うフローが必要。P1 として Story 1 と同時に対応する。

**Independent Test**: impl review 完了後、常に auto-fix 確認プロンプトが表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** impl review が完了し CRITICAL/HIGH の指摘がある, **When** review 結果が表示される, **Then** 「Auto-fix を実行しますか？」の確認プロンプトが必ず表示される
2. **Given** impl review が完了し指摘がすべて LOW/MEDIUM, **When** review 結果が表示される, **Then** 同様に auto-fix 確認プロンプトが表示される
3. **Given** impl review が完了し指摘がゼロ, **When** review 結果が表示される, **Then** auto-fix 確認は表示されず、承認フローに進む（「常に確認」は指摘 1 件以上の場合に適用）

---

### User Story 3 - AskQuestion 表示の簡略化 (Priority: P2)

auto-fix 確認時の AskUserQuestion 表示を簡略化し、severity と件数のみを表示する。個別の指摘タイトルは表示しない。

**Why this priority**: UX 改善であり、機能的な修正ではない。P1 のバグ修正後に対応すべき。

**Independent Test**: auto-fix 確認プロンプトの表示が severity 別件数のみで、タイトルが含まれないことを確認する。

**Acceptance Scenarios**:

1. **Given** impl review で CRITICAL: 2件、HIGH: 3件の指摘がある, **When** auto-fix 確認プロンプトが表示される, **Then** 「CRITICAL: 2, HIGH: 3」のように severity と件数のみが表示され、個別タイトルは表示されない
2. **Given** impl review で複数 severity の指摘がある, **When** auto-fix 確認プロンプトが表示される, **Then** severity は重要度順（CRITICAL → HIGH → MEDIUM → LOW）に並ぶ

---

### Edge Cases

- handoff ボタンがレンダリングされる前にユーザーがメッセージを送信した場合 → auto-fix 確認を優先表示する
- 指摘が 0 件の場合 → auto-fix 確認は表示せず承認フローに進む
- review-ledger.json が存在しない場合 → エラーメッセージを表示しワークフローを停止する

## Requirements

### Functional Requirements

- **FR-001**: impl review 後の handoff を廃止し、AskUserQuestion で auto-fix 確認を直接表示する
- **FR-002**: AskUserQuestion が dismiss/スキップ/タイムアウトされた場合、「手動修正（/specflow.fix）」を選択したものとして扱い、手動修正誘導へ遷移する
- **FR-003**: auto-fix 確認の AskUserQuestion では、severity 別の件数のみを表示し、個別の指摘タイトルは表示しない
- **FR-004**: severity の表示順は CRITICAL → HIGH → MEDIUM → LOW とし、0 件の severity は非表示とする
- **FR-005**: 指摘が 0 件の場合は auto-fix 確認を表示せず、承認フローへ遷移する。「常に確認を表示する」とは「指摘が 1 件以上ある場合は例外なく表示する」を意味する
- **FR-006**: auto-fix 確認の選択肢は「Auto-fix 実行」「手動修正（/specflow.fix）」の 2 択とする

### Key Entities

- **Review Ledger**: review 結果を管理する JSON ファイル。severity 別の指摘件数を集計するデータソース
- **Auto-fix 確認プロンプト**: AskUserQuestion で表示される auto-fix 実行/手動修正の選択 UI。従来の handoff を置き換える

## Success Criteria

### Measurable Outcomes

- **SC-001**: impl review 後に handoff をスキップしてもワークフローが停止しない（停止率 0%）
- **SC-002**: 指摘事項がある場合、100% の確率で auto-fix 確認プロンプトが表示される
- **SC-003**: auto-fix 確認プロンプトに個別の指摘タイトルが含まれない
- **SC-004**: ユーザーが auto-fix の実行可否を 1 アクションで選択できる
