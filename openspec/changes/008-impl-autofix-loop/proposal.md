<!-- Historical Migration
  Source: specs/008-impl-autofix-loop/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: impl フェーズ auto-fix loop

**Feature Branch**: `008-impl-autofix-loop`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: User description: "impl フェーズに限定した auto-fix loop を導入する"

## Clarifications

### Session 2026-04-02

- Q: 「同種の high finding」の判定基準は？ → A: title 部分一致（一方の title が他方の title の部分文字列として含まれる場合に同種と判定。大文字小文字は区別しない）
- Q: quality gate スコアの定義は？ → A: severity 重み付けスコア（high=3, medium=2, low=1 の重み付け合計）
- Q: ループ中にユーザーが手動停止できるか？ → A: 手動停止なし（自動判定のみで制御）
- Q: 最大ラウンド数 4 は固定か設定可能か？ → A: Issue の「最大 4」をデフォルト値として採用し、設定変更可能に拡張する（config.env の `SPECFLOW_MAX_AUTOFIX_ROUNDS` で 1〜10 の範囲でカスタマイズ可能、デフォルト 4）。Issue の受け入れ条件「最大 4 ラウンド」はデフォルト設定での動作を指す。
- Q: 発散検知の停止閾値は？ → A: 1 回の悪化で即停止（Issue の「増え続ける」「再発し続ける」は発散傾向を指し、安全側に倒して 1 回の悪化検知で停止する）

## Assumptions & Design Decisions

以下は Issue body の表現を意図的に具体化・拡張した設計判断であり、clarify セッションでユーザーが承認済み:

1. **最大ラウンド数**: Issue は「最大 4」と記載しているが、これをデフォルト値 4 として採用し、config.env で 1〜10 の範囲で変更可能に拡張する。Issue の受け入れ条件「最大 4 ラウンドまで自動継続」はデフォルト設定での動作検証を指す。4 を超える値（5〜10）の設定も許容する — ユーザーが明示的に選択した場合、より多くの自動修正ラウンドを試行できる。
2. **発散停止閾値**: Issue は「増え続ける」「再発し続ける」と記載しているが、安全側に倒す設計として 1 回の悪化検知で即停止する。これはユーザーが clarify で承認した判断。理由: 最大ラウンド数が少ない（デフォルト 4）ため、2 ラウンド連続を待つと発散検知が間に合わないリスクがある。
3. **ラウンド間 finding 照合**: review-ledger.json の既存スキーマにある `title` フィールド（文字列）を照合キーとして使用する。finding の同一性は `title` 完全一致、同種判定は `title` 部分文字列包含（大文字小文字区別なし）で行う。`id` フィールドはラウンドごとに再採番される可能性があるため照合には使用しない。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 高重大 finding の自動修正ループ (Priority: P1)

開発者が `/specflow.impl` を実行して実装レビューを受けた後、unresolved high severity の finding が残っている場合、手動で「Fix All」を選択しなくても自動的に fix → re-review のサイクルが継続される。開発者は自動修正が完了するまで待つだけでよい。

**Why this priority**: 最も基本的なユースケース。毎回の手動選択を省き、高重大 finding を確実に解消することが本機能の核心。

**Independent Test**: impl フェーズで unresolved high が存在する状態から auto-fix loop を開始し、high が 0 になるまで自動継続されることを確認する。

**Acceptance Scenarios**:

1. **Given** impl レビュー後に unresolved high が 1 件以上ある, **When** auto-fix loop が有効, **Then** 自動的に fix → re-review が実行される
2. **Given** auto-fix loop の途中で unresolved high が 0 になった, **When** re-review が完了, **Then** ループが停止し成功を報告する
3. **Given** unresolved high が 0 の状態でレビューが完了, **When** auto-fix loop の判定が行われる, **Then** ループは開始されず通常のハンドオフに進む

---

### User Story 2 - 最大ラウンド数での安全停止 (Priority: P1)

auto-fix loop が最大ラウンド数（デフォルト 4、設定可能）に達した場合、ループが停止し、残りの finding を人間が判断できるよう制御がユーザーに返される。

**Why this priority**: 無限ループ防止はシステムの安全性に直結する。P1 と同等の重要度。

**Independent Test**: 意図的に解消できない high finding を用意し、4 ラウンド後にループが停止しユーザーへハンドオフされることを確認する。

**Acceptance Scenarios**:

1. **Given** auto-fix loop がラウンド 4 に到達, **When** unresolved high がまだ残っている, **Then** ループが停止し「最大ラウンド到達」を報告してユーザーにハンドオフする
2. **Given** ラウンド 3 で high が解消された, **When** re-review が完了, **Then** ラウンド 4 には進まず成功で停止する

---

### User Story 3 - 発散検知による早期停止 (Priority: P2)

auto-fix loop の途中で状況が悪化している（new high が増加、同種 high が再発、quality gate スコアが悪化）場合、最大ラウンドを待たずにループを停止し、ユーザーに状況を報告する。

**Why this priority**: 無駄なラウンドの消費を防ぎ、人間の判断が必要な状況を早期に検知する。

**Independent Test**: fix 後に new high が増えるシナリオで、次のラウンドに進まず停止することを確認する。

**Acceptance Scenarios**:

1. **Given** ラウンド 2 以降で、当該ラウンドの new high 件数（前ラウンド終了時の ledger に title 完全一致で存在しなかった high）が前ラウンドの new high 件数より多い, **When** 次ラウンド開始前の発散検知, **Then** 即停止し「new high が増加傾向」を報告（初回ラウンドでは比較基準の確立のみで停止しない）
2. **Given** 前ラウンドで resolved にした high と title 部分一致（部分文字列関係、大文字小文字区別なし）する high が 1 件でも当該ラウンドで unresolved として再出現, **When** 次ラウンド開始前の発散検知, **Then** 即停止し「同種 finding の再発」を報告
3. **Given** 全 unresolved finding の severity 重み付けスコア（high=3, medium=2, low=1）合計が前ラウンド終了時（初回は impl レビュー直後）より増加, **When** 次ラウンド開始前の発散検知, **Then** 即停止し「quality gate 悪化」を報告

---

### User Story 4 - ループ進行状況の可視化 (Priority: P3)

auto-fix loop の各ラウンドで、現在のラウンド番号、残りの unresolved high 数、前ラウンドからの変化がユーザーに表示される。

**Why this priority**: 自動ループ中もユーザーが進行状況を把握でき、安心感を提供する。

**Independent Test**: auto-fix loop 実行中に各ラウンドのサマリーが表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** auto-fix loop がラウンド N を完了, **When** 結果が表示される, **Then** ラウンド番号、unresolved high 数、前ラウンドからの増減が表示される

---

### Edge Cases

- ラウンド 1 の fix で新しい high が大量に発生した場合はどうなるか？ → quality gate 悪化（重み付けスコア増加）で即停止。new high 増加ルールは初回ラウンドでは比較基準確立のみで停止しないが、quality gate 悪化ルールは初回から有効
- review-ledger.json が存在しないまたは破損している場合はどうなるか？ → エラー報告してユーザーにハンドオフ
- fix フェーズ自体が失敗した（ツールエラー等）場合はどうなるか？ → エラー報告してユーザーにハンドオフ
- unresolved high が 0 だが medium/low が残っている場合はどうなるか？ → ループ対象外、通常フローへ

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: auto-fix loop は impl/fix フェーズでのみ動作すること（spec/plan フェーズには影響しない）
- **FR-002**: unresolved high > 0 の場合、自動的に次の fix → re-review ラウンドを開始すること
- **FR-003**: unresolved high = 0 になった時点でループを停止し、成功を報告すること
- **FR-004**: 最大ラウンド数はデフォルト 4 とし、設定ファイル（config.env の `SPECFLOW_MAX_AUTOFIX_ROUNDS`）でユーザーがカスタマイズ可能であること。許容範囲は 1〜10（範囲外の値はデフォルト 4 にフォールバック）。設定されたラウンド数に到達した時点でループを停止すること
- **FR-005**: 以下の発散条件のいずれかを 1 回でも検知した場合、即座にループを停止すること（安全側に倒す設計）。判定は各ラウンドの re-review 完了後、次ラウンド開始前に行う。比較対象は直前のラウンド（round N vs round N-1）。初回ラウンド（round 1）の比較基準は auto-fix loop 開始前の review-ledger の状態（impl レビュー直後の状態）とする:
  - **new high 増加**: 当該ラウンドで新たに出現した high finding（前ラウンド終了時の review-ledger に title 完全一致で存在しなかった finding）の件数が、前ラウンドで新たに出現した high の件数より多い場合。初回ラウンドでは、impl レビュー結果に含まれていなかった high finding が 1 件でも出現したら new high 件数 > 0 として扱い、次ラウンドとの比較基準とする（初回ラウンド単独では new high 増加による停止は発生しない）
  - **同種 high 再発**: 前ラウンドで resolved にした high finding と title 部分一致（一方の title が他方の title の部分文字列として含まれる。大文字小文字は区別しない）する high finding が、当該ラウンドで再び unresolved として出現した場合。1 件でも該当すれば停止
  - **quality gate 悪化**: severity 重み付けスコア（全 unresolved finding を対象に high=3, medium=2, low=1 で重み付けした合計値）が前ラウンド終了時より増加した場合。初回ラウンドの比較基準は auto-fix loop 開始前（impl レビュー直後）の重み付けスコア
- **FR-006**: 各ラウンドの結果（ラウンド番号、unresolved high 数、変化量）をユーザーに表示すること
- **FR-007**: ループ停止時は停止理由を明示し、ユーザーにハンドオフすること（ループ中の手動停止機能は提供しない）
- **FR-008**: review-ledger.json を各ラウンドの判定データソースとして使用すること
- **FR-009**: ラウンド間の finding 照合は review-ledger.json の `findings[].title` フィールドを使用すること。finding の同一性判定は `title` 完全一致、同種判定は `title` 部分文字列包含（大文字小文字区別なし）で行う。`findings[].id` はラウンドごとに再採番される可能性があるため照合には使用しない。`findings[].status` が `"resolved"` の finding を前ラウンドで解消済みとみなす

### Key Entities

- **Round**: ループの 1 回分の fix → re-review サイクル。ラウンド番号、開始時の unresolved high 数、終了時の unresolved high 数、停止理由を持つ
- **Divergence Signal**: 発散を示すシグナル。種類（high 増加、再発、quality gate 悪化）と検知ラウンドを持つ
- **review-ledger.json**: 既存のレビュー結果記録ファイル。各 finding は `id`, `title`, `severity`, `status`, `origin_round`, `latest_round` フィールドを持つ。`round_summaries` にラウンドごとの集計（`by_severity` 含む）を保持。auto-fix loop では `title` を照合キー、`severity` を重み付けスコア算出、`status` を解消判定に使用する

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: unresolved high が存在する場合、ユーザーの手動操作なしで fix → re-review が自動継続される
- **SC-002**: 設定された最大ラウンド数（デフォルト 4、config.env で 1〜10 の範囲で変更可能）を超えてループが継続しない
- **SC-003**: 発散条件に該当する場合、次のラウンドに進まず即座に停止する
- **SC-004**: ループ完了時（成功・停止問わず）、ユーザーが次のアクションを選択できるハンドオフが提供される
- **SC-005**: 既存の spec/plan フェーズのワークフローに影響を与えない
