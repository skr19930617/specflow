# Data Model: Codex impl re-review classification

## 既存エンティティ（002-review-ledger で定義済み）

本 feature は 002-review-ledger のデータモデルを基盤として使用する。変更点のみ記載。

## Entity: ReviewLedger（拡張）

ファイルパス: `specs/<issue-number>-<slug>/review-ledger.json`

### 追加フィールド

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| max_finding_id | integer | yes | 全レビューを通じて発行された最大の finding ID 番号。次回の新規 ID はここから +1 で採番する。既存 ledger に存在しない場合は findings から導出（findings も空なら 0） |

### 導出ルール

```
max_finding_id が存在しない場合:
  if findings.length > 0:
    max_finding_id = max(findings.map(f => extractNumber(f.id)))
  else:
    max_finding_id = 0

extractNumber("R1-F03") → 3  // 002 の ID 体系
extractNumber("F5") → 5       // 003 の ID 体系（re-review new_findings）
```

## Entity: ReReviewResponse（新規）

Codex re-review prompt の出力スキーマ。

```json
{
  "decision": "APPROVE",
  "resolved_previous_findings": [
    { "id": "R1-F01", "note": "null check added in commit abc" }
  ],
  "still_open_previous_findings": [
    { "id": "R1-F02", "severity": "high", "note": "still unresolved" }
  ],
  "new_findings": [
    {
      "id": "F3",
      "severity": "medium",
      "category": "testing",
      "file": "src/foo.test.ts",
      "title": "missing edge case test",
      "detail": "new test scenario not covered"
    }
  ],
  "summary": "1 resolved, 1 still open, 1 new finding",
  "ledger_error": false
}
```

### resolved_previous_findings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | 前回 ledger 内の finding ID |
| note | string | yes | 解決の概要（何がどう修正されたか） |

### still_open_previous_findings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | 前回 ledger 内の finding ID |
| severity | string | yes | 今回の re-review 時に Codex が再評価した現在の severity（high/medium/low） |
| note | string | yes | 未解決の状況説明 |

### new_findings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | 新規 ID（max_finding_id + 1 から連番、F{N} 形式） |
| severity | string | yes | high / medium / low |
| category | string | yes | correctness / completeness / quality / scope / testing / error_handling / forbidden_files / performance |
| file | string | yes | 対象ファイルパス |
| title | string | yes | finding タイトル |
| detail | string | yes | 詳細説明と修正方法 |

### トップレベル

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| decision | string | yes | APPROVE / REQUEST_CHANGES / BLOCK。全 currently open findings に基づく |
| resolved_previous_findings | array | yes | 解決済み findings |
| still_open_previous_findings | array | yes | 未解決 findings |
| new_findings | array | yes | 新規 findings |
| summary | string | yes | レビュー結果の要約 |
| ledger_error | boolean | yes | ledger JSON が不正だった場合 true。デフォルト false |

## Ledger 更新契約

### 初回レビュー後（specflow.impl.md）

```
Input: Codex initial review response { decision, findings[], summary }

Output: review-ledger.json
{
  "feature_id": "<branch-name>",
  "phase": "impl",
  "current_round": 1,
  "status": <導出>,
  "max_finding_id": max(findings.map(extractNumber)) || 0,
  "findings": findings.map(f => {
    ...f,
    "origin_round": 1,
    "latest_round": 1,
    "status": "new",
    "relation": "new",
    "supersedes": null,
    "notes": ""
  }),
  "round_summaries": [<round 1 summary>]
}
```

### Re-review 後（specflow.fix.md）

```
Input: ReReviewResponse + previous ledger

Output: updated review-ledger.json
{
  "current_round": prev.current_round + 1,
  "status": <再導出>,
  "max_finding_id": max(
    prev.max_finding_id,
    max(new_findings.map(extractNumber)) || 0
  ),
  "findings": [
    // resolved → status="resolved", latest_round=current
    ...prev.findings.filter(f => resolved_ids.includes(f.id))
      .map(f => { ...f, status: "resolved", latest_round: current_round }),
    // still_open → status="open", severity=再評価値, latest_round=current
    ...prev.findings.filter(f => still_open_ids.includes(f.id))
      .map(f => { ...f, status: "open", severity: rereview_severity, latest_round: current_round }),
    // new → 新規 finding レコード
    ...new_findings.map(f => ({
      ...f,
      origin_round: current_round,
      latest_round: current_round,
      status: "new",
      relation: "new",
      supersedes: null,
      notes: ""
    })),
    // override (accepted_risk/ignored) → status 保持
    ...prev.findings.filter(f => ["accepted_risk", "ignored"].includes(f.status))
  ],
  "round_summaries": [...prev.round_summaries, <new round summary>]
}

Special case: ledger_error == true
  max_finding_id = max(new_findings.map(extractNumber)) || 0
  findings = new_findings only (no carryover from corrupt ledger)
```
