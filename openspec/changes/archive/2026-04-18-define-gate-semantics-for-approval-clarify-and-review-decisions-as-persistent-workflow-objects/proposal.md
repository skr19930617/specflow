## Why

specflow の workflow は、人間や AI agent が途中で入れ替わっても壊れないことが要件である。しかし現状、approval / clarify / review decision は「その場で誰かがボタンを押す」や「一時的な prompt 分岐」として扱われており、workflow core から見て「いま何が pending で、誰が何を決めるべきか」が first-class の object として定義されていない。

surface（CLI / UI / server runtime）が pending な判断を安定して表示・解決するためには、これらの gated decision を **workflow 上の persistent gate object** として semantics を定義する必要がある。

Source: [skr19930617/specflow#166](https://github.com/skr19930617/specflow/issues/166)

## What Changes

- approval-required / clarify-required / review-decision-required の 3 種類を統一的な **Gate** object として定義する。
- 各 Gate は `gate_id`, `gate_kind`, `originating_phase`, `reason` (短文)、`payload` (kind 別詳細), `eligible_responder_roles`, `allowed_responses`, `status` (`pending` | `resolved` | `superseded`), `event_ids` を持つ first-class object として扱う（`context` は独立フィールドを持たず、詳細は `payload` に格納）。
- `eligible_responder_roles` は `actor-surface-model` の role 集合として表現し、actor identity ではなく role セットで eligibility を記述する。
- **Concurrency rule**: `clarify` gate は同一 phase に複数同時 pending を許可する。`approval` / `review_decision` gate は phase ごとに同時 pending 1 つに制限する。pending approval / review gate がある間は次 phase に進まない。
- **Lifecycle**: `pending` → `resolved`（正常解決）と `pending` → `superseded`（同一 originating_phase で後続 gate が発行された場合）を定義する。superseded gate は pending にも resolved にも扱わず、履歴のみ保持される。
- **Allowed responses (固定, gate kind 単位)**:
  - `approval` → `accept` | `reject`
  - `clarify` → `clarify_response`
  - `review_decision` → `accept` | `reject` | `request_changes`
  範囲外の response は runtime がエラーとして拒否し、gate は pending のまま変化しない。
- **review_decision gate**: review round 完了ごとに 1 gate として発行する（個別 finding は gate の `payload.findings` として紐付く）。`proposal challenge`, `design review`, `apply review` いずれの review gate も `eligible_responder_roles = ["human-author"]` とする（ai-agent は review を生成するが gate は resolve しない）。
- **Persistence schema 置換 (BREAKING)**: `ApprovalRecord` / `ClarifyRecord` / `InteractionRecordStore` を廃止し、統一 `GateRecord` schema と `GateRecordStore` に置換する。`GateRecordStore` は `read` / `write` / `list` API のみ提供し、**`delete` API は提供しない**（run directory 削除時の cascade のみが物理的消去）。
- **Migration**: 既存 run の `.specflow/runs/<run_id>/records/*.json` は一回の migration で `GateRecord` schema に変換する。旧 schema の直読みサポートは持たず、migration 後のみをサポート対象とする。
- Gate の response → workflow event 変換、および `surface-event-contract` (history) との関係を仕様化する。

Non-goals: UI ボタン設計、transport / Web API 実装、delegated approval policy の詳細、review payload schema の全面再設計。

## Capabilities

### New Capabilities

- `workflow-gate-semantics`: workflow core が扱う「pending な gated decision」を Gate object として定義する capability。3 種類の gate kind（approval / clarify / review_decision）、lifecycle (`pending` / `resolved` / `superseded`)、gate kind ごとに固定された `allowed_responses` と invalid response のエラー動作、response → workflow event mapping、`eligible_responder_roles` (role セット)、concurrency rule (clarify 複数 OK / approval・review は phase 単位 1 gate)、review gate の粒度 (1 gate / review round) と human-author resolver rule、history との関係を規定する。surface-agnostic かつ actor-agnostic な semantics。

### Modified Capabilities

- `approval-clarify-persistence`: **BREAKING** — `ApprovalRecord` / `ClarifyRecord` を廃止し、統一 `GateRecord` schema に置換する。`GateRecord` は `gate_id`, `gate_kind` (`approval` | `clarify` | `review_decision`), `run_id`, `originating_phase`, `eligible_responder_roles`, `allowed_responses`, `status` (`pending` | `resolved` | `superseded`), `reason` (short string), `payload` (kind-specific, 例: clarify は question text / review_decision は findings), `created_at`, `resolved_at` (nullable), `decision_actor` (nullable), `event_ids` を持つ。`InteractionRecordStore` は `GateRecordStore` にリネームし、`read` / `write` / `list` のみを提供する（`delete` は廃止）。migration は旧 record を一度だけ GateRecord に変換し、旧 schema の直読みはサポートしない。
- `review-orchestration`: review round の結果を `review_decision` kind の Gate object として位置付ける。1 review round = 1 gate。findings は gate payload に格納し、review ledger は gate 解決の履歴として参照される。`proposal challenge`, `design review`, `apply review` の各 decision point を gate semantics に沿って説明し、いずれの gate も human-author が resolve することを明記する。

## Impact

- `openspec/specs/workflow-gate-semantics/` に新しい baseline spec が作られる（archive 後）。
- `openspec/specs/approval-clarify-persistence/` は `GateRecord` schema / `GateRecordStore` API への大幅改定（breaking）。既存の `.specflow/runs/<run_id>/records/*.json` データは migration が必須。
- `openspec/specs/review-orchestration/` は review decision を gate 化する差分が入る。
- core runtime (`specflow-run`) の transition handler は `GateRecord` を pending で作成し、`accept` / `reject` / `request_changes` / `clarify_response` で resolved へ遷移、同一 originating_phase の再発行時に旧 gate を `superseded` に遷移させる責務を持つ。invalid response はエラーとして返し gate は変化しない。
- review CLI (`specflow-challenge-proposal`, `specflow-review-design`, `specflow-review-apply`) は round 完了時に `review_decision` gate を発行する。
- `LocalFsInteractionRecordStore` → `LocalFsGateRecordStore` リネーム、CLI entry points の inject 先更新、および migration script が必要。
- concurrency rule 実装のため、gate 発行時に同 phase の既存 pending gate を検査するロジックを core runtime に追加する必要がある。
