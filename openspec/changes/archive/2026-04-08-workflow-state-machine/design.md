## Context

specflow のワークフロー制御は現在 slash commands（`global/commands/` の Markdown プロンプト）とシェルスクリプト（`bin/`）に分散している。各コマンドが独自に「次に何ができるか」を判断しており、状態遷移の一元的な定義が存在しない。

既存の `bin/` スクリプト群は Bash + `jq` / `gh` で統一されている（例: `specflow-fetch-issue`, `specflow-init`）。新規スクリプトもこのスタックに従う。

## Goals / Non-Goals

**Goals:**
- メインラインフロー（proposal → design → apply → approve/reject）の状態遷移を静的 JSON で宣言的に定義する
- per-run の現在状態を `.specflow/runs/<run_id>/run.json` で追跡する
- `specflow-run` コマンド群（start / advance / status）で遷移を一元管理する
- 既存 slash commands と並行共存する（この change では既存コマンドを変更しない）

**Non-Goals:**
- Slack bot / dashboard の実装
- fix_design / fix_apply のサブステート定義（revise イベントのセルフ遷移で対応）
- 既存 slash commands の書き換え（後続 issue）
- explore / spec / decompose 等ユーティリティコマンドのステート定義

## Decisions

### 1. state-machine.json のスキーマ設計

**選択**: フラットな transitions 配列方式

```json
{
  "version": "1.0",
  "states": ["start", "proposal", "design", "apply", "approved", "rejected"],
  "events": ["propose", "accept_proposal", "accept_design", "accept_apply", "reject", "revise"],
  "transitions": [
    { "from": "start", "event": "propose", "to": "proposal" },
    { "from": "proposal", "event": "accept_proposal", "to": "design" },
    { "from": "proposal", "event": "reject", "to": "rejected" },
    { "from": "design", "event": "accept_design", "to": "apply" },
    { "from": "design", "event": "revise", "to": "design" },
    { "from": "design", "event": "reject", "to": "rejected" },
    { "from": "apply", "event": "accept_apply", "to": "approved" },
    { "from": "apply", "event": "revise", "to": "apply" },
    { "from": "apply", "event": "reject", "to": "rejected" }
  ]
}
```

**代替案**: 状態ごとにネストしたオブジェクト形式（`{ "start": { "propose": "proposal" } }`）。
**選択理由**: フラット配列は `jq` でのフィルタリング（`select(.from == "design")`）が容易で、拡張時の diff が最小。ネスト形式は人間の可読性がやや高いが、遷移の追加・削除時に構造変更が必要。

### 2. run.json のスキーマ設計

```json
{
  "run_id": "workflow-state-machine",
  "change_name": "workflow-state-machine",
  "current_phase": "start",
  "status": "active",
  "allowed_events": ["propose"],
  "issue": null,
  "created_at": "2026-04-08T12:00:00Z",
  "updated_at": "2026-04-08T12:00:00Z",
  "history": []
}
```

**選択**: `allowed_events` を run.json に含める（遷移時に再計算）。
**代替案**: `allowed_events` を省略し、消費側が state-machine.json から毎回計算する。
**選択理由**: run.json を読むだけで「今何ができるか」がわかり、消費側の実装が簡潔になる。トレードオフとして run.json が state-machine.json と非同期になるリスクがあるが、advance 時に必ず再計算するため実質的な問題にはならない。

### 3. specflow-run コマンドの構成

単一スクリプト `bin/specflow-run` にサブコマンド方式で実装する。

```
specflow-run start <run_id> [--issue-url <url>]
specflow-run advance <run_id> <event>
specflow-run status <run_id>
```

**選択**: 単一ファイル + サブコマンド。
**代替案**: `specflow-run-start`, `specflow-run-advance`, `specflow-run-status` の3ファイル。
**選択理由**: 共通処理（パス解決、JSON 読み書き、state-machine ロード）の重複を避ける。既存の `openspec` CLI もサブコマンド方式を採用しており、一貫性がある。

### 4. ファイル書き込みのアトミック性

**選択**: 一時ファイルに書き込み → `mv` でリネーム。

```bash
tmp="$(mktemp "${RUN_DIR}/run.json.XXXXXX")"
echo "$new_state" > "$tmp"
mv "$tmp" "${RUN_DIR}/run.json"
```

**選択理由**: POSIX の `mv` は同一ファイルシステム内でアトミックであり、部分書き込みによる破損を防ぐ。Bash + jq 環境で追加依存なしに実現できる最もシンプルな方法。

### 5. Issue メタデータの取得

`specflow-run start --issue-url <url>` が指定された場合、既存の `specflow-fetch-issue` コマンドを利用して issue メタデータ（title, number, repo）を取得する。

```bash
issue_json="$(specflow-fetch-issue "$ISSUE_URL")"
```

`specflow-fetch-issue` は `gh issue view` を内部で呼び出し、`number`, `title`, `url`, `author` 等を JSON で返す。`specflow-run` はこの出力から必要なフィールドを `jq` で抽出し、`run.json` の `issue` オブジェクトに格納する。

**エラーハンドリング**:
- `specflow-fetch-issue` が非ゼロ終了 → `specflow-run start` も exit code 1 で終了し、stderr にエラーメッセージを出力
- 無効な URL（`/issues/` パターンに一致しない） → `specflow-fetch-issue` が検出しエラーを返す

### 6. ディレクトリ構成

```
global/workflow/
  state-machine.json          # 静的ワークフロー定義（git 管理）

bin/
  specflow-run                # 遷移コアコマンド（git 管理）

.specflow/runs/<run_id>/
  run.json                    # per-run 状態（.gitignore 対象）
```

## Risks / Trade-offs

- **[Risk] state-machine.json と既存 slash commands の乖離** → slash commands を変更しないため、定義と実際の挙動が一致しない期間が生じる。Mitigation: state-machine.json にコメントとして「この定義は新 transition-core 用。既存 slash commands は独立して動作」と記載し、後続 issue で統合する。
- **[Risk] run.json の破損・不整合** → アトミック書き込み（mktemp + mv）で部分書き込みリスクを軽減。万一破損した場合は `specflow-run start --force` で再初期化可能にする（初期スコープ外だが、設計上の余地は残す）。
- **[Risk] jq の可用性** → macOS では Homebrew、Linux では apt/yum で一般的に利用可能。既存スクリプトでは直接 jq を使っていないが、`openspec` CLI が JSON 出力を前提としており、jq は事実上の必須ツール。README に前提条件として記載する。
- **[Trade-off] allowed_events の冗長保持** → run.json が state-machine.json と非同期になる可能性。advance 時に必ず state-machine.json から再計算するため、実質的に safe。

## Open Questions

- 将来的に `.specflow/runs/<run_id>/slack.json` 等の UI バインディングファイルを追加する場合、run.json 側に参照を持たせるか完全に分離するか（この change のスコープ外だが、ディレクトリ構造に影響する可能性がある）
