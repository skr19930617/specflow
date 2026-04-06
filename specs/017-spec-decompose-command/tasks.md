# Tasks: Spec Decompose Command

**Input**: Design documents from `/specs/017-spec-decompose-command/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No new project setup needed — this feature adds files to the existing specflow project.

- [x] T001 Create feature branch `017-spec-decompose-command` (already done via `/speckit.specify`)

**Checkpoint**: Feature branch ready.

---

## Phase 2: Foundational (Helper Script)

**Purpose**: Create the helper bash script that handles batch issue creation. This MUST be complete before the slash command can be implemented.

- [x] T002 Create `bin/specflow-create-sub-issues` bash script with argument parsing, `set -euo pipefail`, usage/help output, and stdin JSON input reading
- [x] T003 Implement input validation in `bin/specflow-create-sub-issues` — validate required fields per plan.md Data Contract: `parent_issue_number`, `repo`, `run_timestamp`, `sub_features[]` each with `phase_number`, `title`, `description`, `requirements`, `acceptance_criteria`, `phase_total`. Exit with error if validation fails (no GitHub calls made).
- [x] T004 Implement idempotent duplicate guard in `bin/specflow-create-sub-issues` — before creating each issue, search for existing issues containing the run-specific decomposition marker `decompose-{parent}-{run_timestamp}-phase-{N}` via `gh issue list --search "decompose-{parent}-{timestamp}-phase-{N}" --repo <repo> --json number`. If found, add to `created` array without re-creation. The `run_timestamp` ensures separate decomposition runs of the same parent create distinct issues.
- [x] T005 Implement phase label creation logic in `bin/specflow-create-sub-issues` — create ALL required phase labels upfront before any issue creation, using `gh label create "phase-N" --color <color> --force` for each phase number (idempotent). This is the authoritative label management per FR-005: the helper script is the sole creator of phase labels, and milestones are never created.
- [x] T006 Implement sequential issue creation logic in `bin/specflow-create-sub-issues` — after labels are created, for each sub-feature: (a) construct title as `"Phase {phase_number}: {title}"` per FR-005, (b) render issue body using the issue body template from plan.md (description, requirements, acceptance criteria, parent link, decomposition ID with run_timestamp) per FR-009, (c) create issue with `gh issue create --title "<title>" --body "<body>" --label "phase-{N}"`. Track created vs failed using the output schema.
- [x] T007 Implement summary comment posting in `bin/specflow-create-sub-issues` — use `gh issue comment <parent_number> --body "<formatted list of sub-issues>"` after all issues are created (skip if no issues were created)
- [x] T008 Implement JSON result output in `bin/specflow-create-sub-issues` — output strict JSON matching plan.md output schema: `{"created": [...], "failed": [...], "summary_comment_posted": bool, "parent_issue_number": int}`
- [x] T009 Implement partial failure handling in `bin/specflow-create-sub-issues` — on issue creation failure, continue with remaining issues, report partial result, exit with non-zero code if any failed

**Checkpoint**: Helper script complete and can create issues from JSON input.

---

## Phase 3: User Story 1 — Decompose Issue-Linked Spec (Priority: P1) MVP

**Goal**: Create the `/specflow.decompose` slash command that analyzes specs and creates sub-issues for issue-linked specs.

**Independent Test**: Run `/specflow.decompose` on a known large spec created from a GitHub issue. Verify sub-issues are created with correct phase prefixes, labels, descriptions, and parent issue comment.

### Implementation for User Story 1

- [x] T010 [US1] Create `global/specflow.decompose.md` with frontmatter (description), prerequisites check (speckit installed, specflow config, feature branch), and basic structure following existing specflow command patterns
- [x] T011 [US1] Implement Step 1 in `global/specflow.decompose.md` — read current spec via `check-prerequisites.sh --json --paths-only`, read `/tmp/specflow-issue.json` to determine if issue-linked. If issue-linked, validate parent issue accessibility via `gh issue view <number> --json state` — if unreachable/deleted, report error and stop; if closed, proceed normally (valid target per spec).
- [x] T012 [US1] Implement Step 2 in `global/specflow.decompose.md` — AI analysis instructions: instruct Claude to read the spec, identify independent functional areas, and determine one of three outcomes: (a) "decompose" — multiple independent areas found, output structured proposal matching plan.md input schema; (b) "no-action" — spec is well-scoped (single area or tightly coupled), skip to confirmation message "Spec is appropriately scoped"; (c) "no-clear-split" — areas are interconnected, recommend implementing as-is. Only outcome (a) proceeds to the proposal/confirmation step; (b) and (c) short-circuit to a report message without invoking the helper script.
- [x] T013 [US1] Implement Step 3 in `global/specflow.decompose.md` — present decomposition proposal as a formatted table via AskUserQuestion with Confirm/Cancel options
- [x] T014 [US1] Implement Step 4 in `global/specflow.decompose.md` — on user confirmation, construct JSON payload matching plan.md input schema and call `specflow-create-sub-issues` via Bash, piping JSON to stdin
- [x] T015 [US1] Implement Step 5 in `global/specflow.decompose.md` — parse JSON result (plan.md output schema) from helper script. If all succeeded, report created issues with URLs. If partial failure, present created vs failed items via AskUserQuestion with "Retry failed items" / "Cancel (keep created)" options. On retry, construct new payload with only failed items and re-invoke helper script.

**Checkpoint**: `/specflow.decompose` works end-to-end for issue-linked specs. Sub-issues created on GitHub with correct format.

---

## Phase 4: User Story 2 — Warn About Large Inline Specs (Priority: P2)

**Goal**: When the spec is from inline text (no parent issue), display a warning instead of creating issues.

**Independent Test**: Run `/specflow.decompose` on a spec created without an issue URL. Verify warning is displayed.

### Implementation for User Story 2

- [x] T016 [US2] Add inline-spec detection branch in `global/specflow.decompose.md` — if `/tmp/specflow-issue.json` does not exist or has no valid issue URL, branch to inline-spec flow
- [x] T017 [US2] Implement inline-spec AI analysis in `global/specflow.decompose.md` — instruct Claude to analyze the spec and determine if it contains multiple independent functional areas (same analysis as US1, but different outcome paths)
- [x] T018 [US2] Implement warning path in `global/specflow.decompose.md` — if AI analysis determines spec is too large, display warning message listing the identified functional areas and guidance on how to manually split into separate `/specflow` invocations
- [x] T019 [US2] Implement well-scoped path in `global/specflow.decompose.md` — if AI analysis determines the spec is at reasonable granularity (single functional area or tightly coupled), display confirmation message "Spec is appropriately scoped. No decomposition needed."

**Checkpoint**: `/specflow.decompose` correctly warns for inline specs and confirms well-scoped specs.

---

## Phase 5: User Story 3 — Confirm or Cancel (Priority: P3)

**Goal**: Ensure the confirm/cancel UX works properly before any GitHub operations.

**Independent Test**: Run `/specflow.decompose`, choose Cancel, verify no issues created.

### Implementation for User Story 3

- [x] T020 [US3] Verify and refine confirm/cancel AskUserQuestion flow in `global/specflow.decompose.md` — ensure Cancel exits cleanly with "No issues created" message, ensure no GitHub API calls are made when canceled

**Checkpoint**: Confirm/Cancel flow works correctly.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, documentation, and installation.

- [x] T021 [P] Add closed parent issue handling in `global/specflow.decompose.md` — proceed normally for closed issues (valid decomposition target)
- [x] T022 [P] Add deleted/unreachable parent issue handling in `global/specflow.decompose.md` — validate parent issue accessibility via `gh issue view <number>` before proceeding; report error and ask for valid URL if unreachable
- [x] T023 [P] Add "spec is well-scoped" path for issue-linked specs in `global/specflow.decompose.md` — if AI analysis determines no decomposition needed for an issue-linked spec, report and exit (distinct from inline well-scoped path in T019)
- [x] T024 [P] Update `CLAUDE.md` Active Technologies section with 017-spec-decompose-command entry
- [x] T025 Verify `specflow-install` picks up new files — test that `global/specflow.decompose.md` is copied to `~/.config/specflow/global/` and `bin/specflow-create-sub-issues` is installed to PATH
- [x] T026 Acceptance verification: test issue-linked flow end-to-end — run `/specflow.decompose` on a multi-area spec from a GitHub issue, verify sub-issues have correct phase-prefixed titles, phase labels, FR-009 mandatory sections, parent issue comment with ordered links
- [x] T027 Acceptance verification: test partial failure and retry — simulate API failure (e.g., rate limit), verify created issues retained, retry creates only missing issues without duplicates (idempotent guard)
- [x] T028 Acceptance verification: test edge cases — verify closed parent issue proceeds normally, deleted parent shows error, well-scoped spec shows "no decomposition needed", inline large spec shows warning

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Already complete.
- **Foundational (Phase 2)**: No external dependencies — can start immediately. BLOCKS Phase 3.
- **User Story 1 (Phase 3)**: Depends on Phase 2 (helper script).
- **User Story 2 (Phase 4)**: Depends on Phase 3 (adds branching to existing command).
- **User Story 3 (Phase 5)**: Depends on Phase 3 (refines existing UX).
- **Polish (Phase 6)**: Depends on Phases 3-5.

### User Story Dependencies

- **User Story 1 (P1)**: Requires helper script (Phase 2). Core feature.
- **User Story 2 (P2)**: Adds a branch to the command created in US1. Independently testable.
- **User Story 3 (P3)**: Refines UX from US1. Independently testable.

### Within Each Phase

- Phase 2: T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009
- Phase 3: T010 → T011 → T012 → T013 → T014 → T015
- Phase 4: T016 → T017 → T018, T019 (parallel)
- Phase 5: T020
- Phase 6: T021-T025 can run in parallel, then T026 → T027 → T028 (sequential verification)

### Parallel Opportunities

- Phase 2: T005 → T006 are sequential (labels must exist before issues can use them)
- Phase 4: T018 and T019 can run in parallel (warning vs well-scoped are independent paths)
- Phase 6: T021-T025 can run in parallel (different files/concerns)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Helper script
2. Complete Phase 3: Slash command for issue-linked decomposition
3. **STOP and VALIDATE**: Test on a real spec created from a GitHub issue
4. Deploy if ready

### Incremental Delivery

1. Phase 2 → Helper script ready
2. Phase 3 → Issue-linked decomposition works (MVP!)
3. Phase 4 → Inline spec warning added
4. Phase 5 → Confirm/Cancel UX polished
5. Phase 6 → Edge cases and installation verified

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The slash command is a single file (`global/specflow.decompose.md`) — tasks within US1 are sequential because they build on the same file
- Commit after each phase completion
