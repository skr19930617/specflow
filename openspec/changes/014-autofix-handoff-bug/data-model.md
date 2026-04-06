# Data Model: Auto-fix Handoff Bug Fix

**Branch**: `014-autofix-handoff-bug` | **Date**: 2026-04-05

## Entities

### Review Ledger (既存 — 変更なし)

`specs/<feature>/review-ledger.json` に格納される JSON ファイル。

```
review-ledger.json
├── phase: string ("impl")
├── round: number
├── status: string ("pending" | "approved" | "rejected")
├── findings[]: array
│   ├── id: string
│   ├── severity: "high" | "medium" | "low"
│   ├── title: string
│   ├── status: "new" | "open" | "resolved" | "accepted_risk" | "ignored"
│   └── notes: string (optional)
└── summary: string
```

**Severity 集計ロジック（新規）**:
- `actionable_findings` = findings where status ∈ {"new", "open"}
- severity 別にグループ化し件数をカウント
- 表示順: CRITICAL → HIGH → MEDIUM → LOW
- 0 件の severity は除外

### Auto-fix 確認プロンプト（新規 — AskUserQuestion パラメータ）

```
question: "レビュー指摘: {severity_summary}\nauto-fix を実行しますか？"
  where severity_summary = "CRITICAL: N, HIGH: M, ..." (0件除外、重要度順)
options:
  - label: "Auto-fix 実行"
    description: "自動修正を実行し、再レビューする"
  - label: "手動修正 (/specflow.fix)"
    description: "手動で修正した後に再レビューする"
```

**スキップ時のデフォルト動作**: 「手動修正 (/specflow.fix)」と同等に扱う

## 状態遷移

```
impl review 完了
  │
  ├─ actionable findings > 0
  │   │
  │   └─ AskUserQuestion 表示
  │       ├─ "Auto-fix 実行" → specflow.fix (autofix) → 再レビュー loop
  │       ├─ "手動修正" → 手動修正誘導メッセージ表示
  │       └─ スキップ/dismiss → 手動修正誘導メッセージ表示（デフォルト）
  │
  └─ actionable findings == 0
      └─ 承認フローへ遷移（auto-fix 確認なし）
```
