## Context

approval と clarify の interaction は現在 surface event として発火し、workflow state machine で遷移が管理されるが、interaction の詳細（誰が何を判断したか、どの質問にどう回答したか）は永続化されていない。`RunHistoryEntry`（`src/types/contracts.ts`）は `from`, `to`, `event`, `timestamp` の 4 フィールドのみで、decision/response の内容を保持しない。

既存の store 体系は:
- `RunArtifactStore`（`src/lib/artifact-store.ts`）: run-state (`run.json`) の読み書き
- `ChangeArtifactStore`: change artifact（proposal, spec, design 等）の読み書き
- `LocalFsRunArtifactStore`（`src/lib/local-fs-run-artifact-store.ts`）: `.specflow/runs/<runId>/` 配下の filesystem 実装

core runtime（`src/core/run-core.ts`）は collaborator を全て引数で受け取る DI パターンを採用。`AdvanceDeps = { runs: RunArtifactStore, workflow: WorkflowDefinition }` のように型化されている。

## Goals / Non-Goals

**Goals:**
- `ApprovalRecord` と `ClarifyRecord` の型定義とスキーマを策定する
- `InteractionRecordStore` interface を新設し、既存の store 体系に並行して配置する
- `LocalFsInteractionRecordStore` を `.specflow/runs/<runId>/records/` 配下に実装する
- `advance` コマンドの transition handler で record 作成・更新を同期的に実行する
- `RunHistoryEntry` に optional `record_ref` を追加する
- surface event payload に `record_id` を追加する

**Non-Goals:**
- Remote / API ベースの `InteractionRecordStore` 実装（interface 定義のみ、実装は将来）
- Record の検索・フィルタリング API（list by run_id と read by record_id のみ）
- 既存 run history data の migration（optional フィールドのため不要）
- Approval delegation model の変更（既存 actor-surface-model に準拠）
- UI/surface 層での record 表示（core semantics のみ定義）

## Decisions

### D1: InteractionRecordStore を RunArtifactStore とは別 interface にする

**選択:** 新規 `InteractionRecordStore` interface を `src/lib/interaction-record-store.ts` に定義。

**代替案:** RunArtifactStore に `readRecord` / `writeRecord` メソッドを追加する。

**理由:** RunArtifactStore は run-state (`run.json`) 単体の読み書きに特化しており、artifact type は `RunArtifactRef` で固定されている。record は run 配下に複数存在し、record_id による個別アクセスが必要なため、API shape が異なる。責務分離により既存 store の変更を避け、breaking change リスクをゼロにする。

### D2: Record ファイルレイアウト

**選択:** `.specflow/runs/<runId>/records/<recordId>.json`

**代替案 A:** `.specflow/runs/<runId>/run.json` 内に records 配列として埋め込む → run.json が肥大化し、record 単独の atomic write が不可能。

**代替案 B:** `.specflow/records/<recordId>.json` で run 外に配置 → cascade delete が暗黙的にならず、孤立 record のリスク。

**理由:** run ディレクトリの子として配置することで、run 削除時に物理的に cascade 削除される。record 単位の JSON ファイルにより atomic write（write-to-temp + rename）が容易。

### D3: Record 作成は advance の transition handler で同期実行

**選択:** `src/core/advance.ts` の transition 処理中に `InteractionRecordStore.write(runId, record)` を呼び出す。record 作成（approval gate 進入、clarify 発行時）だけでなく、record 更新（approval decision、clarify response 受信時）も同じ transition handler で同期的に実行する。更新時は既存 record を `read()` で取得し、status / decided_at / decision_actor / answer / answered_at を更新し、event_id を event_ids に append して `write()` で上書きする。

**代替案:** event emitter → subscriber パターンで非同期に record を作成する。

**理由:** record と state transition の一貫性が最重要。非同期パターンでは transition 成功だが record 作成失敗というケースが発生し得る。同期実行により、record write が失敗した場合は transition 自体も失敗させられる。`AdvanceDeps` に `records: InteractionRecordStore` を追加する形で既存 DI パターンに自然に統合できる。

### D4: record_id の生成方式

**選択:** `<record_kind>-<runId>-<sequence>` 形式（例: `approval-my-feature-1-1`, `clarify-my-feature-1-3`）。sequence は run 内の record 連番。

**代替案:** UUID v4。

**理由:** run_id を含むことで record_id から所属 run が逆引き可能。kind prefix により record 種別が一目で判別可能。sequence により生成順が保証される。UUID は衝突回避には優れるが可読性に劣る。

### D5: AdvanceDeps の拡張方式

**選択:** `AdvanceDeps` に optional `records?: InteractionRecordStore` を追加。record を必要としない transition では records が undefined でも動作する。

**代替案:** 全 transition で records を required にする。

**理由:** 既存の advance 呼び出し元（テスト含む）を壊さない。record 作成が必要な transition（approval gate 入り、clarify 発行、decision/response 処理）でのみ records を参照する。undefined の場合は record 作成をスキップし、transition 自体は成功させる（後方互換）。

### D6: RunHistoryEntry の record_ref 追加方式

**選択:** `RunHistoryEntry` に optional `record_ref?: string` を追加。advance.ts の history entry 作成時（既存の lines 74-82 付近）に、record を作成した transition では record_id を設定する。

**理由:** optional フィールドなので既存データの migration 不要。JSON Schema 互換。RunHistoryEntry が `extends JsonMap` なので optional フィールド追加は型安全。

### D7: Surface event payload の record_id 追加方式

**選択:** 各 payload type（`ApprovalPayload`, `ClarifyRequestPayload`, `ClarifyResponsePayload`）に `record_id: string` を required として追加。`RejectPayload` には `record_id?: string` を optional として追加（pending ApprovalRecord が存在する場合のみ設定）。`ResumePayload` と `ReviewOutcomePayload` には追加しない。JSON Schema ファイルも更新。

**理由:** record が存在する event type のみに限定。reject は既存の pending approval record を参照する場合があるため optional で追加。resume と review outcome は interaction record を持たない（resume は suspend/resume の state 操作、review outcome は別の review-orchestration 管轄）。

## Risks / Trade-offs

### R1: advance の同期的 record write による性能影響
→ **Mitigation:** Record は小さな JSON ファイル（数 KB）の atomic write のみ。ローカルファイルシステムでは無視できるオーバーヘッド。将来の remote 実装では async 化を検討するが、interface は sync で定義し実装側で buffering する。

### R2: AdvanceDeps.records を optional にすることでの record 作成漏れ
→ **Mitigation:** record を必要とする transition を明示的にリスト化し、テストで records が undefined の場合にログ警告を出すことを検証する。CI で record-associated transition のテストが records injected で動くことを保証する。

### R3: record_id の命名規則変更時の互換性
→ **Mitigation:** record_id は opaque string として扱い、フォーマットへの依存を禁止する。生成は `generateRecordId()` ヘルパー関数に集約し、変更時は 1 箇所のみ。

### R4: 既存テストへの影響
→ **Mitigation:** AdvanceDeps.records は optional なので既存テストは変更不要。新規テストで record 作成・参照を網羅する。in-memory `InteractionRecordStore` 実装をテストヘルパーとして提供する。
