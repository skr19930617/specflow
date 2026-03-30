# Feature Specification: Codex impl re-review の出力を resolved / still_open / new 分類に対応させる

**Feature Branch**: `003-impl-rereview-classify`
**Created**: 2026-03-30
**Status**: Draft
**Input**: GitHub Issue #2 — Codex impl re-review の出力を resolved / still_open / new 分類に対応させる

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Re-review で前回 findings の解決状況を確認する (Priority: P1)

開発者が impl の修正後に re-review を実行する。Codex は前回の findings（ledger 情報）を入力として受け取り、各 finding が resolved / still_open かを分類して返す。開発者は review loop の進捗を一目で把握できる。

**Why this priority**: review loop の状態追跡が本機能の核心であり、前回 findings との差分が分からなければ修正の効果を測定できない。

**Independent Test**: re-review 実行時に `resolved_previous_findings` と `still_open_previous_findings` が正しく分類されて返ることを確認する。

**Acceptance Scenarios**:

1. **Given** 前回レビューで finding F1, F2 が報告されている, **When** F1 を修正して re-review を実行する, **Then** F1 が `resolved_previous_findings` に、F2 が `still_open_previous_findings` に分類される
2. **Given** 前回レビューで finding が報告されている, **When** すべて修正して re-review を実行する, **Then** すべてが `resolved_previous_findings` に分類され、`still_open_previous_findings` は空になる

---

### User Story 2 - Re-review で新規 findings を検出する (Priority: P1)

開発者が修正を行った結果、新たな問題が発生した場合、Codex の re-review がそれを `new_findings` として検出する。broad review は維持されるため、前回指摘以外の新しい問題も拾われる。

**Why this priority**: closure-only review ではなく broad review を維持し、新しい high severity finding を検出できることが本機能の重要方針。

**Independent Test**: 修正時に新たな問題を含むコードを re-review し、`new_findings` に新規 finding が含まれることを確認する。

**Acceptance Scenarios**:

1. **Given** 修正コードに新たな問題が含まれている, **When** re-review を実行する, **Then** 新しい finding が `new_findings` として返される（severity, category, file, title, detail を含む）
2. **Given** 修正コードに問題がない, **When** re-review を実行する, **Then** `new_findings` は空配列で返される

---

### User Story 3 - 初回レビューとの互換性維持 (Priority: P2)

初回の impl review（前回 ledger 情報がない場合）は、既存の動作を壊さずに従来通りのレビュー結果を返す。re-review 専用の分類フィールドは初回レビューでは不要。

**Why this priority**: 既存フローを壊さないことが前提条件であり、初回レビューの互換性が担保されなければ本機能は導入できない。

**Independent Test**: 初回レビュー（ledger 情報なし）を実行し、従来通りの `decision`, `findings`, `summary` が返ることを確認する。

**Acceptance Scenarios**:

1. **Given** 前回 ledger 情報がない（初回レビュー）, **When** impl review を実行する, **Then** 既存フォーマットでレビュー結果が返され、エラーにならない

---

### Edge Cases

- 前回 ledger に記録された finding が、修正によって部分的にしか解決されていない場合はどうなるか？ → `still_open_previous_findings` として分類し、note に部分修正の状況を記載する
- 前回 ledger が空（findings ゼロ）の状態で re-review を実行した場合 → `resolved_previous_findings` と `still_open_previous_findings` は空配列、新規 findings のみ返す
- 前回 ledger の JSON が破損・不正な場合 → re-review スキーマを維持したまま `resolved_previous_findings` と `still_open_previous_findings` を空配列とし、全 findings を `new_findings` として扱う。`ledger_error: true` を出力に含め、呼び出し側が ledger 異常を検知できるようにする。初回レビュースキーマへのフォールバックはしない

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Re-review 用の専用 prompt ファイル（例: `review_impl_rereview_prompt.txt`）を新規作成し、前回 ledger 情報を入力として渡せること。既存の `review_impl_prompt.txt` は変更しない
- **FR-002**: Re-review の出力に `resolved_previous_findings` フィールド（配列）が含まれること。各要素は `id`（必須）と `note`（必須）を持つ。前回 findings のうち解決済みのものをリストする
- **FR-003**: Re-review の出力に `still_open_previous_findings` フィールド（配列）が含まれること。各要素は `id`（必須）、`severity`（必須）、`note`（必須）を持つ。前回 findings のうち未解決のものをリストする
- **FR-009**: 前回 ledger に含まれるすべての finding は、`resolved_previous_findings` または `still_open_previous_findings` のいずれか一方に必ず 1 回だけ分類されること（排他的・網羅的）
- **FR-004**: Re-review の出力に `new_findings` フィールドが含まれ、新たに検出された findings がリストされること
- **FR-005**: `new_findings` の各 finding には `id`, `severity`, `category`, `file`, `title`, `detail` が含まれること
- **FR-006**: Re-review でも broad review を維持し、新規 high severity finding を検出できること（closure-only review にしないこと）
- **FR-007**: 初回レビュー（前回 ledger 情報なし）の出力フォーマットと動作に後方互換性を維持すること
- **FR-008**: Spec review prompt と plan review prompt は変更しないこと
- **FR-010**: Previous finding の同一性判定は ledger 内の `id` をキーとする。Codex は前回 ledger に含まれる各 finding の `id` に対して resolved / still_open を判定する
- **FR-011**: 比較対象は「直前のレビューの findings のみ」とする。複数回分の ledger 履歴がある場合でも、最新の findings セットのみを入力とする
- **FR-012**: Finding の split（1 件が複数件に分裂）や merge（複数件が 1 件に統合）が発生した場合、元の finding は `still_open_previous_findings` として扱い note に split/merge の状況を記載する。分裂・統合後の finding は `new_findings` として新規 ID を付与する
- **FR-013**: Re-review と初回レビューの切替条件: 前回 ledger が入力として明示的に渡された場合は re-review prompt を使用する。ledger が未指定の場合は初回レビュー prompt を使用する。ledger が指定されたが JSON が不正な場合は re-review スキーマで空分類 + `ledger_error` フラグを true にして返す
- **FR-014**: Re-review 出力に `ledger_error` フィールド（boolean、デフォルト false）を含める。ledger JSON が不正・破損していた場合に true となり、呼び出し側が ledger 異常を検知できるようにする
- **FR-015**: `still_open_previous_findings` の `severity` は今回の re-review 時に Codex が再評価した現在の severity とする（前回値ではない）。修正の部分適用等で severity が変化する可能性があるため、最新のリスク評価を反映する
- **FR-016**: Re-review 完了後、次回 re-review のために ledger を更新する。更新後の ledger は以下を含むこと:
  - `max_finding_id`: 全レビューを通じて発行された最大の finding ID 番号（resolved 済みも含む）。次回の新規 ID はここから +1 で採番する
  - `findings`: 次回の比較対象となる findings 配列。`still_open_previous_findings` のフル属性（id, severity, category, file, title, detail, note）と `new_findings` のフル属性を統合したもの。`resolved_previous_findings` は除外する
  - `ledger_error` が true の場合、ledger 更新時に `max_finding_id` は今回の `new_findings` の最大 ID とし、`findings` は `new_findings` をそのまま使用する
- **FR-017**: Ledger の `findings` 配列の各要素はフル属性（id, severity, category, file, title, detail）を保持すること。`still_open_previous_findings` が re-review 出力ではフル属性を持たない場合でも、ledger 更新時に前回 ledger から欠損フィールドを補完して保存すること
- **FR-018**: Re-review の `decision` は既存 impl review と同じ decision policy を使用し、全 currently open findings（`still_open_previous_findings` + `new_findings`）に基づいて判定すること。new_findings のみではなく、未解決の前回 findings も decision に影響する
- **FR-019**: 初回レビュー完了後に ledger を初期化すること（本 feature のスコープ内）。初回レビューの出力から ledger を作成し、以下を含む:
  - `max_finding_id`: 初回レビューで発行された findings の最大 ID 番号。findings がゼロの場合は 0
  - `findings`: 初回レビューの全 findings（フル属性: id, severity, category, file, title, detail）
  - 初回レビュー後の ledger 作成は、呼び出し側（specflow スクリプト等）の責務とする。Codex の初回レビュー出力フォーマット自体は変更しない（FR-007 を維持）
- **FR-020**: `max_finding_id` が ledger に存在しない場合、ledger 内の `findings` 配列から最大 ID を導出する。`findings` も空の場合は 0 とする

### Key Entities

- **Finding**: レビューで検出された個別の指摘事項。id, severity, category, file, title, detail を属性として持つ
- **Review Ledger**: 前回レビューの findings を記録した構造化データ。re-review 時の入力として使用される。必須フィールド: `max_finding_id`（integer）、`findings`（Finding 配列、フル属性）。初回レビュー後に呼び出し側が作成し、re-review 後に更新する
- **Re-review Response**: re-review の出力。decision, resolved_previous_findings, still_open_previous_findings, new_findings, summary, ledger_error を含む

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Re-review 実行時に前回 findings のうち修正済みのものが 100% `resolved_previous_findings` に分類される
- **SC-002**: Re-review 実行時に未修正の findings が 100% `still_open_previous_findings` に分類される
- **SC-003**: Re-review で新規の high severity finding が検出可能であること（broad review 維持）
- **SC-004**: 初回レビューの動作が本変更前後で同一であること（後方互換性）

## Clarifications

### Session 2026-03-30

- Q: Re-review 用の prompt は既存ファイル拡張か別ファイル分離か？ → A: 別ファイルとして分離する（例: `review_impl_rereview_prompt.txt`）。初回レビュー prompt は変更しない。
- Q: new_findings の ID 体系は？ → A: Codex が自動採番する（前回の最大 ID + 1 から連番）。prompt に前回の最大 ID を伝える。初回レビューと同一 ID 名前空間を共有する。
- Q: ledger JSON が破損・不正な場合の挙動は？ → A: re-review スキーマを維持し resolved/still_open を空配列、全 findings を new_findings として扱う。`ledger_error: true` を出力に含めて異常を明示する。初回レビューへのフォールバックはしない。
- Q: re-review への切替条件は？ → A: ledger が明示的に渡されたら re-review prompt、未指定なら初回 prompt、指定済みだが JSON 不正なら re-review スキーマで空分類 + ledger_error フラグ。
- Q: still_open の severity は前回値か再評価値か？ → A: 今回の re-review 時に Codex が再評価した現在の severity を使用する。
- Q: post-re-review の ledger 契約は？ → A: ledger に `max_finding_id`（全発行 ID の最大値）と `findings`（still_open + new_findings のフル属性統合、resolved は除外）を保存する。
- Q: re-review の decision は何に基づくか？ → A: 既存 impl review と同じ policy で、全 currently open findings（still_open + new_findings）に基づく。
- Q: 初回レビュー後の ledger 初期化は本 feature のスコープか？ → A: スコープに含める。初回レビュー出力から呼び出し側が ledger を作成する。Codex の初回レビュー出力フォーマットは変更しない。

## Assumptions

- 前回 ledger 情報は `review-ledger.json` 等の構造化ファイルとして利用可能である
- Codex MCP サーバー経由でのレビュー実行フローは既存のものを踏襲する
- Finding の id 体系は全レビューを通じて単一の名前空間で連番（F1, F2, ...）を使用する。初回レビューの findings と re-review の new_findings は同じ ID 空間を共有し、re-review 時は前回 ledger の最大 ID + 1 から採番を続ける。これにより ledger 更新時の ID 衝突を防ぐ
