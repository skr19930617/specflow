<!-- Historical Migration
  Source: specs/007-current-phase/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: Issue-Local current-phase.md

**Feature Branch**: `007-current-phase`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "issue ローカルな current-phase.md を導入する"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Phase State Generation After Review (Priority: P1)

After an impl review completes, the system automatically generates `specs/<feature>/current-phase.md` containing the current phase state. This file provides next-phase Claude with a concise summary of where the feature stands, including phase, round, status, open high findings, accepted risks, latest changes, and the next recommended action.

**Why this priority**: This is the core value — without generation there is nothing to read. The review-ledger holds detailed state but is too verbose for quick consumption by the next phase.

**Independent Test**: Run an impl review workflow on a test feature and verify that `current-phase.md` is created with all required fields populated from the review-ledger data.

**Acceptance Scenarios**:

1. **Given** an impl review has just completed, **When** the review results are recorded, **Then** `specs/<feature>/current-phase.md` is generated with Phase, Round, Status, Open High Findings, Accepted Risks, Latest Changes, and Next Recommended Action fields.
2. **Given** no prior `current-phase.md` exists, **When** the first impl review completes, **Then** the file is created from scratch with all mandatory fields.
3. **Given** a `current-phase.md` already exists from a prior round, **When** a new impl review completes, **Then** the file is overwritten with the latest state.

---

### User Story 2 - Phase State Update After Fix (Priority: P1)

After a fix round completes (via `/specflow.fix`), the system updates `current-phase.md` after the Codex re-review has been parsed and the review-ledger updated. This reflects the new round, updated status, and any changes in open findings or accepted risks.

**Why this priority**: Fixes occur in a loop; each fix must update the state file so the next phase always has the latest snapshot. Without this, the file becomes stale after the first round.

**Independent Test**: Run a fix workflow on a feature that already has `current-phase.md` from a prior review, and verify the file is updated with incremented round and refreshed fields.

**Acceptance Scenarios**:

1. **Given** a fix has just completed and `current-phase.md` exists, **When** the fix review results are recorded, **Then** `current-phase.md` is updated with the new round number, updated status, and refreshed open findings list.
2. **Given** all high findings are resolved after a fix, **When** `current-phase.md` is updated, **Then** the Open High Findings field is empty or indicates none.

---

### User Story 3 - Next-Phase Commands Read current-phase.md (Priority: P2)

When a next-phase slash command (`/specflow.impl`, `/specflow.fix`, `/specflow.approve`) starts, it reads `specs/<feature>/current-phase.md` as input context. This gives the phase a quick orientation of the feature's current state without needing to parse the full review-ledger. (Future: `/specflow.plan` may also consume this file.)

**Why this priority**: This is the consumer side. Generation (P1) must exist first, but consumption is what delivers the value of faster orientation.

**Independent Test**: Start any consumer command on a feature with an existing `current-phase.md` and verify it reads and uses the file contents for context.

**Acceptance Scenarios**:

1. **Given** `current-phase.md` exists for a feature, **When** `/specflow.impl`, `/specflow.fix`, or `/specflow.approve` starts, **Then** the command reads the file and uses its contents as input context.
2. **Given** `current-phase.md` does not exist (e.g., first run before any review), **When** a consumer command starts, **Then** the command proceeds without error, treating the absence as a first-run scenario.

---

### Edge Cases

- What happens when `review-ledger.json` is empty or malformed? The system should generate `current-phase.md` with available data and note missing fields.
- What happens when a fix resolves all findings but introduces new ones? The file should reflect the net state after the fix review.
- What happens when multiple features are active simultaneously? Each feature has its own `current-phase.md` under its own `specs/<feature>/` directory — no cross-contamination.

## Clarifications

### Session 2026-03-31

- Q: current-phase.md のフォーマットは？ → A: Markdown key-value 形式（`- Key: Value` のリスト）
- Q: 生成・更新・読み取りを行うコマンドの範囲は？ → A: Producer: specflow.impl, specflow.fix / Consumer: specflow.impl, specflow.fix, specflow.approve。plan は将来対応。
- Q: Open High Findings の表示内容は？ → A: 件数 + タイトル一覧（例: `2 件 — "Missing input validation", "Race condition in handler"`）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate `specs/<feature>/current-phase.md` after each impl review completes (producer: `specflow.impl`). The trigger point is after the Codex review response has been parsed and the review-ledger has been updated.
- **FR-002**: System MUST update `specs/<feature>/current-phase.md` after each fix re-review completes (producer: `specflow.fix`). The trigger point is after the Codex re-review response has been parsed and the review-ledger has been updated — NOT after the code fix itself, but after the subsequent re-review.
- **FR-003**: The `current-phase.md` file MUST use Markdown key-value list format (`- Key: Value`) and contain at minimum: Phase, Round, Status, Open High Findings, Accepted Risks, Latest Changes, and Next Recommended Action.
- **FR-004**: The `current-phase.md` file MUST be derived from the `review-ledger.json` data and the latest review output.
- **FR-005**: The `specflow.impl`, `specflow.fix`, and `specflow.approve` commands MUST read `current-phase.md` when it exists and use it as context input (consumers).
- **FR-006**: Consumer commands (`specflow.impl`, `specflow.fix`, `specflow.approve`) MUST gracefully handle the absence of `current-phase.md` (first-run scenario).
- **FR-007**: Each generation or update of `current-phase.md` MUST overwrite the previous version entirely (no append).
- **FR-008**: The Open High Findings field MUST display the count and title list of open high-severity findings (e.g., `2 件 — "Missing input validation", "Race condition in handler"`).
- **FR-009**: The `current-phase.md` file is a **local working file** written by producer commands. It is NOT committed by the producer commands themselves. It is committed alongside other spec artifacts during the `/specflow.approve` flow (same as `review-ledger.json`). It MUST NOT be gitignored — it is tracked in git on the feature branch.

### Field Population Rules

Both producers (`specflow.impl` and `specflow.fix`) write `current-phase.md` at the same trigger point: **after the Codex review/re-review response is parsed and the review-ledger is updated**. There is always a fresh review result available at write time.

| Field | Authoritative Source | Derivation | Fallback Value |
|-------|---------------------|------------|----------------|
| Phase | `review-ledger.phase` + `review-ledger.current_round` | Round 1 → `impl-review`; Round ≥ 2 → `fix-review` | `impl-review` |
| Round | `review-ledger.current_round` | Direct read | `1` |
| Status | `review-ledger.status` | Direct read (`has_open_high`, `all_resolved`, `in_progress`) | `in_progress` |
| Open High Findings | `review-ledger.findings[]` | Filter findings where `severity == "high"` AND `status in ["new", "open"]` → count + titles. Excludes `accepted_risk` and `ignored`. | `0 件` |
| Accepted Risks | `review-ledger.findings[]` | Filter findings where `status in ["accepted_risk", "ignored"]` → titles + notes + status label | `none` |
| Latest Changes | Git commit log (committed only) | Most recent 5 commit subjects on the feature branch: `git log --oneline -5 $(git merge-base HEAD $BASE_BRANCH)..HEAD`. Capped at 5 lines. This field is commit-history-only; uncommitted work is not reflected. `$BASE_BRANCH` defaults to `main` (overridable via `.specflow/config.env`). | `(no commits yet)` |
| Next Recommended Action | Derived from Open High Findings count | If Open High Findings > 0 → `/specflow.fix`; if Open High Findings == 0 → `/specflow.approve`. This is derived from the filtered findings (excluding `accepted_risk`/`ignored`), NOT from `review-ledger.status` (which treats overrides as open). | `/specflow.fix` |

**Note on "Latest Changes":** This field is commit-history-only. It is derived deterministically from `git log --oneline -5 $(git merge-base HEAD $BASE_BRANCH)..HEAD`. In the specflow workflow, code is always committed BEFORE the Codex review runs (speckit.implement and specflow.fix both commit code, then invoke Codex review). Therefore, at `current-phase.md` write time, the relevant commits already exist. `$BASE_BRANCH` defaults to `main` but can be overridden via `.specflow/config.env`. Extending the review-ledger schema is NOT in scope for this feature.

**Note on "Status" vs "Next Recommended Action":** The `Status` field mirrors `review-ledger.status` directly, which treats `accepted_risk` and `ignored` high findings as still open (`has_open_high`). However, `Next Recommended Action` uses a different gating rule: it considers only truly open findings (`status in ["new", "open"]`), excluding overrides. This means Status may show `has_open_high` while Next Recommended Action shows `/specflow.approve` — this is correct and intentional when all high findings have been explicitly accepted or ignored.

**Note on "Accepted Risks":** This field lists findings with `status in ["accepted_risk", "ignored"]`, including their notes. This gives the next-phase Claude visibility into what was deliberately skipped and why.

### Key Entities

- **current-phase.md**: A concise, human-readable Markdown file summarizing the current state of a feature's development workflow. Located at `specs/<feature>/current-phase.md`.
- **review-ledger.json**: The detailed review state file that `current-phase.md` is derived from. Located at `specs/<feature>/review-ledger.json`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After every impl review, `current-phase.md` exists and contains all 7 mandatory fields.
- **SC-002**: After every fix round, `current-phase.md` reflects the updated round number and current findings state.
- **SC-003**: Next-phase commands that read `current-phase.md` can determine the feature's current phase, open issues, and recommended next action without consulting `review-ledger.json`.
- **SC-004**: The `current-phase.md` file is readable and actionable in under 10 seconds by a human or AI consumer.

## Assumptions

- The existing `review-ledger.json` structure provides sufficient data to populate 6 of 7 fields. "Latest Changes" is derived from git commit history (no review-ledger schema changes needed).
- The generation/update logic will be integrated into the existing specflow slash command scripts (`.specflow/` read-only config; implementation in slash commands and helper scripts).
- Initial scope: producers are `specflow.impl` and `specflow.fix`; consumers are `specflow.impl`, `specflow.fix`, and `specflow.approve`. `specflow.plan` is deferred for future work.
