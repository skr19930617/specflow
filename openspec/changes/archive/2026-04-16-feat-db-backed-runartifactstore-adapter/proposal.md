## Why

現在の `RunArtifactStore` は `LocalFsRunArtifactStore`（ファイルベース永続化）のみ実装されており、API は同期（sync）で定義されている。Server orchestrator 向けに DB 永続化（`DbRunArtifactStore`）が必要だが、DB I/O は本質的に非同期であるため、現在の同期インターフェースでは DB-backed 実装を直接満たせない。

`docs/architecture.md` の Repository Scope 方針により、DB vendor specifics はこの repo には含めない。この change は、**RunArtifactStore インターフェースを async 化し、DB-backed adapter が外部 repo で実装可能であることを保証する**ためのインターフェース移行とコントラクト整備をスコープとする。DB 実装自体は外部 repo で行う。

Parent Epic: skr19930617/specflow#127
依存: skr19930617/specflow#128 (RunState split) — 完了済み

## What Changes

- `RunArtifactStore` インターフェースを同期 → 非同期（Promise ベース）に移行する
- `ChangeArtifactStore` インターフェースも async 化する（インターフェース統一が目的。DB-backed ChangeArtifactStore の需要は現時点では未定だが、将来の拡張性と一貫性のため）
- 型付きエラー `ArtifactStoreError` を定義する（kind: `not_found`, `write_failed`, `conflict` 等 + message）。リトライ・ロールバック責務は adapter 側
- `LocalFsRunArtifactStore` / `LocalFsChangeArtifactStore` を async 実装に移行する（内部は同期 FS I/O のまま async wrapper）
- コアランタイム（`src/core/*`）の全関数を async に移行する
- CLI wiring layer（`src/bin/*`）を async 呼び出しに対応させる
- `CoreRunState` → DB テーブルスキーマへのマッピングガイダンスを文書化する（フィールド対応表 + vendor-neutral な推奨 SQL 型。正規化レベルや migration 戦略は含まない）
- RunArtifactStore conformance test suite を追加し、npm パッケージの一部としてエクスポートする（外部ランタイムが import して使用可能）
- `docs/architecture.md` の Adapter Contract Categories セクションで persistence contract の状態を "deferred-required" → "defined" に更新する

**BREAKING**: `RunArtifactStore` と `ChangeArtifactStore` のメソッドシグネチャが sync → async に変更。この repo 内の全消費者は同一 change で移行する。外部消費者向けの移行ガイドを docs に含める。

## Capabilities

### New Capabilities
- `run-artifact-store-conformance`: RunArtifactStore インターフェースの conformance test suite。正常系 CRUD + 基本異常系（not_found、write_failed）をカバー。並行アクセスやアトミシティの保証は adapter 側の責務であり、conformance test のスコープ外。npm パッケージとしてエクスポートし、外部ランタイムが import して自身の adapter を検証可能。

### Modified Capabilities
- `workflow-run-state`: RunArtifactStore / ChangeArtifactStore の async 化、ArtifactStoreError 型定義、DB-backing 要件の明示化
- `repo-responsibility`: architecture.md の persistence contract status を "deferred-required" → "defined" に更新
- `artifact-ownership-model`: ArtifactStore インターフェースの async 移行と型付きエラー契約を反映

## Impact

- `src/lib/artifact-store.ts` — RunArtifactStore / ChangeArtifactStore の async 化 + ArtifactStoreError 型定義
- `src/lib/local-fs-run-artifact-store.ts` — async 実装への移行
- `src/core/*` — 全コアランタイム関数の async 化
- `src/bin/*` — CLI wiring の async 対応
- `src/tests/*` — 全テストの async 対応 + conformance test suite の追加
- `src/lib/run-store-ops.ts` — async 化
- `docs/architecture.md` — persistence contract status の更新、CoreRunState → DB マッピングガイダンス
- `openspec/specs/workflow-run-state/` — async 要件の追加
- `openspec/specs/artifact-ownership-model/` — async インターフェース仕様の追加
