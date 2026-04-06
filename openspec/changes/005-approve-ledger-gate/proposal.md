<!-- Historical Migration
  Source: specs/005-approve-ledger-gate/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: approve フェーズで review-ledger.json を quality gate として使う

**Feature Branch**: `005-approve-ledger-gate`
**Created**: 2026-03-30
**Status**: Draft
**Input**: GitHub Issue #12 — approve フェーズで review-ledger.json を quality gate として使う

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 未解決 high finding がある状態で approve がブロックされる (Priority: P1)

ユーザーが impl/fix フェーズを完了し `/specflow.approve` を実行するが、review-ledger.json に未解決の high finding が残っている。approve フェーズは即座に停止し、未解決の high finding の概要を表示する。

**Why this priority**: 未解決の重大な問題がある状態でコードが commit/push/PR されることを防ぐ最も重要なガード機能。

**Independent Test**: review-ledger.json に `status: has_open_high` を設定し `/specflow.approve` を実行。commit/push/PR が行われず停止メッセージが表示されることを確認。

**Acceptance Scenarios**:

1. **Given** review-ledger.json の status が `has_open_high` である, **When** ユーザーが approve を実行する, **Then** approve は停止し、未解決 high finding の概要が表示される
2. **Given** review-ledger.json に複数の未解決 high finding がある, **When** ユーザーが approve を実行する, **Then** 各 finding のタイトルと概要が一覧で表示される

---

### User Story 2 - 未解決 high がない状態で approve が正常に進む (Priority: P1)

ユーザーが全ての high finding を解決した状態で `/specflow.approve` を実行すると、通常通り commit/push/PR 作成へ進む。

**Why this priority**: quality gate を通過できるケースが正常に動作することは、ワークフロー全体が機能するために不可欠。

**Independent Test**: review-ledger.json の status を `all_resolved` に設定し `/specflow.approve` を実行。commit/push/PR フローが通常通り実行されることを確認。

**Acceptance Scenarios**:

1. **Given** review-ledger.json の status が `all_resolved` である, **When** ユーザーが approve を実行する, **Then** 通常の commit/push/PR フローが実行される
2. **Given** review-ledger.json に未解決 finding があるが high severity がない, **When** ユーザーが approve を実行する, **Then** 通常の commit/push/PR フローが実行される

---

### User Story 3 - review-ledger.json が存在しない場合は停止する (Priority: P2)

ユーザーが review を経ずに approve を実行した場合、review-ledger.json が存在しない。この場合、approve は停止し、先に review（impl または fix フェーズ）を実行するよう促す。

**Why this priority**: review を経ていない実装が approve を通過することを防ぎ、quality gate の意義を担保する。

**Independent Test**: review-ledger.json を削除した状態で `/specflow.approve` を実行。停止メッセージが表示され、commit/push/PR が行われないことを確認。

**Acceptance Scenarios**:

1. **Given** feature ディレクトリに review-ledger.json が存在しない, **When** ユーザーが approve を実行する, **Then** approve は停止し「review-ledger.json が見つかりません。先に impl/fix フェーズで review を実行してください」と表示される

---

### Edge Cases

- review-ledger.json が不正な JSON の場合 → approve を停止し、パースエラーを表示（FR-003a）
- `status` フィールドが欠けている場合 → approve を停止し、status フィールド欠落を表示（FR-003b）
- findings 配列が空かつ status が `all_resolved` の場合 → 通常フローへ進む（FR-004）
- `status` が `in_progress` の場合 → 未解決 high が 0 件（medium/low のみ未解決）であるため、通常フローへ進む（FR-004）
- high finding の status が `accepted_risk` や `ignored` の場合 → FR-005 により blocking、top-level status は `has_open_high` となり approve は停止（FR-004）
- `status` が未知の値の場合 → approve を停止し確認を促す（FR-004、FR-008）
- `status` と `findings` が不整合の場合（例: 手動編集） → `status` を正本として判定。整合性担保は書き込み側の責務（FR-004 注記）
- `findings` が欠落・非配列の場合 → gate 判定は `status` のみで行い、停止時の概要表示をスキップ（FR-006）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: approve 開始時に、対象 feature の `specs/<feature>/review-ledger.json` を読み込むこと
- **FR-002**: review-ledger.json が存在しない場合、approve を停止し「review-ledger.json が見つかりません。先に impl/fix フェーズで review を実行してください」と表示すること
- **FR-003a**: review-ledger.json が不正な JSON（パース不可）の場合、approve を停止し「review-ledger.json のパースに失敗しました。ファイルを確認してください」と表示すること
- **FR-003b**: JSON は有効だが必須フィールド（`status`）が欠けている場合、approve を停止し「review-ledger.json に status フィールドがありません。ledger の形式を確認してください」と表示すること
- **FR-004**: gate 判定は top-level `status` フィールドを唯一の正本として使用すること。`status` は ledger 書き込み時に 002-review-ledger の導出ルールで `findings` から自動計算されるため、正常な ledger では `status` と `findings` は常に整合する。approve 側で `findings` からの再計算や整合性チェックは行わない:
  - `status` が `has_open_high` → approve を停止（未解決 high が存在する）
  - `status` が `all_resolved` → 通常の commit/push/PR フローへ進む
  - `status` が `in_progress` → 通常の commit/push/PR フローへ進む（high は 0 件、issue の「unresolved high = 0 なら進む」に合致）
  - `status` が上記以外の未知の値 → approve を停止し「不明な ledger status です。ファイルを確認してください」と表示
  - 注: `status` と `findings` が手動編集等で不整合になった場合は `status` の値に従う。ledger の整合性担保は書き込み側（impl/fix フェーズ）の責務であり、approve はその正しさを前提とする
- **FR-005**: high finding の approve gate 上の blocking 判定（top-level `status` の導出に使われる基準と同一）:
  - `new` → blocking（初回検出、未解決）
  - `open` → blocking（2 ラウンド以上未解決）
  - `accepted_risk` → blocking（ユーザーがリスク受容しても high は approve をブロック）
  - `ignored` → blocking（ユーザーが無視しても high は approve をブロック）
  - `resolved` → non-blocking（解決済み）
- **FR-006**: 停止時に、`findings` 配列が存在し配列である場合、severity が `high` かつ status が `resolved` 以外の finding を抽出し、各 finding の `id`、`title`、`detail`、`status` を一覧で表示すること。`findings` が存在しないまたは配列でない場合は、概要表示をスキップし停止メッセージのみ表示する
- **FR-007**: gate を通過した場合、通常の commit/push/PR フローへ進むこと
- **FR-008**: ledger を正常に評価できない以下のケースはすべて gate failure（approve 停止）とすること:
  - review-ledger.json が存在しない（FR-002）
  - JSON パース不可（FR-003a）
  - 必須フィールド `status` が欠落（FR-003b）
  - `status` が未知の値（FR-004）

### Key Entities

- **review-ledger.json**: impl/fix フェーズで生成されるレビュー結果の状態ファイル。top-level `status` フィールドと `findings` 配列を持つ
- **finding**: 個別のレビュー指摘。severity（high/medium/low）と status（new/open/resolved/accepted_risk/ignored）を持つ。停止時の表示用に severity=high かつ status が resolved 以外の finding を抽出する

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 未解決 high finding がある状態で approve を実行した場合、100% の確率で停止する
- **SC-002**: 停止時に未解決 high finding の概要が表示され、ユーザーが問題箇所を特定できる
- **SC-003**: 全 high finding が解決済みの場合、approve が正常に完了し commit/push/PR が作成される
- **SC-004**: review-ledger.json が存在しない場合、approve が停止し review 実行を促すメッセージが表示される

## Assumptions

- review-ledger.json のスキーマは既存の 002-review-ledger で定義された形式に従う
- approve フェーズの変更対象は `specflow.approve.md` スラッシュコマンドファイルである
- quality gate のチェックは approve フローの最初のステップとして実行される
