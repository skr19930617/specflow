## Why

`RunArtifactStore` interface と `LocalFsRunArtifactStore` 実装は既に存在するが、`specflow-run` CLI および `run-identity.ts` ヘルパーは依然として `.specflow/runs/` を直接参照している。これにより、external DB-backed runtime が同じ contract を利用できない。store interface を CLI 層に統合し、直アクセスを隠蔽することで、file-backed と DB-backed の runtime が同じ contract を共有できるようにする。

- Source: https://github.com/skr19930617/specflow/issues/95

## What Changes

- `specflow-run.ts` の全サブコマンド (start, advance, status, suspend, resume, update-field, get-field) が `RunArtifactStore` 経由で state を読み書きするよう変更
- `specflow-prepare-change.ts` の run 検索ロジックが `RunArtifactStore.list()` 経由に変更
- `run-identity.ts` のヘルパー関数 (`findRunIdsForChange`, `findRunsForChange`, `findLatestRun`, `generateRunId`) を deprecated とし、`RunArtifactStore` を使う新しいユーティリティモジュール (`run-store-ops.ts`) で置換。この change で全呼び出し元を移行完了し、deprecated 関数は削除する。
- `specflow-run.ts` 内の `runsDir()` 直パス構築と `atomicWrite()` 直呼び出しを store adapter に委譲
- `artifact-phase-gates.ts` の `_runStore` パラメータを plumbing-only で使用開始（gate 判定ロジックの動作変更なし）

## Store Resolution and Guarantees

### Store の取得方法

CLI エントリポイント (`specflow-run.ts`, `specflow-prepare-change.ts`) が起動時に `LocalFsRunArtifactStore` をインスタンス化し、全サブコマンドに注入する。store の選択ロジックはこの change では固定（常に LocalFs）。将来の DB-backed 切り替えは別 change で対応する。

### RunArtifactStore 実装が満たすべき semantics

すべての `RunArtifactStore` 実装は以下を保証すること:

1. **Atomic writes**: `write()` は部分読み取りを発生させない。LocalFs は temp-file + rename で保証、DB-backed は transaction で保証する
2. **Consistent list**: `list()` は `RunArtifactQuery.changeId` が指定された場合、その changeId をプレフィックスに持つ全 runId を返す。未指定の場合は全 runId を返す
3. **Ordering**: `list()` の返却順序は runId の辞書順。latest-run の選択は呼び出し側 (`run-store-ops.ts`) が sequence number をパースして決定する
4. **Read-after-write consistency**: `write()` 完了後の `read()` は書き込んだ内容を必ず返す
5. **Idempotent exists**: `exists()` は read 可能性の判定のみ。副作用なし

## Acceptance Criteria

1. `specflow-run` の全サブコマンド (start, advance, status, suspend, resume, update-field, get-field) が `RunArtifactStore.read()` / `write()` / `exists()` / `list()` のみで state を操作すること
2. `specflow-prepare-change.ts` の run 検索が `RunArtifactStore.list()` 経由であること
3. `src/bin/specflow-run.ts` と `src/bin/specflow-prepare-change.ts` に `.specflow/runs` 文字列リテラルが存在しないこと
4. `src/lib/run-identity.ts` の全 export 関数が削除されていること（この change で移行完了）
5. `src/lib/run-store-ops.ts` が存在し、`findLatestRun`, `generateRunId`, `findRunsForChange`, `extractSequence` 相当の関数を `RunArtifactStore` パラメータで提供すること
6. run ID フォーマット (`<changeId>-<N>`) と latest-run 選択ルール（最大 sequence number）が変更されないこと
7. 既存の CLI 統合テスト (`artifact-store.test.ts`, `specflow-run` 関連テスト) が pass すること
8. `run-store-ops.ts` のユニットテストが `RunArtifactStore` の mock 実装で動作すること

## Migration Scope

### In-scope call sites（この change で移行する）

| ファイル | 移行内容 |
|---------|---------|
| `src/bin/specflow-run.ts` | `runsDir()`, `atomicWrite()`, `readFileSync()`, `existsSync()`, `readdirSync()` → store adapter |
| `src/bin/specflow-prepare-change.ts` | `runsPath` 直参照 → store.list() |
| `src/lib/artifact-phase-gates.ts` | `_runStore` パラメータの underscore 除去と型使用開始（plumbing only, gate 判定ロジック変更なし） |

### Out-of-scope

- DB-backed `RunArtifactStore` 実装の追加
- store 切り替えメカニズム（config-driven injection 等）
- `ChangeArtifactStore` の統合拡大（既に統合済み）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `workflow-run-state`: Run-state CLI が `RunArtifactStore` 経由で state を読み書きする requirement を完全実装する。spec 上は既に記述済みだが、CLI 実装が store を bypass している状態を解消する。

## Impact

- `src/bin/specflow-run.ts` — 全サブコマンドの I/O 層を store adapter に差し替え
- `src/bin/specflow-prepare-change.ts` — run 検索を store adapter 経由に変更
- `src/lib/run-identity.ts` — 全関数削除（呼び出し元を run-store-ops.ts に移行完了）
- `src/lib/run-store-ops.ts` — 新規作成。`RunArtifactStore` を受け取る高レベル操作
- `src/lib/artifact-phase-gates.ts` — `_runStore` → `runStore` に rename、型使用開始（plumbing only）
- テスト — 既存テストの更新 + run-store-ops のユニットテスト追加（mock store 使用）
