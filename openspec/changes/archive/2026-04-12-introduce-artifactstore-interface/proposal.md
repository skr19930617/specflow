## Why

残りの bin ファイル (`specflow-review-proposal`, `specflow-review-design`, `specflow-review-apply`, `specflow-prepare-change`, `specflow-analyze`) から直接パス構築 (`resolve(…, "openspec/changes", …)`) を除去し、`ChangeArtifactStore` 経由に移行する。`ChangeArtifactStore` と `RunArtifactStore` のインタフェース定義・LocalFs 実装・`specflow-run` への統合は完了済み。本変更のスコープは、これら 5 つの bin ファイルの直接パス構築を store 経由に統一することに限定する。

- Source: https://github.com/skr19930617/specflow/issues/96

## What Changes

- `specflow-review-proposal.ts`: `readFileSync`/`writeFileSync` + `resolve()` パス構築を `ChangeArtifactStore` の `read`/`write` に置換
- `specflow-review-design.ts`: 同上 — design/tasks/review-ledger アクセスを store 経由に移行
- `specflow-review-apply.ts`: 同上 — apply review ledger アクセスを store 経由に移行
- `specflow-prepare-change.ts`: `changeDir` パス構築を store 経由に移行。現在のコードは 2 段階で scaffold を検出する: (1) `existsSync(changeDir)` で change ディレクトリの存在を確認、(2) `existsSync(proposalPath)` で proposal ファイルの存在を確認。この 2 段階を store API でカバーするため、`ChangeArtifactStore` に `changeExists(changeId): boolean` を追加する。change ディレクトリ自体の作成は引き続き `openspec new change` コマンド経由で行う（store の責務外）
- `specflow-analyze.ts`:
  - `openspec/changes` の走査 → `ChangeArtifactStore.listChanges()` を追加して移行
  - `openspec/specs` の走査 → `ChangeArtifactStore` のスコープ外のため、本変更では直接 I/O を維持する。baseline spec の列挙は将来の `SpecStore` インタフェースの責務とし、本リファクタのスコープ外とする
- bin ファイルから直接パス構築 (`resolve(…, "openspec/changes", …)`) を除去

### specflow-prepare-change の change scaffold 検出フロー

現在のコード (`ensureChangeExists` + `ensureProposalDraft`) は 2 段階で動作する:

1. **change ディレクトリの存在確認**: `changeExists(changeId)` → `false` なら `openspec new change` でディレクトリを作成。change ディレクトリの作成は OpenSpec CLI の責務であり、store はこれをラップしない
2. **proposal ファイルの存在確認**: `exists({ changeId, type: "proposal" })` → `true` かつ内容が非空なら再利用。`false` または空なら seeded draft を `write({ changeId, type: "proposal" }, content)` で書き込む

この 2 段階により、「ディレクトリは作成済みだが proposal 未作成」のケース（プロセス中断時）も安全に処理される

## Capabilities

### New Capabilities

(なし — 新規 capability は追加しない)

### Modified Capabilities

- `artifact-ownership-model`: bin 層の change-domain artifact アクセスが ChangeArtifactStore 経由になることで、ownership model の「core modules SHALL depend on this interface, never on filesystem paths or I/O primitives directly」要件のカバレッジが拡大する。`listChanges(): readonly string[]` と `changeExists(changeId: string): boolean` を追加し、change 列挙・存在確認も interface 経由にする。baseline spec 列挙 (`openspec/specs`) は本変更のスコープ外

## Impact

- `src/bin/specflow-review-proposal.ts` — 直接 I/O を store 経由に置換
- `src/bin/specflow-review-design.ts` — 同上
- `src/bin/specflow-review-apply.ts` — 同上
- `src/bin/specflow-prepare-change.ts` — changeDir 構築を store 経由に移行、scaffold 検出セマンティクスを明確化
- `src/bin/specflow-analyze.ts` — `openspec/changes` 走査を store の listChanges に移行、`openspec/specs` 走査は直接 I/O を維持（スコープ外）
- `src/lib/artifact-store.ts` — `ChangeArtifactStore` に `listChanges()` と `changeExists()` を追加
- `src/lib/local-fs-change-artifact-store.ts` — `listChanges()` と `changeExists()` の LocalFs 実装を追加
- 既存テスト・CI には影響なし（振る舞い変更なし、内部リファクタのみ）
