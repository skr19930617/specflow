# Feature Specification: Approval Summary Generation

**Feature Branch**: `006-approval-summary`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "approve 前に approval-summary.md を生成する"

## Clarifications

### Session 2026-03-30

- Q: "Spec Coverage" セクションは何を表すべきか？ → A: spec の受け入れ条件と実装ファイルの対応を示す（どの acceptance criteria がどのファイル変更でカバーされているかをマッピング表示する）。
- Q: "Remaining Risks" セクションの内容をどう決定するか？ → A: review-ledger の未解決 medium 以上の指摘 + diff から推測されるリスク（例: 新規ファイル追加でテスト未記載）を自動抽出する。
- Q: 生成後の表示と UX フロー → A: ファイルに書き出し + ターミナルに主要指標の要約を表示し、ユーザーが「続行」または「中止」を選択してから approve を進める。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Approval Summary Generation Before Approve (Priority: P1)

A developer has completed the specflow implementation cycle (spec → plan → impl → review) and is about to run `/specflow.approve`. Before the approve phase commits and creates a PR, the system automatically generates an `approval-summary.md` file in the feature's specs directory. The developer reads this summary to quickly understand what changed, whether all review issues are resolved, and what human checkpoints remain — without re-reading every review round.

**Why this priority**: This is the core value proposition. Without this, the developer must manually review the entire review-ledger.json to judge readiness, which is error-prone and time-consuming.

**Independent Test**: Can be tested by running the approve flow on a feature with a populated review-ledger.json and verifying that approval-summary.md is generated with all required sections before the commit step.

**Acceptance Scenarios**:

1. **Given** a feature with a review-ledger.json containing resolved and unresolved items, **When** the user runs `/specflow.approve`, **Then** an `approval-summary.md` is generated in `specs/<feature>/` before any commit or PR creation occurs.
2. **Given** a feature with no unresolved high-severity items, **When** the summary is generated, **Then** the summary clearly indicates zero unresolved high items and no blocking risks.
3. **Given** a feature with unresolved high-severity items, **When** the summary is generated, **Then** the summary clearly flags the count and details of unresolved high items.
4. **Given** the summary has been generated, **When** it is displayed, **Then** the terminal shows a concise summary of key metrics (unresolved high count, spec coverage rate, risk count) and prompts the user to choose "続行" or "中止" before proceeding with commit/PR.

---

### User Story 2 - Review Loop Summary with High-Severity Tracking (Priority: P1)

The developer needs to understand the review history at a glance: how many high-severity issues were raised initially, how many were resolved, how many remain, and how many new ones appeared in subsequent rounds. The Review Loop Summary section provides this breakdown so the developer can assess review convergence.

**Why this priority**: The review loop summary is the key decision-making data for whether to approve. Without it, the developer cannot assess if review quality improved over iterations.

**Independent Test**: Can be tested by creating a review-ledger.json with multiple review rounds containing high-severity items in various states, then verifying the summary correctly counts initial, resolved, unresolved, and newly introduced high items.

**Acceptance Scenarios**:

1. **Given** a review-ledger with 2 rounds where round 1 raised 3 high items and round 2 resolved 2 and introduced 1 new, **When** the summary is generated, **Then** the Review Loop Summary shows: initial high = 3, resolved high = 2, unresolved high = 2 (1 from round 1 + 1 new from round 2), new high in later rounds = 1.
2. **Given** a review-ledger with only 1 round, **When** the summary is generated, **Then** the Review Loop Summary shows initial high count and marks resolved/new as 0.

---

### User Story 3 - Human Checkpoints (Priority: P2)

The developer sees a concise list of 3–5 human checkpoints — items that automated review cannot fully validate and require manual human judgment. This helps the developer focus their manual review effort on the most impactful areas.

**Why this priority**: Automated review covers most issues, but certain aspects (UX decisions, business logic correctness, edge case judgment) need human eyes. Surfacing these explicitly saves time.

**Independent Test**: Can be tested by generating a summary for any feature and verifying that the Human Checkpoints section contains 3–5 actionable items derived from the spec, review findings, and files touched.

**Acceptance Scenarios**:

1. **Given** a completed feature with review data, **When** the summary is generated, **Then** the Human Checkpoints section contains between 3 and 5 items.
2. **Given** a feature summary, **When** the developer reads the checkpoints, **Then** each checkpoint is specific and actionable (not generic boilerplate).

---

### Edge Cases

- What happens when review-ledger.json does not exist or is empty? Warning-only: summary is generated with available data, review-dependent sections note "No review data available". User may still choose "続行".
- What happens when the spec file is missing? Warning-only: Spec Coverage section notes "Spec not found — coverage cannot be computed". Other sections generated normally. User may still choose "続行".
- What happens when review-ledger.json contains malformed data? Warning-only: affected sections note the parse error. User may still choose "続行". Terminal summary flags degraded sections.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate `approval-summary.md` in `specs/<feature>/` before any commit or PR creation during the approve phase.
- **FR-002**: The summary MUST include the following sections: What Changed, Spec Coverage, Review Loop Summary, Remaining Risks, Files Touched, Human Checkpoints.
- **FR-002a**: The Spec Coverage section MUST map each acceptance criterion from the spec to the implementation files that cover it (acceptance criteria × file mapping).
  - **Acceptance criteria definition**: The items listed under `Acceptance Scenarios` in each User Story section of `spec.md`. Each numbered `**Given**/**When**/**Then**` line is one criterion. If the spec has no `Acceptance Scenarios` subsections, fall back to `Functional Requirements` (each `FR-NNN` bullet = one criterion).
  - **Mapping method**: The criteria-to-file mapping is LLM-inferred. The LLM reads the spec's acceptance criteria and the `git diff main...HEAD` output, then judges which changed files are relevant to each criterion based on file names, diff content, and the criterion's description. This is a best-effort semantic mapping, not a deterministic rule.
  - **Coverage rule**: A criterion is "covered" if at least one changed file is mapped to it by the LLM.
  - **Output format**: The Spec Coverage section MUST render as a Markdown table: `| # | Criterion (summary) | Covered? | Mapped Files |` with one row per criterion.
  - **Spec coverage rate** displayed in the terminal summary is `covered criteria count / total criteria count` (e.g., "5/6 = 83%").
  - If the spec file is missing or contains no recognizable acceptance criteria, Spec Coverage reports "No criteria found" and coverage rate is omitted from the terminal summary.
- **FR-002b**: The Remaining Risks section MUST list:
  1. **Deterministic risks**: All unresolved medium-or-higher review items from review-ledger (sourced directly from findings with `status == "open"` or `status == "new"`, and `severity` of "medium" or "high"). These are extracted programmatically — no inference needed.
  2. **LLM-inferred risks**, limited to two heuristics:
     - **Untested new files**: New `.sh` or `.md` files in the diff (excluding `specs/*/spec.md`, `specs/*/plan.md`, `specs/*/tasks.md`, `specs/*/approval-summary.md`) whose file path does not appear in any review-ledger finding's `file` field. The LLM checks the finding `file` fields against the diff file list — this is a string-match lookup, not a semantic judgment.
     - **Uncovered criteria**: Acceptance criteria from FR-002a's coverage table that have `Covered? = No`. These are carried over directly from the Spec Coverage section — no additional inference.
- **FR-003**: The Review Loop Summary MUST include the following metrics, computed from the `findings` array in review-ledger.json. Each finding is counted exactly once by its current `status` — no deduplication or supersede-chain traversal is needed.
  - **Initial high**: `findings.filter(f => f.severity == "high" && f.origin_round == 1).length`
  - **Resolved high**: `findings.filter(f => f.severity == "high" && f.status == "resolved").length`
  - **Unresolved high**: `findings.filter(f => f.severity == "high" && (f.status == "open" || f.status == "new")).length`
  - **New high in later rounds**: `findings.filter(f => f.severity == "high" && f.origin_round > 1).length`
  - **Guaranteed schema fields per finding**: `id` (string, e.g. `"R1-F01"`), `origin_round` (integer), `severity` (`"high"|"medium"|"low"`), `status` (`"new"|"open"|"resolved"|"overridden"`).
  - **Example**: Given findings `[{id:"R1-F01", severity:"high", origin_round:1, status:"resolved"}, {id:"R1-F02", severity:"high", origin_round:1, status:"open"}, {id:"R2-F01", severity:"high", origin_round:2, status:"new"}]` → initial=2, resolved=1, unresolved=2, new_later=1.
- **FR-004**: The Human Checkpoints section MUST contain 3–5 actionable items that require human judgment.
- **FR-005**: The summary MUST clearly indicate whether unresolved high-severity items exist (e.g., a prominent warning or status indicator).
- **FR-006**: The system MUST read from the following inputs to generate the summary:
  - `specs/<feature>/review-ledger.json` — review findings and round summaries.
  - `specs/<feature>/spec.md` (= FEATURE_SPEC) — the feature specification. The path is resolved via `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` → `FEATURE_SPEC` field.
- **FR-006a**: Diff scope and preconditions for file-based sections:
  - The authoritative diff is `git diff main...HEAD` — all committed changes on the feature branch relative to main. This matches the scope that will be committed by `git add -A` in the approve flow.
  - **Precondition**: The approve flow already operates on the committed branch state (the existing `specflow.approve.md` runs `git add -A` at commit time). The summary generation step runs before the commit, so it captures all committed implementation changes. Uncommitted changes (if any) are not included in the summary — the diff reflects committed branch state only.
  - **Self-exclusion**: `specs/<feature>/approval-summary.md` MUST be excluded from What Changed, Files Touched, and diff-inferred risk heuristics, since it does not exist at diff-computation time (it is generated during this step). If a stale version exists from a prior approve attempt, it MUST still be excluded from diff-derived sections.
- **FR-006b**: The issue body (including its "対象" section) is NOT a runtime input to the approve flow. All summary generation relies solely on the review-ledger, spec file, and git diff. Issue context is considered only indirectly through the spec (which was derived from the issue during the specify phase).
- **FR-007**: Input availability determines approve gating behavior:
  - **review-ledger.json missing or empty**: Warning-only. Summary is generated with available data, Review Loop Summary and Remaining Risks sections display "No review data available". The user MAY still choose "続行".
  - **review-ledger.json malformed (parse error)**: Warning-only. Summary is generated, affected sections note the parse error. The user MAY still choose "続行".
  - **spec.md missing**: Warning-only. Spec Coverage section displays "Spec not found — coverage cannot be computed". The user MAY still choose "続行".
  - In all warning cases, the terminal summary MUST clearly flag which sections are degraded so the user can make an informed decision.
- **FR-008**: The generated `approval-summary.md` is a persistent file committed alongside other spec artifacts (review-ledger.json, spec.md) in `specs/<feature>/`. It is NOT part of the implementation diff because it is generated during the approve phase — after implementation is complete — and committed together with the approve commit. No special gitignore or deletion is needed; the file simply does not exist during implementation and is created only at approve time.
- **FR-009**: After generating the summary file, the system MUST display a concise terminal summary of key metrics and prompt the user to choose "続行" (proceed with approve) or "中止" (abort) before committing.

### Key Entities

- **approval-summary.md**: A Markdown file summarizing the approval readiness of a feature, generated from review-ledger data and spec content.
- **review-ledger.json**: The existing JSON file tracking all review rounds, their findings, severities, and resolution statuses.
- **Feature Spec (spec.md)**: The feature specification used to assess spec coverage in the summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The approval summary is generated in under 30 seconds for any feature with up to 10 review rounds.
- **SC-002**: The developer can determine unresolved high-severity status within 5 seconds of opening the summary.
- **SC-003**: The summary accurately reflects 100% of high-severity items from the review-ledger (no items missed or miscounted).
- **SC-004**: Human checkpoints are relevant to the specific feature (not generic templates), as judged by the developer.

## Assumptions

- The review-ledger.json follows the existing schema established in the 002-review-ledger feature.
- The approve phase (`/specflow.approve`) is the only entry point for generating this summary.
- The summary is regenerated fresh each time approve is run (not incrementally updated).
