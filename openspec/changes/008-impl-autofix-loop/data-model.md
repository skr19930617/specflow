# Data Model: impl フェーズ auto-fix loop

## Existing Entities (read-only / extended)

### review-ledger.json

既存スキーマ — auto-fix loop はこのスキーマをそのまま使用する。新しいフィールドの追加は不要。

```
{
  "feature_id": string,       // e.g., "008-impl-autofix-loop"
  "phase": "impl",
  "current_round": number,    // ラウンドごとにインクリメント
  "status": string,           // "has_open_high" | "all_resolved" | "in_progress"
  "max_finding_id": number,   // finding ID の最大値
  "findings": [
    {
      "id": string,           // e.g., "R1-F01"
      "origin_round": number,
      "latest_round": number,
      "severity": "high" | "medium" | "low",
      "category": string,
      "file": string,
      "title": string,        // ★ auto-fix loop の照合キー
      "detail": string,
      "status": string,       // "new" | "open" | "resolved" | "accepted_risk" | "ignored"
      "relation": string,
      "supersedes": string | null,
      "notes": string
    }
  ],
  "round_summaries": [
    {
      "round": number,
      "total": number,
      "open": number,
      "new": number,
      "resolved": number,
      "overridden": number,
      "by_severity": {
        "high": { "open": number, "resolved": number, "new": number, "overridden": number },
        "medium": { "open": number, "resolved": number, "new": number, "overridden": number },
        "low": { "open": number, "resolved": number, "new": number, "overridden": number }
      }
    }
  ]
}
```

### Auto-fix Loop で使用するフィールド

| 用途 | フィールド | 説明 |
|------|-----------|------|
| ループ継続判定 | `status` | `"has_open_high"` → ループ継続候補 |
| 最大ラウンド判定 | `current_round` | 設定値と比較 |
| finding 同一性判定 | `findings[].title` | 完全一致で比較 |
| 同種 finding 判定 | `findings[].title` | 部分文字列包含（case-insensitive） |
| 解消判定 | `findings[].status` | `"resolved"` → 前ラウンドで解消済み |
| quality gate 算出 | `findings[].severity` + `findings[].status` | unresolved の severity 重み付け合計 |
| new high 件数 | `round_summaries[].by_severity.high.new` | 前ラウンドとの比較 |

## New Entity: config.env 設定項目

### SPECFLOW_MAX_AUTOFIX_ROUNDS

```bash
# .specflow/config.env に追加
# デフォルト: 4、許容範囲: 1〜10
# export SPECFLOW_MAX_AUTOFIX_ROUNDS=4
```

| 属性 | 値 |
|------|-----|
| 型 | 整数 |
| デフォルト | 4 |
| 最小値 | 1 |
| 最大値 | 10 |
| 範囲外の挙動 | デフォルト値 4 にフォールバック |
| 未設定の挙動 | デフォルト値 4 を使用 |

## Derived Values (runtime only)

### Severity Weight Score

```
score = Σ (weight(f.severity)) for f in findings where f.status ∉ {"resolved"}
weight("high") = 3, weight("medium") = 2, weight("low") = 1
```

### New High Count (per round)

```
new_high_count(round_n) = count of findings where:
  - severity == "high"
  - title does not exactly match any finding title from round_(n-1) ledger state
```

### Same-type Recurrence

```
recurrence = exists f_curr, f_prev where:
  - f_prev.status was "resolved" in round_(n-1)
  - f_prev.severity == "high"
  - f_curr.severity == "high"
  - f_curr.status ∈ {"new", "open"}
  - lowercase(f_curr.title) contains lowercase(f_prev.title)
    OR lowercase(f_prev.title) contains lowercase(f_curr.title)
```

## State Transitions

```
[impl review complete]
    │
    ▼
status == "has_open_high"? ──No──▶ [normal handoff]
    │Yes
    ▼
[auto-fix loop START]
    │
    ▼
┌─▶ [round_n: call specflow.fix]
│       │
│       ▼
│   [ledger updated by fix]
│       │
│       ▼
│   [divergence check]
│   ├── new_high_count increased? ──Yes──▶ [STOP: "new high 増加"]
│   ├── same-type recurrence? ──Yes──▶ [STOP: "同種 finding 再発"]
│   ├── severity score increased? ──Yes──▶ [STOP: "quality gate 悪化"]
│   │
│   ▼
│   unresolved high == 0? ──Yes──▶ [STOP: "成功"]
│       │No
│       ▼
│   current_round >= max_rounds? ──Yes──▶ [STOP: "最大ラウンド到達"]
│       │No
│       ▼
└───[next round]
```
