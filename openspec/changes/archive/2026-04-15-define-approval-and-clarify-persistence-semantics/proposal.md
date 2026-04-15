## Why

approval と clarify は現在、surface event contract でイベント形式が定義され、workflow-run-state で状態遷移が管理されているが、**永続化モデル**が未定義である。これらの interaction は単なる UI event ではなく、core における stop/resume point として機能するため、構造化された persistence semantics が必要。

永続化されていない現状では:
- Run history に approval/clarify の詳細が残らない（遷移記録のみ）
- clarify の question-response ペアが再構築不能
- external runtime が approval/clarify の状態を問い合わせる手段がない
- audit trail が不完全

## What Changes

- **Approval record schema**: approval request と decision を 1 つの record として永続化する。decision の値域は `approve` / `reject` の 2 値（actor-surface-model の gated decision に準拠）。未決定状態は decision フィールドが null で表現。
- **Clarify record schema**: clarify question と response を個別 Q&A ペア単位で永続化する。response 受信時点で自動的に resolved となる（明示的 resolution action は不要）。
- **Record-event cardinality**: 1 つの record に複数の event が紐づく N:1 関係。record_id を event 側が参照する。
- **Run history 拡張**: history entry に optional `record_ref` フィールドを追加し、persistence record への参照を持たせる。既存 history data との migration は不要（optional フィールドのため後方互換）。
- **InteractionRecordStore interface**: 専用の store interface を新設。`RunArtifactStore` とは責務を分離。query API は最小限（by run_id で全 record 一覧、by record_id で個別取得）。
- **Record 作成責務**: core runtime の transition handler が event 処理時に同期的に record を作成。event emission と record 作成が atomic。
- **Record lifecycle**: record は `.specflow/runs/<run_id>/records/` 配下に格納。run 削除時に cascade 削除される（run の子ディレクトリとして物理的に連動）。
- **Local + external runtime 対応**: `InteractionRecordStore` interface を通じて local filesystem 実装と将来の remote 実装の両方をサポート。

## Capabilities

### New Capabilities
- `approval-clarify-persistence`: approval request/decision と clarify question/response の永続化モデルを定義する。record schema（approval record: request + decision の N:1 event 関係、clarify record: question + auto-resolved response）、`InteractionRecordStore` interface（read by run_id / record_id、write、delete）、run history との関連付け（optional `record_ref`）、record lifecycle（run に cascade）、record 作成責務（core runtime transition handler で同期作成）を含む。storage location は `.specflow/runs/<run_id>/records/`。

### Modified Capabilities
- `workflow-run-state`: history entry schema に optional `record_ref` フィールドを追加。既存 data の migration は不要。
- `surface-event-contract`: event envelope または payload に `record_id` 参照フィールドを追加し、event と persistence record の N:1 関連を表現。

## Impact

- `src/core/` に `InteractionRecordStore` interface と record 型定義（`ApprovalRecord`, `ClarifyRecord`）を追加
- `.specflow/runs/<run_id>/records/` ディレクトリに approval/clarify record を永続化
- `LocalFsInteractionRecordStore` 実装を追加
- core runtime の transition handler に record 作成ロジックを追加
- surface-event-contract の TypeScript 型と JSON Schema に `record_id` reference を追加
- run history entry の型に optional `record_ref` を追加
- CLI entry point で `InteractionRecordStore` を生成・注入する wiring を追加
