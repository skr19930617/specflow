# Data Model: Review Ledger

## Entity: ReviewLedger

ファイルパス: `specs/<issue-number>-<slug>/review-ledger.json`

```json
{
  "feature_id": "002-review-ledger",
  "phase": "impl",
  "current_round": 2,
  "status": "has_open_high",
  "findings": [ /* Finding[] */ ],
  "round_summaries": [ /* RoundSummary[] */ ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| feature_id | string | yes | branch 名（例: "002-review-ledger"） |
| phase | string | yes | 常に "impl" |
| current_round | integer | yes | 最新の review ラウンド番号（1-indexed） |
| status | enum | yes | 導出値: "has_open_high" / "all_resolved" / "in_progress" |
| findings | Finding[] | yes | 累積 finding レコード配列 |
| round_summaries | RoundSummary[] | yes | ラウンドごとのスナップショット集計 |

### Status 導出ルール

```
if any(f.severity == "high" && f.status in ["open", "new"]) OR
   any(f.severity == "high" && f.status in ["accepted_risk", "ignored"]):
  → "has_open_high"
elif all(f.status == "resolved" for f in findings) OR len(findings) == 0:
  → "all_resolved"
else:
  → "in_progress"
```

## Entity: Finding

```json
{
  "id": "R1-F01",
  "origin_round": 1,
  "latest_round": 2,
  "severity": "high",
  "category": "correctness",
  "file": "src/main.ts",
  "title": "Missing null check",
  "detail": "Function foo() does not handle null input...",
  "status": "open",
  "relation": "same",
  "supersedes": null,
  "notes": ""
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | `R{round}-F{seq}` 形式（例: R1-F01）。origin_round のラウンド番号を使用 |
| origin_round | integer | yes | finding が初めて検出されたラウンド |
| latest_round | integer | yes | finding が最後に検出されたラウンド |
| severity | enum | yes | "high" / "medium" / "low" |
| category | string | yes | Codex review カテゴリ（correctness, completeness, quality 等） |
| file | string | yes | 対象ファイルパス |
| title | string | yes | finding のタイトル |
| detail | string | yes | finding の詳細説明 |
| status | enum | yes | "new" / "open" / "resolved" / "accepted_risk" / "ignored" |
| relation | enum | yes | "new" / "same" / "reframed" |
| supersedes | string? | no | reframed 時の元 finding ID。それ以外は null |
| notes | string | no | 手動 override 時の理由。high severity override 時は必須 |

### Status 値

| Status | 意味 |
|--------|------|
| new | 当該ラウンドで初めて検出（1 ラウンドのみ有効） |
| open | 2 ラウンド以上存在し未解決 |
| resolved | 消失 or reframed により解決 |
| accepted_risk | ユーザーが手動でリスク受容を記録 |
| ignored | ユーザーが手動で無視を記録 |

### Relation 値

| Relation | 意味 |
|----------|------|
| new | 初回検出、または前回 resolved 後の再出現 |
| same | 前ラウンドと同一（key マッチ） |
| reframed | severity 変更により再分類 |

## Entity: RoundSummary

```json
{
  "round": 2,
  "total": 5,
  "open": 2,
  "new": 1,
  "resolved": 1,
  "overridden": 1,
  "by_severity": {
    "high": { "open": 1, "resolved": 0, "new": 0, "overridden": 1 },
    "medium": { "open": 1, "resolved": 1, "new": 1, "overridden": 0 },
    "low": { "open": 0, "resolved": 0, "new": 0, "overridden": 0 }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| round | integer | yes | ラウンド番号 |
| total | integer | yes | ledger 内の全 finding 数（全 status 累積） |
| open | integer | yes | status=open の件数（スナップショット） |
| new | integer | yes | status=new の件数（スナップショット） |
| resolved | integer | yes | status=resolved の件数（スナップショット） |
| overridden | integer | yes | status=accepted_risk + ignored の件数（スナップショット） |
| by_severity | object | yes | severity 別の内訳（各値はスナップショット） |

## Matching Algorithm

### Input
- `existing_findings`: ledger の現在の findings（status が open / new のもの）
- `new_codex_findings`: Codex review が返した findings

### Algorithm

```
matched_existing = Set()
matched_codex = Set()

# Step 1: Same match (file + category + severity 完全一致)
for each codex_finding in new_codex_findings:
  candidates = existing_findings.filter(
    f.file == codex_finding.file &&
    f.category == codex_finding.category &&
    f.severity == codex_finding.severity &&
    f not in matched_existing
  )
  if candidates.length == 1:
    mark as same match
    matched_existing.add(candidate)
    matched_codex.add(codex_finding)

# Step 2: Disambiguate N:M by title
for each unmatched codex_finding:
  candidates = existing_findings.filter(same key, not matched)
  if candidates.length > 0:
    title_match = candidates.find(normalize(f.title) == normalize(codex_finding.title))
    if title_match:
      mark as same match
    else:
      pair with first unmatched candidate (index order)

# Step 3: Reframed match (file + category match, severity differs)
for each still-unmatched codex_finding:
  candidates = existing_findings.filter(
    f.file == codex_finding.file &&
    f.category == codex_finding.category &&
    f.severity != codex_finding.severity &&
    f not in matched_existing
  )
  if candidates.length > 0:
    mark as reframed (1:1 pairing, index order)

# Step 4: Remaining
unmatched codex findings → new findings
unmatched existing findings (open/new) → resolved (disappeared)
override findings (accepted_risk/ignored) → status preserved
```

### Title Normalization

```
normalize(title) = title.toLowerCase().replace(/\s+/g, ' ').trim()
```
