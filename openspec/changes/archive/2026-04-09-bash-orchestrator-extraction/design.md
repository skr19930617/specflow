## Context

specflow の `review_apply` / `fix_apply` スラッシュコマンドは現在 ~580 行の markdown prompt で以下を制御している:

1. **Diff フィルタリング**: `specflow-filter-diff` 呼び出し、サマリー解析、空 diff チェック、行数警告
2. **Codex 呼び出し**: MCP server 経由で codex を呼び出し、レスポンス JSON をパース
3. **Ledger ライフサイクル**: 読み込み（破損復旧含む）、round カウンタ更新、finding マッチング（same/reframed/new の3段階）、max_finding_id 管理、バックアップ、永続化
4. **スコア集計**: severity 重み付けスコア、unresolved count、top-level status 導出
5. **Auto-fix ループ**: baseline snapshot → ラウンド反復 → 停止条件チェック（成功/最大ラウンド/divergence）
6. **Next-action 分岐**: actionable findings 数に基づくハンドオフ状態判定

これらはすべて LLM の prompt 解釈に依存しており、決定論的でテスト不能。既存の `bin/specflow-run` は状態遷移のみを管理し、review/fix フローには関与していない。

## Goals / Non-Goals

**Goals:**
- Apply 側の全制御フロー（diff → codex → ledger → score → loop → next-action）を `bin/specflow-review-apply` に移動
- Bash + jq で実装し、各関数を独立してテスト可能にする
- End-to-end 実行: オーケストレーターが全工程を実行し、最終結果を JSON で stdout に出力
- slash command を「Bash 呼び出し + 結果 JSON の UI 表示」のみの薄いラッパーに変換
- bats-core による単体テストで ledger 操作・スコア計算・ループ停止条件をカバー
- 既存のユーザー facing コマンドインターフェースは変更なし

**Non-Goals:**
- Design 側オーケストレーター（Phase 2）・Approve 側オーケストレーター（Phase 3）の実装
- specflow-run の状態遷移ロジック変更（サブコマンド追加のみ）
- Codex の review prompt 内容の変更
- review-ledger.json のスキーマ変更

## Decisions

### D1: オーケストレーターのサブコマンド構成

**選択**: 単一スクリプト `bin/specflow-review-apply` に 3 つのサブコマンドを持たせる

| サブコマンド | 用途 | CLI 形式 | 出力 |
|------------|------|---------|------|
| `review` | 初回レビュー: diff → codex → ledger 更新 → スコア → 結果 JSON | `specflow-review-apply review <CHANGE_ID>` | 結果 JSON (stdout) |
| `fix-review` | 修正後レビュー: diff → codex (re-review prompt) → ledger 更新 → スコア → 結果 JSON | `specflow-review-apply fix-review <CHANGE_ID> [--autofix]` | 結果 JSON (stdout) |
| `autofix-loop` | auto-fix ループ全体: baseline → (fix → re-review) × N → 結果 JSON | `specflow-review-apply autofix-loop <CHANGE_ID> [--max-rounds N]` | 結果 JSON (stdout) |

**CLI 引数ルール**:
- 第1引数は常にサブコマンド名（`review` / `fix-review` / `autofix-loop`）
- 第2引数は常に `CHANGE_ID`（必須）
- `--autofix` は `fix-review` サブコマンド専用フラグ（ハンドオフスキップ用、auto-fix ループ内から呼ばれる場合に使用）
- `--max-rounds N` は `autofix-loop` サブコマンド専用オプション（デフォルト: 4、range: 1〜10）

**代替案**: サブコマンドなしの単一エントリポイント → 却下。review と fix-review は Codex prompt が異なり、autofix-loop は複数ラウンドの反復を含むため、分離が自然。

**代替案**: 各機能を別スクリプトに分離 → 却下。共有ヘルパー（ledger 操作、スコア計算）が多く、1ファイル内で関数として共有する方がメンテナンス性が高い。

### D2: 結果 JSON スキーマ

**選択**: 全サブコマンドが統一的な結果 JSON を stdout に出力。ログ・進捗は stderr。

```json
{
  "status": "success | error",
  "action": "review | fix_review | autofix_loop",
  "change_id": "bash-orchestrator-extraction",
  "review": {
    "decision": "APPROVE | REQUEST_CHANGES | BLOCK",
    "summary": "...",
    "findings": [...],
    "rereview_mode": false
  },
  "ledger": {
    "round": 2,
    "status": "has_open_high | all_resolved | in_progress",
    "counts": { "total": 5, "open": 2, "new": 1, "resolved": 2, "overridden": 0 },
    "by_severity": { "high": {...}, "medium": {...}, "low": {...} },
    "round_summaries": [...]
  },
  "autofix": {
    "total_rounds": 3,
    "result": "success | max_rounds_reached",
    "round_scores": [...],
    "divergence_warnings": [...]
  },
  "handoff": {
    "state": "review_with_findings | review_no_findings | loop_no_findings | loop_with_findings",
    "actionable_count": 2,
    "severity_summary": "HIGH: 1, MEDIUM: 1"
  },
  "error": null
}
```

**理由**: slash command が結果 JSON をパースして UI 表示するだけで済む。テストでも JSON 出力を直接検証できる。

### D3: Codex CLI 呼び出し方式

**選択**: `codex --approval-mode full-auto -q "<prompt>"` で直接呼び出し

- プロンプトは一時ファイル (`/tmp/specflow-codex-prompt-XXXXX.md`) に書き出し、`codex --approval-mode full-auto -q "$(cat /tmp/specflow-codex-prompt-XXXXX.md)"` で実行
- レスポンスは stdout をキャプチャし、JSON パースを試みる
- パース失敗時は `review.parse_error = true` を結果 JSON に含め、raw レスポンスを `review.raw_response` に格納

**代替案**: MCP server 経由 → 却下。Bash から MCP を呼ぶのは複雑で、CLI 直接呼び出しの方がシンプル。

### D4: Ledger 操作の内部関数構成

**選択**: 以下の shell 関数に分割し、各関数を独立してテスト可能にする

| 関数 | 責務 |
|------|------|
| `ledger_read` | 読み込み + 破損復旧 (corrupt → bak → 新規作成) |
| `ledger_validate` | high-severity override の notes 必須チェック |
| `ledger_increment_round` | round カウンタ更新 + seq 初期化 |
| `ledger_match_findings` | 3段階マッチング (same → reframed → remaining) |
| `ledger_match_rereview` | re-review 分類結果の適用 (resolved/still_open/new) |
| `ledger_compute_summary` | round summary snapshot 生成 |
| `ledger_compute_status` | top-level status 導出 |
| `ledger_compute_score` | severity 重み付けスコア計算 |
| `ledger_backup_and_write` | バックアップ作成 + 原子的書き込み |

**理由**: 各関数が JSON in → JSON out のパイプラインで動作し、bats-core で個別テスト可能。

### D5: Auto-fix ループの fix 実行方式

**選択**: オーケストレーター内で `specflow.fix_apply` の代わりに、Codex CLI を直接呼び出して fix を実行

- auto-fix ループ内の fix ステップは「Codex に修正を依頼 → re-review」の繰り返し
- 現在の `specflow.fix_apply` は slash command 内で fix + re-review + ledger 更新を行うが、オーケストレーターではこれを直接制御
- fix 用プロンプトは `~/.config/specflow/global/prompts/` から読み込み

**理由**: slash command 経由だと LLM のコンテキスト内で再帰的に制御フローが実行され、非決定論的になる。Bash から直接 Codex CLI を呼ぶことで制御フローが確定的になる。

### D6: specflow-run への追加サブコマンド

**選択**: 以下のサブコマンドを `bin/specflow-run` に追加

| サブコマンド | 用途 |
|------------|------|
| `get-field <run_id> <field>` | run.json から特定フィールドを取得（読み取り専用） |

**理由**: オーケストレーターが run state から設定値（agents, issue metadata 等）を読み取るために必要。既存の `status` サブコマンドは全 JSON を返すが、特定フィールドのみ必要な場面が多い。

## Risks / Trade-offs

### [Risk] jq の複雑な finding マッチングロジック → メンテナンス困難化
**Mitigation**: 各 ledger 関数を小さく保ち、bats-core テストで入出力を固定。マッチングロジックは `ledger_match_findings` に集約し、テストケースで same/reframed/remaining の各パスをカバー。

### [Risk] Codex CLI 出力の JSON パース失敗 → ループ中断
**Mitigation**: パース失敗時は `parse_error: true` を結果 JSON に含め、slash command 側でフォールバック表示。auto-fix ループ中のパース失敗はそのラウンドをスキップし、次ラウンドに進む（最大3回連続失敗でループ中断）。

### [Risk] 既存 slash command との互換性 → ユーザー体験の断絶
**Mitigation**: 結果 JSON のスキーマを slash command が必要とする全情報（decision, findings, ledger summary, handoff state）を含むよう設計。UI 表示ロジックは slash command 側に残し、表示フォーマットは変更しない。

### [Risk] specflow-filter-diff の stdout/stderr 分離 → 既存動作との非互換
**Mitigation**: 既存の specflow-filter-diff のインターフェースはそのまま使用（diff → stdout, summary JSON → stderr redirect）。オーケストレーター内で既存と同じ呼び出しパターンを踏襲。

### [Trade-off] 単一スクリプト vs マイクロスクリプト群
単一スクリプトは行数が増えるが、共有関数のスコープが明確で import が不要。800行上限を超えた場合は ledger 関数を `lib/specflow-ledger.sh` に分離する。

## Appendix A: Divergence Detection and Stop Condition Rules

Auto-fix ループの停止条件と divergence 検出は以下の優先順位で評価される。最初にトリガーされた条件でループを停止する。

### Stop Conditions (優先順位順)

| Priority | Condition | Action | Result |
|----------|-----------|--------|--------|
| 1 (最優先) | `unresolved_high_count == 0` | ループ終了 | `result: "success"` |
| 2 | `autofix_round >= MAX_ROUNDS` かつ `unresolved_high_count > 0` | ループ終了 | `result: "max_rounds_reached"` |

### Divergence Warnings (警告のみ、停止しない)

| Type | Condition | When |
|------|-----------|------|
| `quality_gate_degradation` | `current_score > previous_score` | 毎ラウンド |
| `finding_re_emergence` | 前ラウンドで resolved になった high title が再度 unresolved で出現 | 毎ラウンド |
| `new_high_increase` | `current_new_high_count > previous_new_high_count` | round >= 2 のみ |

divergence warnings は記録のみ。ループを停止しない。ループ完了後のサマリーに表示される。

### Handoff State Decision Table

| Context | Condition | State | Primary Options |
|---------|-----------|-------|-----------------|
| 初回レビュー後 | `actionable_count > 0` | `review_with_findings` | Auto-fix / 手動修正 |
| 初回レビュー後 | `actionable_count == 0` | `review_no_findings` | Approve / 手動修正 / 中止 |
| ループ後 | `actionable_count == 0` | `loop_no_findings` | Approve / 手動修正 / 中止 |
| ループ後 | `actionable_count > 0` | `loop_with_findings` | Auto-fix 続行 / 手動修正 / Approve / 中止 |

`actionable_count` = `status ∈ {"new", "open"}` の finding 数。`accepted_risk`/`ignored` は actionable に含まない。

### Score Calculation

`score = Σ weight(severity)` for all findings where `status ∉ {"resolved"}`

| Severity | Weight |
|----------|--------|
| high | 3 |
| medium | 2 |
| low | 1 |

## Appendix B: Codex Parse-Failure Handling

### 初回レビュー / 修正レビュー (`review` / `fix-review`)

| Event | Action |
|-------|--------|
| Codex stdout が空 | `review.parse_error: true`, `review.raw_response: ""`, ledger 更新スキップ |
| Codex stdout が JSON パース失敗 | `review.parse_error: true`, `review.raw_response: "<raw>"`, ledger 更新スキップ |
| Codex が非ゼロ exit code | `status: "error"`, `error: "codex_exit_<code>"` |

slash command 側は `parse_error: true` の場合、raw_response をそのまま表示し、ユーザーに手動判断を委ねる。

### Auto-fix ループ (`autofix-loop`)

| Event | Action |
|-------|--------|
| fix ステップの Codex 失敗 | そのラウンドをスキップ、`consecutive_failures++` |
| re-review ステップの Codex 失敗 | そのラウンドをスキップ、`consecutive_failures++` |
| `consecutive_failures >= 3` | ループ中断、`result: "consecutive_failures"` |
| Codex 成功 | `consecutive_failures = 0` にリセット |
