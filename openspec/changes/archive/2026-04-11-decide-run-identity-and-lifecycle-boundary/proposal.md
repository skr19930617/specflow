## Why

run の identity（run_id, change_id, artifact identity）が local filesystem の命名規則と密結合しており、別リポジトリで DB-backed runtime を構築する際の障壁となっている。run の lifecycle semantics（start / complete / suspend / resume / retry）も local mode 前提の定義に留まっており、external runtime と共有可能な抽象レイヤーが欠落している。

- Source: https://github.com/skr19930617/specflow/issues/92

## What Changes

- run を「workflow instance」として明確に定義し、run_id と change_id を分離する
  - run_id: workflow instance の一意識別子（1つの change に複数の run が紐づく。retry 等）
  - change_id: artifact ディレクトリ名（human-readable slug、`openspec/changes/<change_id>/`）
- run_id / change_id / artifact identity の関係を整理し、filesystem 命名との結合を緩和する
- start / complete / suspend / resume / retry の lifecycle semantics を local mode 非依存で再定義する
- local mode と external runtime で共有される lifecycle semantics の仕様を策定する
- 現在の local runtime（specflow-run CLI, run.json）を新しい identity/lifecycle model に合わせてリファクタする

## Entity Definitions and Invariants

### Identity Model

| Entity | 定義 | 生成規則 | 例 |
|--------|------|----------|-----|
| change_id | artifact ディレクトリの human-readable slug | issue title や仕様記述から kebab-case で導出 | `add-user-auth` |
| run_id | workflow instance の一意識別子 | `<change_id>-<sequence>` 形式。sequence は同一 change_id に対する通番 | `add-user-auth-1`, `add-user-auth-2` |
| artifact identity | OpenSpec artifact のパス | `openspec/changes/<change_id>/` 配下に固定 | `openspec/changes/add-user-auth/proposal.md` |

### Ownership Rules

- 1つの change_id に対して N 個の run_id が存在しうる（retry, resume 等）
- 同一 change_id に対して同時にアクティブな run は 1 つのみ（排他制御）
- artifact は change_id に所属し、run をまたいで共有される（run は artifact を参照するが所有しない）
- run_id は run.json 内で明示的に保持し、ディレクトリ名からの導出に依存しない
- run.json の `change_name` フィールドが run → change のリンクを担う。`change_name` は `change_id` と同一値を持つ必須フィールド（`run_kind = "change"` の場合）であり、`openspec/changes/<change_name>/` でアーティファクトを解決する。`run_kind = "synthetic"` の場合は `change_name = null`（既存仕様を維持）

### Lifecycle Semantics

Lifecycle operations は 2 つのレイヤーに分かれる:

**Run-level events**（state machine event として既存 run に適用）:

| Event | 意味 | run_id への影響 | Artifact への影響 |
|-------|------|----------------|------------------|
| start | 新しい workflow instance を作成 | 新しい run_id を発行 | change_id の artifact を参照 |
| complete | workflow が最終状態（approved / rejected / decomposed）に到達 | run は terminal、新規 event 不可 | 変更なし |
| suspend | 実行中の run を一時停止（手動 or 外部要因） | status を `suspended` に変更 | 変更なし |
| resume | 停止中の run を再開 | status を `active` に戻す、current_phase は維持 | 変更なし |

**Change-level operations**（既存 run には適用せず、change_id に対して新しい run を作成）:

| Operation | 意味 | 前提条件 | 結果 |
|-----------|------|----------|------|
| retry | 同じ change_id に対して新しい run を作成し、前回の run から再開 | 前回の run が terminal（rejected を除く） | 新しい run_id を発行。前回の run は terminal のまま変更しない。新しい run は同じ change_id の artifact を引き続き参照する |

retry は state machine event ではない。terminal run に event を送ることはない。`specflow-run start <change_id> --retry` のように、change_id に対する新規 run 作成として実装する。

### Concurrency Invariant

**1 change_id につき非 terminal な run は最大 1 つ**（"one non-terminal run per change" rule）。

- 非 terminal = active または suspended
- `start`（新規 run 作成）の precondition: 同一 change_id に非 terminal な run が存在しないこと。suspended run がある場合は、先に resume → complete するか、reject で terminal にする必要がある
- `retry` の precondition: 同一 change_id のすべての run が terminal であること。かつ直近の run が `rejected` でないこと

### start の Precondition

| 条件 | 結果 |
|------|------|
| change_id に run が存在しない | 許可。新規 run を `proposal_draft` から開始 |
| change_id に active な run が存在する | 拒否。エラー: "Active run already exists" |
| change_id に suspended な run が存在する | 拒否。エラー: "Suspended run exists — resume or reject it first" |
| change_id のすべての run が terminal | 許可（ただし `--retry` フラグが必要） |

### retry の Precondition と Bootstrap 規則

| 条件 | 結果 |
|------|------|
| 直近の run が `approved` または `decomposed` | 許可。retry run を作成 |
| 直近の run が `rejected` | 拒否。エラー: "Rejected changes cannot be retried — create a new change" |
| 非 terminal な run が存在する | 拒否。エラー: "Non-terminal run exists" |

**retry 時の field copy/reset 規則:**

| フィールド | 動作 | 理由 |
|------------|------|------|
| run_id | 新規発行（`<change_id>-<next_seq>`） | 新しい workflow instance |
| change_name | コピー | 同じ change の artifact を参照 |
| current_phase | `proposal_draft` にリセット | workflow を最初からやり直す |
| status | `active` にリセット | 新しい run はアクティブ |
| allowed_events | `proposal_draft` の allowed events で初期化 | phase に応じて再計算 |
| history | 空配列にリセット（`previous_run_id` フィールドに前回 run_id を記録） | 新しい run の履歴は独立 |
| source | コピー | 同じソースから再試行 |
| project_id, repo_name, repo_path, branch_name, worktree_path | 再取得（現在の環境から） | 環境が変わっている可能性 |
| agents | コピー | 同じ agent 構成 |

**rejected を除外する理由:** rejected は意図的な中止を意味する。同じ change を再試行する意図がある場合は approved / decomposed 後の retry を使う。rejected 後に同じ要件を再試行したい場合は、新しい change_id で新規 proposal を作成する。

### Run Status と State の区別

| 分類 | 状態 | 意味 |
|------|------|------|
| **Terminal** | `approved`, `decomposed`, `rejected` | state machine の最終状態。event を受け付けない。run は不変 |
| **Suspended** | 任意の active 状態 + status=`suspended` | `suspend` event で到達。`resume` event でのみ復帰可能 |
| **Active** | 上記以外のすべての状態 + status=`active` | 通常の event transition が可能 |

注意: suspended は state machine の独立した状態ではなく、run の `status` フィールドで表現する。`current_phase` は suspend 前の値を保持し、resume 時にそこから再開する。

## Scope Boundaries

### In Scope

- identity model の仕様定義（run_id / change_id 分離、ownership rules）
- lifecycle semantics の仕様定義（run-level: suspend / resume、change-level: retry）
- local runtime のリファクタ: `specflow-run` CLI、`run.json` スキーマ、`.specflow/runs/` ディレクトリ構造
- `workflow-machine.ts` への suspend / resume events の追加（retry は state machine event ではなく change-level operation）

### Out of Scope（将来の別 change で対応）

- DB-backed runtime の実装（本仕様が設計基盤となるが、実装は別リポジトリ）
- external runtime adapter interface の定義
- 既存 run の自動マイグレーションツール

## Backward Compatibility

- **既存の `.specflow/runs/` データ**: 既存の run.json に `run_id` フィールドが存在しない場合、ディレクトリ名を run_id として自動補完する（読み取り時の fallback）
- **Breaking change**: `run_id` の生成規則変更により、新規 run のディレクトリパスが `<change_id>-<seq>` 形式に変わる
- **CLI 互換性**: `specflow-run start` は引き続き change_id を引数に取り、内部で run_id を自動発行する。既存のコマンド呼び出しパターンは変更不要
- **マイグレーション不要**: 既存 run は読み取り時 fallback で対応。新規 run のみ新しい形式で作成される

## Acceptance Criteria

1. run が「workflow instance」として定義され、run_id と change_id が明確に分離されている
2. run_id は `<change_id>-<sequence>` 形式で自動発行され、run.json 内に明示的に保存される
3. 1つの change_id に対して複数の run_id が存在でき、同時にアクティブな run は最大 1 つである
4. suspend / resume が workflow machine の run-level events として追加されている
5. suspend は任意のアクティブ状態から実行可能で、resume は suspended 状態（status=`suspended`）からのみ実行可能
6. retry は change-level operation として実装されている（state machine event ではない）。前回の run が terminal（rejected を除く）の場合に、同じ change_id に対して新しい run_id を発行し `proposal_draft` から再開できる
7. retry 時に `previous_run_id` が新しい run に記録され、source / change_name / agents がコピーされ、phase / history / status はリセットされる
8. 1 change_id につき非 terminal な run は最大 1 つであり、suspended run がある場合は start / retry が拒否される
9. 既存の run.json（run_id フィールドなし）は読み取り時に自動補完される（後方互換）
10. identity model と lifecycle semantics が openspec/specs/ にドキュメント化されている
11. specflow-run CLI が新しい identity/lifecycle model で動作する

## Capabilities

### New Capabilities
- `run-identity-model`: run_id / change_id / artifact identity の関係定義と、filesystem 非依存の identity resolution ルール。run_id と change_id の分離（1 change : N runs）、ownership rules、naming convention

### Modified Capabilities
- `workflow-run-state`: 既存の run-state 仕様に suspend / resume の run-level events と retry の change-level operation を追加し、lifecycle boundary を local mode 非依存で再定義する。run.json スキーマに run_id フィールドを追加し change_id との分離を反映する。既存 run の後方互換 fallback を定義する

## Impact

- `src/lib/workflow-machine.ts` — state machine v4.0 → v5.0: suspend / resume の run-level events を追加（retry は state machine event ではない）
- `src/bin/specflow-run.ts` — `start` コマンドで run_id 自動発行と `--retry` オプション追加、`suspend` / `resume` サブコマンド追加
- `.specflow/runs/` — ディレクトリ構造を `runs/<run_id>/run.json` に変更（run_id = `<change_id>-<seq>`）
- `src/types/contracts.ts` — RunState 型に run_id フィールド追加、status に `suspended` を追加
- 既存の specflow コマンド群 — run_id 解決ロジックの変更（CLI 引数の互換性は維持）
- 将来の DB-backed runtime — 本仕様の identity model と lifecycle semantics が設計基盤となる

