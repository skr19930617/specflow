<!-- Historical Migration
  Source: specs/018-unify-review-ledger/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: spec/planレビューをimpl方式のレビュー台帳に統一する

**Feature Branch**: `018-unify-review-ledger`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: GitHub Issue #27 — "spec, planのレビューをimpl方式に寄せる"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - specレビューでレビュー台帳が記録される (Priority: P1)

開発者がspecレビュー（`/specflow.spec_review`）を実行すると、impl reviewと同じ形式のreview-ledger-spec.jsonにレビュー結果が記録される。再レビュー時（`/specflow.spec_fix`）には、前回の指摘との差分が自動的にマッチングされ、resolved/open/newの状態が追跡される。specレビューではauto-fixループは実行しない。severity "low" のfindingのみ単発で自動適用し（ledger上でresolvedに更新、再レビューなし）、severity "medium" 以上のfindingはユーザー確認を経て手動修正する。

**Why this priority**: specレビューはワークフローの最初のレビューポイントであり、ここでの品質追跡が後続のplan/implレビューの基盤となるため。

**Independent Test**: `/specflow.spec_review` を実行し、review-ledger-spec.jsonが作成され、再レビュー後にfindingの状態が正しく遷移することを確認できる。

**Acceptance Scenarios**:

1. **Given** specファイルが存在する状態, **When** `/specflow.spec_review` を実行する, **Then** review-ledger-spec.jsonが作成され、findingsが記録される
2. **Given** specレビュー済み（ledger存在）の状態, **When** specを修正して `/specflow.spec_fix` で再レビューする, **Then** 既存findingとのマッチングが行われ、resolved/open/newの状態が正しく更新される
3. **Given** specレビューでlow/medium/high findingが混在する状態, **When** レビュー結果が表示される, **Then** auto-fixループは実行されず、severity "low" のfindingのみ単発で自動適用されledger上でresolvedに更新され、severity "medium" 以上はユーザー確認を経て手動修正する

---

### User Story 2 - planレビューでレビュー台帳が記録される (Priority: P1)

開発者がplan/tasksレビュー（`/specflow.plan_review`）を実行すると、review-ledger-plan.jsonにレビュー結果が記録される。specレビューの台帳とは独立したファイルとして管理される。planレビューではimplと同じauto-fixループが有効であり、未解決のhigh findingがあれば自動修正→再レビューを繰り返す。

**Why this priority**: planレビューはspec同様にワークフローの重要なチェックポイントであり、specと同列で統一が必要。

**Independent Test**: `/specflow.plan_review` を実行し、review-ledger-plan.jsonにレビュー結果が記録され、再レビューで状態遷移が追跡されることを確認できる。

**Acceptance Scenarios**:

1. **Given** plan.mdとtasks.mdが存在する状態, **When** `/specflow.plan_review` を実行する, **Then** plan.mdとtasks.mdを一体としてレビューし、review-ledger-plan.jsonにレビュー結果が記録される
2. **Given** planレビュー済みの状態, **When** planを修正して `/specflow.plan_fix` で再レビューする, **Then** findingマッチングアルゴリズムが適用され、状態が正しく追跡される
3. **Given** planレビューで未解決のhigh findingがある状態, **When** auto-fixループが実行される, **Then** implと同じdivergence detection付きで自動修正→再レビューが繰り返される

---

### User Story 3 - phase別のledgerファイルで独立管理される (Priority: P2)

1つのfeatureに対するspec/plan/implの全レビュー結果が、phase別の独立ファイル（review-ledger-spec.json, review-ledger-plan.json, review-ledger.json）で管理される。各phaseのファイルは互いに干渉せず、それぞれ既存のimpl ledgerと同じスキーマを使用する。

**Why this priority**: ファイルを分離することでマイグレーションが不要になり、既存のimpl ledgerとの完全な互換性が維持されるため。

**Independent Test**: spec → plan → impl のフロー全体を通して実行し、各phaseのledgerファイルが独立して正しく動作することを確認できる。

**Acceptance Scenarios**:

1. **Given** specレビュー完了済みの状態, **When** `/specflow.plan_review` を実行する, **Then** review-ledger-spec.jsonは変更されず、review-ledger-plan.jsonが新規作成される
2. **Given** spec/plan/impl全てのレビューが完了した状態, **When** featureディレクトリを参照する, **Then** review-ledger-spec.json, review-ledger-plan.json, review-ledger.json の3ファイルが存在し、各phaseのfindings・round_summariesが確認できる

---

### User Story 4 - レビュー台帳の可視化 (Priority: P3)

specsディレクトリ配下の全featureのレビュー台帳ファイルを集計し、レビューの実施状況・品質状態を一覧で確認できる。

**Why this priority**: 可視化はレビュー統一の最終ゴールだが、台帳の統一が先に完了している必要があるため。

**Independent Test**: 複数featureのledgerファイルが存在する状態でダッシュボードコマンドを実行し、正しい集計結果が表示されることを確認できる。

**Acceptance Scenarios**:

1. **Given** 複数featureにledgerファイルが存在する状態, **When** 可視化コマンドを実行する, **Then** featureごと・phaseごとのレビュー回数、finding数、解決率がテーブル形式で表示される
2. **Given** レビュー未実施のfeatureがある状態, **When** 可視化コマンドを実行する, **Then** 未実施phaseのカラムは `-` と表示される
3. **Given** 可視化コマンドを実行した後, **When** specs/review-dashboard.md を参照する, **Then** ターミナルと同じ集計結果がMarkdownテーブルとして保存されている

---

### Edge Cases

- review-ledger-spec.jsonが存在しない状態でspec_fixを実行した場合 — 初回レビューとして新規作成する
- review-ledger.json（既存impl形式）が存在するfeatureで新形式のspec/planレビューを実行した場合 — 既存のreview-ledger.jsonには触れず、別ファイルとして独立管理
- ledgerファイルが破損している場合 — 既存のバックアップ・リカバリ機構を各phaseのファイルに適用する
- findingsが0件の場合 — 既存のimpl reviewと同じロジック（全active findingをresolvedに遷移）を適用する
- 可視化コマンドでledgerファイルが一部のphaseにしかない場合 — 存在するphaseのみ集計し、未実施phaseは `-` で表示する（表示値マッピング表に準拠）

## Clarifications

### Session 2026-04-06

- Q: 既存の単一phase形式ledgerとの後方互換性をどう扱うか？ → A: マイグレーション不要。phase別に独立ファイルとして管理する（review-ledger-spec.json, review-ledger-plan.json, review-ledger.json）。既存のimpl ledgerはそのまま
- Q: spec/plan reviewでもauto-fixループを有効にするか？ → A: specではauto-fixループなし（severity "low" のfindingのみ単発自動適用してledger上resolved、再レビューなし。medium以上はユーザー確認で手動修正）。planではimplと同じauto-fixループを有効化
- Q: 可視化コマンドの出力形式は？ → A: 両方（CLI + Markdown）— ターミナルにテーブル表示しつつ、specs/review-dashboard.md にも保存

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: spec reviewコマンドは、レビュー結果をreview-ledger-spec.jsonに記録しなければならない
- **FR-002**: plan reviewコマンドは、レビュー結果をreview-ledger-plan.jsonに記録しなければならない
- **FR-003**: 各phaseのledgerファイルは、既存のimpl review ledger（review-ledger.json）と同一のJSONスキーマを使用しなければならない（`phase`フィールドの値のみ異なる: "spec" / "plan" / "impl"）
- **FR-004**: 各phaseのレビュー結果は、impl reviewと同じfindingマッチングアルゴリズム（same/reframed/new の3段階マッチング）を使用しなければならない
- **FR-005**: spec reviewではauto-fixループを実行してはならない。severity "low" のfindingのみ単発で自動適用し、適用後にledger上の該当findingのstatusを "resolved" に更新する（自動適用後の再レビューは行わない）。severity "medium" 以上のfindingはユーザー確認を経て手動修正する。plan reviewではimplと同じauto-fixループ（divergence detection含む）を実行する
- **FR-006**: spec/plan reviewでもcurrent-phase.mdが生成されなければならない
- **FR-007**: 既存のimpl review ledger（review-ledger.json）は変更してはならない。spec/planは独立したファイルとして並存する
- **FR-008**: 可視化コマンドは、specsディレクトリ配下の全featureのledgerファイル（review-ledger-spec.json, review-ledger-plan.json, review-ledger.json）を集計し、CLIテーブルとしてターミナルに表示すると同時に、specs/review-dashboard.md にMarkdownファイルとして保存しなければならない

### 可視化の集計ルール

- **featureの探索**: `specs/` 配下の各ディレクトリ（`specs/<number>-<name>/`）を1つのfeatureとみなす。`spec.md` が存在するディレクトリのみ対象とする
- **phaseの判定**: 各featureディレクトリ内の `review-ledger-spec.json`（spec phase）、`review-ledger-plan.json`（plan phase）、`review-ledger.json`（impl phase）の存在有無で判定する
- **レビュー回数**: 各ledgerファイルの `round_summaries` 配列の長さ（= レビューラウンド数）
- **finding数**: 各ledgerファイルの `findings` 配列の長さ（= 累積finding数）
- **解決率**: `findings` 配列のうち `status` が "resolved" のfinding数 / 全finding数 × 100（%）

**ダッシュボード表示値マッピング:**

| 状態 | レビュー回数 | finding数 | 解決率 |
|------|-------------|-----------|--------|
| ledgerファイルが存在しない | `-` | `-` | `-` |
| ledger存在、findings空配列 | round_summaries.length | `0` | `-` |
| ledger存在、findings非空 | round_summaries.length | findings.length | resolved / total × 100% |

- featureディレクトリにledgerファイルが1つも存在しない場合、そのfeature行全体のphaseカラムはすべて `-` と表示する

### コマンド別のledger挙動

各コマンドのledger未存在時・既存在時の挙動は既存のimpl reviewに準拠する:

- **spec_review / plan_review（初回実行、ledger未存在）**: 新規ledgerファイルを作成し、round 1としてfindingsを記録する
- **spec_review / plan_review（再実行、ledger既存在）**: 新ラウンドを追加し、既存findingsとのマッチングアルゴリズムを適用する（impl reviewのre-review分類モードと同じ）
- **spec_fix / plan_fix（ledger未存在）**: 初回レビューとして新規ledgerを作成する（impl reviewのfix時と同じ挙動）
- **spec_fix / plan_fix（ledger既存在）**: 修正を適用後、re-reviewプロンプトで再レビューし、既存findingsとのマッチングを実行する

### Key Entities

- **Review Ledger File**: phase別のレビュー記録ファイル。既存のimpl ledgerと同一スキーマで、`phase`フィールドの値のみ異なる
- **Phase**: レビューの段階（spec / plan / impl）。それぞれ独立したledgerファイルを持つ
- **Finding**: 個々のレビュー指摘。severity、status、relation等の属性を持ち、ラウンド間で追跡される
- **Round Summary**: 各レビューラウンドの集計スナップショット。ledgerファイル内で連番管理される
- **Review Dashboard**: 全featureの集計結果をまとめたMarkdownファイル（specs/review-dashboard.md）

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: spec/plan reviewの実行結果が、impl reviewと同じスキーマのledgerファイルにphase別で記録される
- **SC-002**: spec/planの再レビュー時に、前回指摘との差分が自動追跡され、resolved/open/newの状態が正しく遷移する
- **SC-003**: 各phaseのledgerファイルが独立して管理され、既存のimpl review ledger（review-ledger.json）に影響を与えない
- **SC-004**: 可視化コマンドにより、全featureのレビュー実施状況が一覧で確認でき、phaseごとのレビュー回数・finding解決率が把握できる
- **SC-005**: 既存のimpl review ledger（review-ledger.json）が、変更なしで引き続き正常動作する

## Design Decisions

- **specのauto-fix挙動がimplと異なる理由**: issueの「implと同じような方式」はレビュー台帳（ledger）の記録・追跡方式を指す。specは仕様文書であり、自動修正による意図しない仕様変更を防ぐため、auto-fixループは実行せず、severity "low" の修正のみ単発自動適用とする。これはユーザーの明示的な判断による設計決定
- **plan phaseのレビュー対象**: plan.mdとtasks.mdを一体としてレビューする。どちらか一方のみ存在する場合も、存在するファイルを対象としてplan_review/plan_fixを実行する。両方が存在しない場合はエラーとする

## Assumptions

- 既存のfindingマッチングアルゴリズム（same/reframed/new）はspec/planレビューにもそのまま適用可能
- 各phaseのledgerファイルは既存のimpl ledgerと同一のJSONスキーマを使用するため、マイグレーションは不要
- auto-fixループはimpl reviewとplan reviewで実行される。spec reviewは手動修正フロー（自明な修正の単発自動適用のみ許可）
- 可視化はCLIテーブル表示 + Markdownファイル保存の両方を提供し、Web UIは本スコープ外とする
