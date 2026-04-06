# Data Model: spec/planレビューをimpl方式のレビュー台帳に統一する

## Review Ledger Files

### File Naming Convention

| Phase | File Name | Location |
|-------|-----------|----------|
| spec | `review-ledger-spec.json` | `specs/<feature>/` |
| plan | `review-ledger-plan.json` | `specs/<feature>/` |
| impl | `review-ledger.json` | `specs/<feature>/` (既存、変更なし) |

### JSON Schema (全phaseで共通)

```json
{
  "feature_id": "string (branch name)",
  "phase": "spec | plan | impl",
  "current_round": "integer (1-indexed)",
  "status": "has_open_high | all_resolved | in_progress",
  "max_finding_id": "integer",
  "findings": [
    {
      "id": "string (R{round}-F{seq:02d})",
      "origin_round": "integer",
      "latest_round": "integer",
      "severity": "high | medium | low",
      "category": "string (phase-dependent categories)",
      "file": "string (file path or N/A)",
      "title": "string",
      "detail": "string",
      "status": "new | open | resolved | accepted_risk | ignored",
      "relation": "new | same | reframed",
      "supersedes": "string | null",
      "notes": "string"
    }
  ],
  "round_summaries": [
    {
      "round": "integer",
      "total": "integer",
      "open": "integer",
      "new": "integer",
      "resolved": "integer",
      "overridden": "integer",
      "by_severity": {
        "high": { "open": 0, "resolved": 0, "new": 0, "overridden": 0 },
        "medium": { "open": 0, "resolved": 0, "new": 0, "overridden": 0 },
        "low": { "open": 0, "resolved": 0, "new": 0, "overridden": 0 }
      }
    }
  ]
}
```

### Phase-Dependent Categories

| Phase | Categories |
|-------|-----------|
| spec | ambiguity, completeness, contradiction, edge_case, assumption, scope |
| plan | completeness, feasibility, ordering, granularity, scope, consistency, risk |
| impl | correctness, completeness, quality, scope, testing, error_handling, forbidden_files, performance |

### Finding ID Format

`R{origin_round}-F{seq:02d}` — 例: `R1-F01`, `R2-F03`

- `origin_round`: findingが最初に検出されたラウンド番号
- `seq`: そのラウンド内での連番（`max_finding_id`から計算）

### Status Derivation Logic

```
if ANY finding has severity == "high" AND status in ["open", "new", "accepted_risk", "ignored"]:
  status = "has_open_high"
elif ALL findings have status == "resolved" OR findings is empty:
  status = "all_resolved"
else:
  status = "in_progress"
```

## Backup Files

| File | Purpose |
|------|---------|
| `review-ledger-spec.json.bak` | specレビュー台帳のバックアップ |
| `review-ledger-plan.json.bak` | planレビュー台帳のバックアップ |
| `review-ledger.json.bak` | implレビュー台帳のバックアップ（既存） |
| `review-ledger-*.json.corrupt` | 破損検出時のリネーム先 |

## Review Dashboard

### File: `specs/review-dashboard.md`

```markdown
# Review Dashboard

**Generated**: <timestamp>

| Feature | Spec Rounds | Spec Findings | Spec Rate | Plan Rounds | Plan Findings | Plan Rate | Impl Rounds | Impl Findings | Impl Rate |
|---------|-------------|---------------|-----------|-------------|---------------|-----------|-------------|---------------|-----------|
| 001-foo | 2           | 5             | 80%       | -           | -             | -         | 3           | 8             | 75%       |
| 002-bar | -           | -             | -         | -           | -             | -         | 1           | 3             | 100%      |
```

### Display Value Mapping

| State | Rounds | Findings | Rate |
|-------|--------|----------|------|
| Ledger file missing | `-` | `-` | `-` |
| Ledger exists, findings empty | `round_summaries.length` | `0` | `-` |
| Ledger exists, findings non-empty | `round_summaries.length` | `findings.length` | `resolved / total × 100%` |

## current-phase.md (拡張)

既存フォーマットに準拠。phaseフィールドのみ拡張:

| Review Type | phase value |
|-------------|-------------|
| spec初回レビュー | `spec-review` |
| spec再レビュー | `spec-fix-review` |
| plan初回レビュー | `plan-review` |
| plan再レビュー | `plan-fix-review` |
| impl初回レビュー | `impl-review` (既存) |
| impl再レビュー | `fix-review` (既存) |
