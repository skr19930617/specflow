<!-- Historical Migration
  Source: specs/002-review-ledger/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: Review Ledger for Impl Review Loop

**Feature Branch**: `002-review-ledger`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "impl review loop 用の state ファイル review-ledger.json を導入する"

## Clarifications

### Session 2026-03-29

- Q: ラウンド間で finding を same / reframed と判定する基準は？ → A: file + category + severity の組み合わせで同一 finding を判定
- Q: finding の id はどのように生成するか？ → A: round + 連番（例: R1-F01, R2-F03）
- Q: review-ledger.json の更新はいつトリガーされるか？ → A: specflow.impl / specflow.fix コマンド実行時に自動更新
- Q: トップレベル status フィールドの値は？ → A: in_progress / all_resolved / has_open_high の 3 値
- Q: round_summaries に severity 別の内訳を含めるか？ → A: 含める（high / medium / low 別の件数を記録）
- Q: finding のライフサイクルモデルは？ → A: findings[] は論理 finding ごとに 1 レコード（canonical record）で累積管理。reframed 時は元 finding の status を `resolved` に更新し relation を `reframed` に設定、新 finding に `supersedes` フィールドで元 finding の id を記録する。`reframed` は relation 値のみであり status 値ではない
- Q: ラウンド作成のトリガーは？ → A: specflow.impl / specflow.fix 内で Codex review が実行され結果が返された時のみ。review 結果がない場合は ledger を更新しない
- Q: high severity finding への override 可否は？ → A: 警告付きで許可。notes 必須。top-level status は accepted_risk/ignored の high finding があっても has_open_high を維持

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initial Review Ledger Creation (Priority: P1)

開発者が impl フェーズで Codex review を実行した後、review 結果が `review-ledger.json` に自動的に記録される。これにより、初回 review の findings がすべて構造化された形で保存され、以降のラウンドで参照可能になる。

**Why this priority**: review-ledger の基本機能であり、これがなければ他のすべての機能が成り立たない。初回 review 結果の永続化が最も重要。

**Independent Test**: impl review を 1 回実行し、`specs/<issue>-<slug>/review-ledger.json` が生成され、findings が正しく記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** impl review が未実行の feature、**When** Codex impl review を実行する、**Then** `review-ledger.json` が `specs/<issue>-<slug>/` に生成され、`current_round` が 1、各 finding が `findings[]` に記録される
2. **Given** impl review を実行した、**When** `review-ledger.json` を参照する、**Then** `feature_id`、`phase`、`current_round`、`status`、`findings[]`、`round_summaries[]` がすべて含まれている

---

### User Story 2 - Multi-Round Review Tracking (Priority: P1)

開発者が review 指摘を修正し再 review を実行すると、既存の `review-ledger.json` が更新される。前回の findings と今回の findings が自動的に比較され、各 finding の status（resolved / open / new）と relation（same / new / reframed）が設定される。

**Why this priority**: review loop の核心機能。複数ラウンドにわたる finding の追跡がなければ、ledger の存在意義がない。

**Independent Test**: 2 回の review を実行し、1 回目の finding が resolved/open に分類され、2 回目で新たに出た finding が new として記録されることを確認する。

**Acceptance Scenarios**:

1. **Given** round 1 の review-ledger が存在する、**When** 修正後に再 review を実行する、**Then** `current_round` が 2 に更新され、解決済み finding の status が `resolved` に変わる
2. **Given** round 1 で finding A（R1-F01）が存在する、**When** round 2 で同じ file + category だが severity が異なる finding が出る、**Then** finding A の status が `resolved` に、relation が `reframed` に更新され、新 finding（R2-F01）の `supersedes` フィールドに `R1-F01` が記録される
3. **Given** round 2 の review で新規 finding が検出される、**When** ledger が更新される、**Then** 新規 finding の `origin_round` が 2、`status` が `new`、`relation` が `new` に設定される

---

### User Story 3 - Round Summary Generation (Priority: P2)

各 review ラウンド完了時に、そのラウンドの集計情報が `round_summaries[]` に自動保存される。開発者はサマリーを見るだけで、各ラウンドの全体像（新規/解決/未解決の件数、severity 別の内訳）を把握できる。

**Why this priority**: ラウンドごとの進捗を人間が一目で把握するための機能。finding 個別の追跡（P1）の上に成り立つ補助機能。

**Independent Test**: 2 ラウンド実行後に `round_summaries` を確認し、各ラウンドの集計（total findings、resolved、new、open の件数）が正確に記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** review ラウンドが完了した、**When** ledger が更新される、**Then** `round_summaries[]` に当該ラウンドの集計（total、resolved、new、open の件数）が追加される
2. **Given** 3 ラウンドの review が完了した、**When** `round_summaries` を参照する、**Then** 3 つのサマリーがラウンド順に並び、各サマリーで severity 別の内訳が確認できる

---

### User Story 4 - Manual Status Override (Priority: P3)

開発者が特定の finding に対して `accepted_risk` や `ignored` ステータスを手動設定できる。これにより、意図的に対応しない finding を明示的にマークし、以降のラウンドで再指摘されても自動的にフィルタできる。

**Why this priority**: 品質判断の柔軟性を提供するが、基本的な review loop tracking（P1/P2）の後に必要になる機能。

**Independent Test**: ledger 内の特定 finding の status を `accepted_risk` に変更し、次の review ラウンドでその finding が再出現しても status が維持されることを確認する。

**Acceptance Scenarios**:

1. **Given** open status の finding が存在する、**When** 開発者が status を `accepted_risk` に変更し notes に理由を記載する、**Then** ledger が更新され、以降のラウンドでその finding の status が保持される
2. **Given** `ignored` に設定された finding がある、**When** 次の review ラウンドで同じ finding が検出される、**Then** status は `ignored` のまま維持され、relation が `same` に設定される

---

### Edge Cases

- review-ledger.json が手動で壊された（不正な JSON）場合、エラーメッセージを表示しバックアップから復旧を試みる
- 同一ファイル・同一行に対して複数の finding が存在する場合、それぞれ独立した finding として管理する
- review の結果 finding が 0 件だった場合、既存の `findings[]` はそのまま保持し（累積モデルのため空にはしない）、前ラウンドの open finding をすべて `resolved` に更新した上で round summary を記録する。初回 review で 0 件の場合のみ `findings[]` は空配列となる
- round 間で finding の severity が変わった場合（Codex が別の severity で再検出）、split-record モデルに従う: 元 finding は status=`resolved`, relation=`reframed` に更新し severity は元の値を保持する。新 finding を作成し status=`open`, relation=`reframed`, `supersedes`=元 finding の id を設定する
- `accepted_risk` / `ignored` に設定された finding が次ラウンドで再検出された場合、override status を維持し relation を `same` に設定する。次ラウンドで検出されなかった場合も override status を維持する（累積モデルのため削除しない）。ユーザーが手動で override を解除した場合は status を `open` に戻す
- finding が次ラウンドで検出されなかった場合（消失）: status を `resolved` に更新し、relation は直前の値を保持する（nullable ではない）。その後のラウンドで同一 file + category + severity の finding が再出現した場合: 旧レコードは reopen せず、新しい finding レコードを `relation=new` で作成する（回帰と新規の区別は origin_round の比較で判断可能）

## Finding Status Lifecycle

### 状態遷移テーブル

| Current Status | Event | New Status | New Relation | Notes |
|---|---|---|---|---|
| (なし) | 初回検出 (round 1) | `new` | `new` | origin_round = current_round |
| `new` | 次ラウンドで再検出 (same key) | `open` | `same` | latest_round を更新 |
| `new` | 次ラウンドで未検出 | `resolved` | 直前値保持 | 消失による自動解決 |
| `open` | 次ラウンドで再検出 (same key) | `open` | `same` | latest_round を更新 |
| `open` | 次ラウンドで未検出 | `resolved` | 直前値保持 | 消失による自動解決 |
| `open` / `new` | severity 変更で再検出 | `resolved` | `reframed` | 元 finding は resolved。新 finding を status=`open`, relation=`reframed` で作成 |
| `open` / `new` | ユーザーが手動 override | `accepted_risk` / `ignored` | 変更なし | high severity は notes 必須 |
| `accepted_risk` | 次ラウンドで再検出 (same key) | `accepted_risk` | `same` | override 維持 |
| `accepted_risk` | 次ラウンドで未検出 | `accepted_risk` | 直前値保持 | override 維持（累積モデル） |
| `accepted_risk` | severity 変更で再検出 | `resolved` | `reframed` | override は新 finding に引き継がない。新 finding は status=`open` で作成。ユーザーが再度 override 判断する |
| `accepted_risk` | ユーザーが手動解除 | `open` | 変更なし | |
| `ignored` | 次ラウンドで再検出 (same key) | `ignored` | `same` | override 維持 |
| `ignored` | 次ラウンドで未検出 | `ignored` | 直前値保持 | override 維持（累積モデル） |
| `ignored` | severity 変更で再検出 | `resolved` | `reframed` | override は新 finding に引き継がない。新 finding は status=`open` |
| `ignored` | ユーザーが手動解除 | `open` | 変更なし | |
| `resolved` | 再出現（same key） | — | — | 旧レコードは reopen しない。新 finding レコードを `relation=new` で作成 |

### `new` → `open` 遷移

- 初回検出時の status は `new`
- 次のラウンドで同一 finding が再検出された場合、status は `open` に遷移する
- `new` は「当該ラウンドで初めて出現した」ことを示す一時的な status であり、1 ラウンドのみ有効

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate or update `review-ledger.json` in `specs/<issue-number>-<slug>/` automatically when `specflow.impl` or `specflow.fix` コマンド内で Codex review が実行され結果が返された時のみ。review 結果が生成されなかった場合（例: fix のみで re-review なし）は ledger を更新しない
- **FR-002**: System MUST include `feature_id`, `phase`, `current_round`, `status`, `findings[]`, `round_summaries[]` as top-level fields。`status` は以下の導出ルールで決定論的に算出する:
  - `has_open_high`: high severity の finding が 1 件以上 `open` または `new` status である場合（`accepted_risk`/`ignored` の high finding が存在する場合も含む）
  - `all_resolved`: すべての finding が `resolved` status である場合（high/medium/low 問わず）。finding が 0 件の場合も `all_resolved`
  - `in_progress`: 上記いずれにも該当しない場合（high severity は未解決なし、かつ medium/low に `open`/`new` が残っている場合）
- **FR-003**: Each finding MUST contain `origin_round`, `latest_round`, `id`, `severity`, `category`, `file`, `title`, `detail`, `status`, `relation`, `supersedes`, `notes`。`id` は `R{round}-F{sequential}` 形式（例: R1-F01, R2-F03）で生成する。`supersedes` は reframed 時に元 finding の id を格納し、それ以外では null とする。`findings[]` は論理 finding ごとに 1 レコード（canonical record）を累積的に保持し、ラウンドをまたいで同一レコードの `latest_round` と `status` を更新する。findings はラウンド間で削除されない（累積モデル）
- **FR-004**: System MUST support finding status values: `open`, `resolved`, `new`, `accepted_risk`, `ignored`。`reframed` は status 値ではない（relation 値のみ）。reframed された元 finding の status は `resolved` に遷移する
- **FR-005**: System MUST support finding relation values: `same`, `new`, `reframed`。reframed は同一 file + category で severity が変わった場合に設定される。元 finding は status=`resolved`, relation=`reframed` となり severity は元の値を保持する。新 finding は status=`open`, relation=`reframed`, `supersedes`=元 finding の id で作成される
- **FR-006**: System MUST update existing `review-ledger.json` on subsequent review rounds instead of creating a new file
- **FR-007**: System MUST compare findings between rounds using the following deterministic matching algorithm:
  1. Primary key: `file` + `category` + `severity` の完全一致で same 候補を特定
  2. 同一 primary key の finding が 1:1 の場合、same と判定
  3. 同一 primary key の finding が複数存在する場合（N:M）、`title` の正規化（小文字化 + 空白正規化）後の完全一致でマッチ。完全一致しない場合は出現順（findings 配列のインデックス順）で先頭から 1:1 でペアリングし、余りは `new` として扱う
  4. `file` + `category` 一致かつ `severity` 変更の場合は reframed 判定（同様に 1:1 ペアリング）
  5. いずれにもマッチしなかった finding は `new` として扱う
- **FR-008**: System MUST increment `current_round` only when a new Codex review result is received and processed into the ledger
- **FR-009**: System MUST append a summary to `round_summaries[]` after each review round。各サマリーはすべて「ラウンド処理完了後の ledger 全体のスナップショット」として以下のフィールドを含む（デルタは使用しない）:
  - `round`: ラウンド番号
  - `total`: ledger 内の全 finding 数（全 status 含む累積）
  - `open`: status が `open` の finding 数（スナップショット）
  - `new`: status が `new` の finding 数（スナップショット。当該ラウンドで初出の finding のみ `new` status を持つ）
  - `resolved`: status が `resolved` の finding 数（スナップショット）
  - `overridden`: status が `accepted_risk` または `ignored` の finding 数（スナップショット）
  - `by_severity`: { `high`: { `open`, `resolved`, `new`, `overridden` }, `medium`: { ... }, `low`: { ... } } の severity 別内訳（各値はスナップショット、上記と同じ定義）
- **FR-010**: System MUST maintain issue-independent ledgers (each issue's ledger is isolated in its own spec directory)
- **FR-011**: System MUST preserve manually set `accepted_risk` and `ignored` statuses across review rounds。再検出時は override を維持し relation=`same`。次ラウンドで検出されなかった場合も override を維持（累積モデル）。ユーザーが手動で override を解除した場合は status を `open` に戻す
- **FR-015**: finding が次ラウンドで検出されなかった場合（消失）、status を `resolved` に更新し relation は直前の値を保持する。再出現した場合は旧レコードを reopen せず、新しい finding レコードを `relation=new` で作成する（回帰判定は origin_round の比較で行う）
- **FR-012**: high severity の finding に `accepted_risk` または `ignored` を設定することは許可する。これは issue の「high severity finding は必ず修正対象にしたい」という意図を補完するポリシーであり、「原則修正、ただし例外は明示的な理由付きで記録可能」という運用方針を採用する。制約: (1) `notes` フィールドへの理由記載を必須とし、理由が空の場合はステータス変更を拒否してエラーメッセージ「high severity finding の override には notes が必須です」を返す (2) notes が不正な形式（空文字列、空白のみ）の場合も同様に拒否する (3) この override は「修正しないという意思決定の例外記録」であり、finding の品質リスクや issue の未解決状態を消すものではない (4) override された high finding は issue 上で「対応済み」とはみなされず、レビュー結果に明示的な警告「⚠ high severity finding が override されています: {id}」として表示される (5) ledger 読み込み時に無効な override（notes 空の high severity finding が accepted_risk/ignored）が検出された場合、status を `open` に自動リバートし警告を出力する
- **FR-013**: `accepted_risk` / `ignored` に設定された high severity finding が存在する場合でも、top-level `status` は `has_open_high` を維持する（完全解決扱いにしない）。top-level `status` が `all_resolved` になるのは、すべての finding（severity 問わず）が `resolved` status の場合のみ。`accepted_risk` / `ignored` は最終状態として許容されるが、`all_resolved` への遷移条件からは除外される
- **FR-014**: `round_summaries` では `accepted_risk` / `ignored` の件数を `overridden` として別カウントし、`open` / `resolved` とは区別する

### Key Entities

- **Review Ledger**: feature 単位の review 状態を保持するルートオブジェクト。feature_id で特定され、phase（impl）と current_round で現在位置を示す
- **Finding**: 個別のレビュー指摘事項。id で一意に識別され、論理 finding ごとに 1 レコード（canonical record）を保持。origin_round（初出ラウンド）と latest_round（最終検出ラウンド）でライフサイクルを追跡する。reframed 時は `supersedes` フィールドで元 finding への参照を保持する
- **Round Summary**: 各ラウンド完了時のスナップショット集計。findings の status 別・severity 別の件数を記録する

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: impl review 実行後に `review-ledger.json` が 100% の確率で生成または更新される
- **SC-002**: 2 回目以降の review で、前回 findings との差分（resolved / new / reframed）が自動分類される
- **SC-003**: 開発者が review loop の現在状態を ledger 参照のみで把握でき、review 全文の再読が不要になる
- **SC-004**: issue ごとに独立した ledger が保持され、他 issue の review 状態と干渉しない

## Assumptions

- impl フェーズのみが対象であり、spec/plan フェーズへの適用は本 feature のスコープ外
- finding の自動マッチング（same / reframed の判定）は、file + category + severity の完全一致で判定する
- review-ledger.json は人間が直接編集する可能性があるため、JSON として読み書き可能なプレーンテキスト形式を維持する
- Codex review の出力形式は現行の JSON フォーマットを前提とする
