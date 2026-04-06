<!-- Historical Migration
  Source: specs/001-current-truth/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: Current Truth Consolidator

**Feature Branch**: `001-current-truth`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "Phase 1: current truth を作る — spec / plan / tasks / review 結果を読んで、現時点の正式な作業状態を1枚にする"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate current.md draft from existing artifacts (Priority: P1)

A developer has completed a spec review (or plan review) via specflow. They run `/specflow.current` to generate a consolidated `current.md` that summarizes the authoritative state of the feature — what's decided, what's open, and what's next.

**Why this priority**: Without the current truth document, developers must mentally piece together information scattered across spec.md, plan.md, tasks.md, and review JSON results. This is the core value of the feature.

**Independent Test**: Can be tested by running `/specflow.current` after a spec review has been completed. The command reads all available artifacts and produces `specs/<feature>/current.md` with all mandatory sections populated.

**Acceptance Scenarios**:

1. **Given** a feature directory with spec.md and at least one completed Codex review result, **When** the user runs `/specflow.current`, **Then** a draft `current.md` is generated in the same feature directory containing all mandatory sections (Purpose, In scope, Out of scope, Current accepted spec, Open questions, Must-fix findings, Accepted risks, Deprecated/superseded points, Next gate, Implementation approach).
2. **Given** a feature directory with spec.md, plan.md, tasks.md, and review results, **When** the user runs `/specflow.current`, **Then** the draft incorporates information from all available artifacts, not just the spec.
3. **Given** no spec.md exists for the current feature, **When** the user runs `/specflow.current`, **Then** the command reports an error and stops.

---

### User Story 2 - Review diff before applying updates (Priority: P1)

After the draft is generated, the user sees a diff showing what changed compared to the previous `current.md` (or the full content if this is the first generation). The user must explicitly approve or reject the update.

**Why this priority**: The user explicitly requested a draft-then-approve workflow rather than fully automatic updates. This prevents AI-introduced drift and keeps the human as the authority on what constitutes the "truth."

**Independent Test**: Can be tested by running `/specflow.current` twice — once to create an initial current.md, then again after a plan review. The second run shows a diff of changes and waits for approval.

**Acceptance Scenarios**:

1. **Given** `current.md` does not yet exist, **When** the draft is generated, **Then** the full content is displayed for review and the user is asked to approve or reject via button UI.
2. **Given** `current.md` already exists, **When** a new draft is generated, **Then** a section-by-section diff is displayed showing additions, removals, and modifications, and the user is asked to approve or reject.
3. **Given** the user approves the draft, **When** the approval is confirmed, **Then** `current.md` is written (or updated) in the feature directory.
4. **Given** the user rejects the draft, **When** the rejection is confirmed, **Then** `current.md` is not modified and the user can provide feedback on what to change.

---

### User Story 3 - Automatic trigger after spec review and plan review (Priority: P2)

After a spec review (`/specflow` or `/specflow.spec_fix`) or plan review (`/specflow.plan` or `/specflow.plan_fix`) completes, the specflow commands offer an option to update current.md alongside the existing handoff choices.

**Why this priority**: The completion condition requires current.md to be updated after every spec review and plan review. Integrating it into the existing handoff flow makes adoption seamless.

**Independent Test**: Can be tested by running `/specflow` through a spec review, then verifying that "current.md を更新" appears as an additional option in the handoff buttons.

**Acceptance Scenarios**:

1. **Given** a spec review has just completed, **When** the handoff buttons are displayed, **Then** an additional option "current.md を更新" is available alongside existing choices (Plan に進む / Spec を修正 / 中止).
2. **Given** a plan review has just completed, **When** the handoff buttons are displayed, **Then** an additional option "current.md を更新" is available alongside existing choices (実装に進む / Plan を修正 / 中止).
3. **Given** the user selects "current.md を更新", **When** the action executes, **Then** `/specflow.current` is invoked and the draft → diff → approve flow runs before returning to the handoff selection.

---

### Edge Cases

- What happens when review results are not available (e.g., only spec.md exists, no review has been run)? The command generates current.md from available artifacts only, noting that no review has been conducted yet.
- What happens when there are multiple review iterations (spec_fix → re-review → plan → plan_fix → re-review)? Only the most recent review result for each phase (spec, plan) is used.
- What happens when the user runs `/specflow.current` from a branch that has no feature directory? The command reports "No feature directory found" and stops.
- What happens when the user rejects the draft and wants specific edits? The command asks for feedback and regenerates with the user's guidance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST read all available artifacts from the current feature directory (spec.md, plan.md, tasks.md) to generate the current truth document.
- **FR-002**: System MUST read the most recent Codex review results (from the conversation context or stored review outputs) for each completed phase.
- **FR-003**: System MUST generate a `current.md` file in the feature directory (`specs/<feature>/current.md`) containing all mandatory sections.
- **FR-004**: System MUST display the generated draft to the user before writing it to disk.
- **FR-005**: System MUST show a diff when updating an existing `current.md`, highlighting what changed per section.
- **FR-006**: System MUST wait for explicit user approval (via AskUserQuestion button UI) before writing or updating `current.md`.
- **FR-007**: System MUST allow the user to reject the draft and provide feedback for regeneration.
- **FR-008**: The existing specflow commands (`/specflow`, `/specflow.spec_fix`, `/specflow.plan`, `/specflow.plan_fix`) MUST offer "current.md を更新" as an additional handoff option after reviews complete.
- **FR-009**: System MUST use the standard specflow prerequisites check (`.specflow/config.env` and `.specify/` existence) before executing.
- **FR-010**: System MUST NOT automatically update current.md without human approval.

### Mandatory Sections in current.md

- **Purpose**: One-line summary of what this feature does and why.
- **In scope**: Bullet list of what is included in this feature.
- **Out of scope**: Bullet list of what is explicitly excluded.
- **Current accepted spec**: Summary of the current spec state (key requirements, acceptance criteria).
- **Open questions**: Unresolved items from reviews or clarifications that still need answers.
- **Must-fix findings**: Review findings with severity "high" that must be addressed before proceeding.
- **Accepted risks**: Known risks or trade-offs that have been acknowledged.
- **Deprecated / superseded points**: Items from earlier drafts that are no longer valid (tracks what changed and why).
- **Next gate**: What needs to happen next (e.g., "resolve open questions", "proceed to plan review", "begin implementation").
- **Implementation approach**: High-level approach from plan.md (if available), without code-level details.

### Key Entities

- **Feature Directory**: The `specs/<number>-<name>/` directory containing all artifacts for a feature.
- **Current Truth Document**: The `current.md` file that serves as the single authoritative snapshot of the feature's state.
- **Artifacts**: The source files (spec.md, plan.md, tasks.md) that current.md is derived from.
- **Review Results**: Codex review outputs (JSON with decision, findings, summary) from spec and plan reviews.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate a complete current truth document from available artifacts in a single command invocation.
- **SC-002**: The current truth document contains all 10 mandatory sections, each populated with content derived from actual artifacts (not placeholder text).
- **SC-003**: Users always see the draft content and explicitly approve before any file is written or modified.
- **SC-004**: After every spec review and plan review in the specflow workflow, the option to update current.md is available in the handoff UI.
- **SC-005**: When current.md already exists, users can see exactly what changed (per section) before approving the update.
- **SC-006**: The entire draft → review → approve cycle completes within a single conversation turn (no need to re-run commands).

## Assumptions

- Review results from Codex are available in the conversation context (since specflow commands run reviews within the same conversation). If review results are not available, the command will note this and generate current.md from file artifacts only.
- The `current.md` file follows the same exclusion rules as other spec artifacts (excluded from git commits via `.specify/` or `specs/` patterns, depending on project configuration).
- The command name will be `/specflow.current`. Alternative names (`/specflow.consolidate`, `/specflow.rebase`) were considered but `/specflow.current` most clearly conveys "show me the current truth."
- The diff display uses a section-by-section comparison rather than a raw text diff, making it easier for humans to review changes in context.
