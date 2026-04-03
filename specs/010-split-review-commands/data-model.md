# Data Model: Split Review Commands

## Entities

### Review Command File (Markdown)

Each command file is a Claude Code slash command in `global/` directory:

| Field | Type | Description |
|-------|------|-------------|
| description (frontmatter) | string | Command description displayed in `/` menu |
| Prerequisites | section | Config check, speckit check, config sourcing |
| Review Logic | section | Read prompt, read artifacts, call Codex, parse JSON |
| Ledger Update | section | Write to review-ledger.json (impl only has full logic) |
| Handoff | section | AskUserQuestion with phase-specific options |

### Command File Names

| Command | File | Phase |
|---------|------|-------|
| `/specflow.spec_review` | `global/specflow.spec_review.md` | spec |
| `/specflow.plan_review` | `global/specflow.plan_review.md` | plan |
| `/specflow.impl_review` | `global/specflow.impl_review.md` | impl |

### Review Ledger JSON (existing schema, no changes)

```json
{
  "feature_id": "010-split-review-commands",
  "phase": "spec | plan | impl",
  "current_round": 1,
  "status": "all_resolved | in_progress | has_open_high",
  "max_finding_id": 0,
  "findings": [],
  "round_summaries": []
}
```

The `phase` field is already present. Set to "spec" or "plan" as appropriate — currently always "impl".

### Handoff Definitions Per Phase

**spec_review handoffs**:

| Label | Target Command | Description |
|-------|---------------|-------------|
| Plan に進む | `/specflow.plan` | Plan → Tasks を作成しレビュー |
| Spec を修正 | `/specflow.spec_fix` | Spec を修正し再レビュー |
| 中止 | `/specflow.reject` | 変更を破棄 |

**plan_review handoffs**:

| Label | Target Command | Description |
|-------|---------------|-------------|
| 実装に進む | `/specflow.impl` | 実装を実行しレビュー |
| Plan を修正 | `/specflow.plan_fix` | Plan/Tasks を修正し再レビュー |
| 中止 | `/specflow.reject` | 変更を破棄 |

**impl_review handoffs** (existing logic from specflow.impl.md):

Case A (auto-fix loop): unresolved high → auto-fix → Approve/Fix/Reject
Case B (manual): no high → Approve/Fix/Reject
Case C (error): error → Fix/Approve/Reject

## State Transitions

```
specflow → spec_review → [Plan に進む / Spec を修正 / 中止]
specflow.plan → plan_review → [実装に進む / Plan を修正 / 中止]
specflow.impl → impl_review → [Approve / Fix / Reject]
```

Each review command can also be invoked standalone (not from a flow command).
