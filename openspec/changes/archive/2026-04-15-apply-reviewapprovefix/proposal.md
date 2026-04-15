## Why

Source: [skr19930617/specflow#145](https://github.com/skr19930617/specflow/issues/145)

現状、`apply_review` 完了後のハンドオフは `actionable_count > 0`（open/new finding がゼロか否か）だけで `/specflow.fix_apply` か `/specflow.approve` を決定している。その結果、レビュアーの `decision` が `approve` であっても **LOW severity の finding が 1 件でも残っていれば fix_apply 遷移しか提示されず**、ユーザーが approve に進めない。

これは既存の `review-orchestration` spec（「unresolved `high` finding が無ければ `handoff.state = "review_approved"`」）とも矛盾しており、severity-aware な approve 判定を「状態機械の真の遷移」として固定し、関連する全依存関係（orchestrator 出力 → current-phase.md → slash-command guide ハンドオフ選択肢 → spec ドキュメント）を一貫させる必要がある。

- Source provider: github
- Source reference: https://github.com/skr19930617/specflow/issues/145
- Source title: apply_reviewの後approveが出ていてもfixの遷移しかない

Source context:

> 現状apply_reviewの結果でapproveされていてもlow　findingsがあるだけでapproveに進めない。これをreview結果がapproveならそのままapproveに進めることを状態機械の真の遷移として固定して関連する全ての依存関係を整理したい

## Clarifications

### Round 1 — initial clarify

1. **Gate threshold = HIGH+ のみ**: `severity ∈ {critical, high}` かつ `status ∈ {new, open}` の finding 件数 = 0 → approve 経路。MEDIUM / LOW は approve を阻害しない。
2. **判定ソース = severity のみ**: ledger の HIGH+ unresolved 件数のみで handoff state を決める。レビュー JSON の `decision` 文字列は UI 表示には使うが gate 条件には使わない（review-orchestration spec の既存条文「if no unresolved high findings remain it SHALL return `handoff.state = "review_approved"`」と一致）。
3. **approve 可視性**: `review_with_findings` / `loop_with_findings`（HIGH+ 残存）でも、approve を「第一選択以外」の選択肢として残す。現行 `loop_with_findings` の UI を全 with-findings 状態に適用することで、ユーザーが強制 approve（例: accepted risk 運用）を意識的に選べる形を維持する。
4. **state 名称は現状維持、意味のみ severity-aware に再定義**: `review_no_findings` / `review_with_findings` / `loop_no_findings` / `loop_with_findings` は後方互換のまま保持し、`_no_findings` = 「HIGH+ unresolved = 0」、`_with_findings` = 「HIGH+ unresolved ≥ 1」に意味を固定する。

### Round 2 — proposal challenge reclarify

5. **C1: Approve gate も同一 HIGH+ 閾値に拡張**: `specflow.approve.md` の Quality Gate `has_open_high` 解釈を critical も含む `has_open_high_or_critical` に拡張し、apply_review handoff と同一閾値で判定する。`status` 列挙値そのものは互換維持し、`status == has_open_high` の解釈側で critical を包含するか、新値 `has_open_high_or_critical` を追加して移行する（実装方式は design phase で決定）。
6. **C2: ヘルパー関数は新関数に統一して旧関数を削除**: `unresolvedHighCount`（HIGH のみ）の全呼び出し元を `unresolvedCriticalHighCount`（HIGH+critical）に置換し、旧関数を削除する。関連 spec/test も同期更新。
7. **C3: with-findings 時の approve 選択肢 UX を spec で固定**: spec に以下 3 条件を明記する:
   - Approve 選択肢は with-findings 状態では常にリストの**最後**に配置する（primary handoff の上書きを偶発的に行わせない）。
   - Approve ラベルに severity_summary（例: `Approve (HIGH 2, MEDIUM 1 を accepted risk として残す)`）を付記する。
   - Approve 選択時に「HIGH+ findings が残存しています。accepted_risk 運用を確認してください」警告を表示する。
8. **C4: surface-event スキーマバージョンを bump**: `surface-events.ts` の payload に `schema_version` フィールド（数値、新規 = 2）を導入する。`schema_version` 未設定または 1 の保存済みイベントは `legacy_actionable_count_basis: true` として読み取り側で扱い、ダッシュボード等の解釈は actionable_count 基準であると明示する。spec の Migration セクションを追加。
9. **C5: MEDIUM 残存は gate を阻害せず severity_summary に含めて表示**: MEDIUM の open count を `severity_summary` に表示し、handoff テキストに「Remaining Risks として記録される」旨を明記。明示確認ステップは追加しない（既存の Approval Summary フローで担保）。
10. **C6: design review も同期で severity-aware 化**: `specflow.review_design.md` / `specflow-review-design` orchestrator / current-phase renderer の design パス / `design-review-approved` 周辺 spec を、apply review と同じ severity-aware ルールに合わせる。`review-orchestration/spec.md` の汎用条文との整合を保つため、apply のみ修正だと spec とコードが乖離してしまうことを回避する。

## What Changes

- **review-approved ハンドオフ semantics を severity-aware に固定する（apply + design 両方）:**
  - `apply_review` / `design_review` 完了後、`severity ∈ {critical, high}` かつ `status ∈ {new, open}` の finding が 0 件 → `handoff.state = "review_no_findings"`（approve 経路、第一選択）。
  - HIGH+ unresolved ≥ 1 のときのみ `handoff.state = "review_with_findings"`（fix 第一選択、approve は最後の選択肢として併記）。
  - LOW / MEDIUM の open finding は approve 経路を阻害しないが、`severity_summary` に件数を表示し、Remaining Risks として approval-summary に記録される。
  - auto-fix ループ完了後の `loop_no_findings` / `loop_with_findings` も同じ severity-aware ルールに統一（HIGH+ unresolved 基準）。
- **orchestrator 出力と `current-phase.md` の "Next Recommended Action" を上記ルールに合わせて更新する**（apply と design 両系統）:
  - `src/bin/specflow-review-apply.ts` / `src/bin/specflow-review-design.ts`: `resultFromLedger` の `state` 判定と autofix-loop 末尾の `state` 判定を `unresolvedCriticalHighCount(ledger) > 0` ベースに変更。
  - `src/lib/review-runtime.ts`: `renderCurrentPhase` / `renderCurrentPhaseToStore` の `nextAction` を HIGH+ ベースに変更（apply / design 両 kind）。`Open High Findings` 行は critical を含む表記に整合し、`Actionable Findings` 行はそのまま残す（Remaining Risks 情報を失わないため）。
- **`global/commands/specflow.review_apply.md` / `specflow.review_design.md` の "State-to-Option Mapping" と "Actionable Findings 定義" を severity-aware に書き換える**:
  - `review_with_findings` / `loop_with_findings` の条件を「HIGH+ unresolved ≥ 1」に改める。
  - 全 with-findings ハンドオフに `Approve` 選択肢を**リストの最後**に併記する。Approve ラベルには severity_summary を付記し（例: `Approve (HIGH 2, MEDIUM 1 を accepted risk として残す)`）、選択時に「HIGH+ findings が残存しています。accepted_risk 運用を確認してください」警告を表示する。
  - `review_no_findings` / `loop_no_findings` ヘッダーメッセージを「all HIGH+ findings resolved (LOW/MEDIUM may remain)」に更新し、LOW/MEDIUM 残件数を severity_summary で併記。
- **`global/commands/specflow.approve.md` Quality Gate を HIGH+ に拡張**:
  - ledger.status `has_open_high` の解釈を critical も含むよう拡張し、apply_review handoff と同一閾値（HIGH+ unresolved）で判定する。
  - 詳細実装方式（既存 status enum を意味拡張するか、新 status 値 `has_open_high_or_critical` を追加して `has_open_high` を deprecated にするか）は design phase で決定。
- **spec 側の gating ルールを明文化する:**
  - `review-orchestration/spec.md`: apply / design review での `handoff.state` 決定ルールを「HIGH+ (critical or high) unresolved count のみに依存」と明文化。「Delegated AI-agent reviewer approval is binding」シナリオを severity-aware 文面に整合。
  - `slash-command-guides/spec.md`: "Apply gates approval behind apply_ready" シナリオに「LOW/MEDIUM findings alone do not block `apply_review_approved`」条文を追加。"Apply review guide exposes approve and fix handoffs" / "Design review guide exposes apply and fix handoffs" 要求に「all `_with_findings` states SHALL also expose `handoff:specflow.approve` (apply) / `handoff:specflow.apply` (design) as a non-primary option, placed last in the option list, with a severity-summary suffix and an accepted-risk confirmation warning」を追加。
  - `surface-event-contract/spec.md`: `apply_review_approved` / `design_review_approved` の発行条件を severity-aware に記述。handoff state 名の意味（`_no_findings` / `_with_findings`）に HIGH+ unresolved ベースの定義を追加。**Migration セクション**を追加し、`schema_version` の bump と legacy event の解釈ルールを明記。
- **contract に schema_version を導入し、handoff state 意味を固定化する**:
  - `src/contracts/surface-events.ts`: payload 側に `schema_version: number`（新規発行は `2`、未設定/1 は legacy）を追加。state 名・event 名・handoff ラベルは変更しない。
  - 読み取り側ヘルパーは `schema_version < 2` のイベントを `legacy_actionable_count_basis: true` として扱い、ダッシュボード等の解釈に注意喚起できるようにする。
- **ヘルパー関数を新関数に統一し旧関数を削除**:
  - `src/lib/review-ledger.ts` に `unresolvedCriticalHighCount(ledger: ReviewLedger): number` を公開関数として追加。
  - 既存 `unresolvedHighCount`（HIGH のみ）の全呼び出し元（`src/lib/review-runtime.ts`、`src/bin/specflow-review-*.ts`、関連 test fixtures）を新関数に置換し、旧関数を削除する。
  - `actionableCount` は既存用途（approval-summary の Remaining Risks 集計など）で引き続き使用する。
- **テスト**:
  - `src/tests/generation.test.ts`: 生成された `specflow.review_apply.md` / `specflow.review_design.md` の state-mapping、Actionable Findings 定義、approve 選択肢の配置順・ラベル付記・警告文言が severity-aware になっていることを assertion。
  - `src/tests/specflow-run.test.ts`: apply_review → apply_ready / design_review → design_ready 遷移の severity-aware シナリオ（LOW-only ledger で `*_review_approved` が primary handoff になる）。
  - `src/bin` / `src/lib` の orchestrator テストに HIGH=0 + LOW=N / MEDIUM=M ledger の fixture を追加し、`handoff.state = "review_no_findings"` が返り `severity_summary` に MEDIUM/LOW 件数が含まれることを確認。
  - `src/tests/surface-event-schema-drift.test.ts`: `schema_version` が新規発行 payload に含まれ、legacy 値の読み取りで `legacy_actionable_count_basis` が立つことを確認。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `review-orchestration`: Apply / design review の `review_approved` handoff 条件を severity-aware に固定（HIGH+ unresolved 基準、HIGH = critical ∪ high）。LOW/MEDIUM の actionable finding のみでは approve を阻害しない旨を契約化。
- `slash-command-guides`: `/specflow.review_apply` / `/specflow.review_design` の State-to-Option mapping、`/specflow.approve` の Quality Gate 解釈、"Apply gates approval behind apply_ready" 相当シナリオに、severity-aware gate ルール（`review_approved` 分岐の条件、approve 選択肢の配置・ラベル・警告文言）を明記。
- `surface-event-contract`: `apply_review_approved` / `design_review_approved` payload/handoff 定義に severity-aware な review-approved 生成条件を明文化。`schema_version` の bump と legacy event 解釈の Migration セクションを追加。

## Impact

- **Affected code:**
  - `src/bin/specflow-review-apply.ts`、`src/bin/specflow-review-design.ts`（handoff state 決定ロジック、`resultFromLedger` と autofix-loop 末尾）
  - `src/lib/review-runtime.ts`（`renderCurrentPhase` / `renderCurrentPhaseToStore` の apply / design 両 kind の next-action 判定）
  - `src/lib/review-ledger.ts`（`unresolvedCriticalHighCount` 追加、`unresolvedHighCount` 削除、関連呼び出しすべて新関数に置換）
  - `src/contracts/surface-events.ts`（payload に `schema_version` を導入。state 名・event 名は不変）
  - `src/contracts/commands.ts`（handoff ラベル意味のみ更新）
- **Affected guides / docs:**
  - `global/commands/specflow.review_apply.md`
  - `global/commands/specflow.review_design.md`
  - `global/commands/specflow.approve.md`（Quality Gate 解釈を HIGH+ 化、ledger.status の解釈変更を反映）
- **Specs:**
  - `openspec/specs/review-orchestration/spec.md`
  - `openspec/specs/slash-command-guides/spec.md`
  - `openspec/specs/surface-event-contract/spec.md`（Migration セクション追加）
- **Tests:**
  - `src/tests/generation.test.ts`（apply / design 両 review guide の state-mapping、Actionable Findings 定義、approve 選択肢配置 assertion）
  - `src/tests/specflow-run.test.ts`（apply_review → apply_ready / design_review → design_ready 遷移の severity-aware シナリオ）
  - `src/tests/surface-event-schema-drift.test.ts`（`schema_version` ハンドリング）
  - 既存 fixtures/ledger サンプルを HIGH=0 + MEDIUM/LOW 残存ケースで拡張
- **後方互換性:**
  - 状態機械の event 名と handoff state 名は変えないため、現行ランタイムの run state / ledger / 保存済み surface event との互換は維持。
  - 意味の変化は spec の Migration セクションで明示。`schema_version` 未設定 (= legacy) の保存済み surface event は読み取り側で `legacy_actionable_count_basis: true` として扱われる。
  - `unresolvedHighCount` を呼んでいた外部利用者は `unresolvedCriticalHighCount` への移行が必要（内部 helper のため影響範囲は本リポジトリ内のみ想定）。
