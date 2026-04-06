<!-- Historical Migration
  Source: specs/020-openspec-migration/tasks.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Tasks: OpenSpec Migration

**Input**: Design documents from `/specs/020-openspec-migration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Prepare the migration infrastructure

- [x] T001 Create migration script skeleton at `bin/specflow-migrate-openspec.sh` with argument parsing, usage help, and dry-run mode
- [x] T002 Create OpenSpec convention README template at `template/openspec/README.md` explaining the directory structure and how to create specs/changes

---

## Phase 2: Foundational (Migration Script)

**Purpose**: Build the core migration script (FR-007) — BLOCKS all subsequent phases

**CRITICAL**: No migration or command updates can begin until this phase is complete

- [x] T003 Implement directory creation logic in `bin/specflow-migrate-openspec.sh` — create `openspec/specs/` and `openspec/changes/` if they don't exist
- [x] T004 Implement file mapping logic in `bin/specflow-migrate-openspec.sh` — spec.md→proposal.md (with Historical Migration header), plan.md→design.md, tasks.md→tasks.md, other files as-is
- [x] T005 Implement atomic migration pattern in `bin/specflow-migrate-openspec.sh` — `.migrating/` temp directory, atomic rename, source cleanup
- [x] T006 Implement 3-state idempotence detection in `bin/specflow-migrate-openspec.sh` — fully migrated (skip), partial (.migrating/ cleanup + re-migrate), conflict (re-migrate from source)
- [x] T007 Implement summary output in `bin/specflow-migrate-openspec.sh` — report migrated/skipped/recovered counts
- [x] T008 Implement `specs/` directory removal in `bin/specflow-migrate-openspec.sh` — remove only after all entries are migrated

**Checkpoint**: Migration script ready — can now test on fixtures

---

## Phase 3: User Story 1a — Test Migration Script (Priority: P1, Part 1)

**Goal**: Validate migration script correctness and atomicity using a test fixture before running on real data

**Independent Test**: Script produces correct output on fixture data, handles failures gracefully, and is idempotent

- [x] T009 [US1] Create a temporary test fixture with 2-3 sample `specs/<NNN>-<name>/` directories containing spec.md, plan.md, tasks.md, and misc artifacts
- [x] T010 [US1] Run `bin/specflow-migrate-openspec.sh` on the fixture — verify all entries migrated correctly to `openspec/changes/` with proper file mapping and Historical Migration headers
- [x] T011 [US1] Verify idempotence — re-run on the fixture and confirm summary shows all entries skipped, no duplicates
- [x] T012 [US1] Verify failure recovery — simulate partial migration by creating a `.migrating/` temp directory, then re-run and confirm it cleans up and completes correctly
- [x] T013 [US1] Verify end-state assertions — confirm `openspec/specs/` exists and is empty (not deleted), `openspec/changes/` has correct count, old `specs/` is removed
- [x] T014 [US1] Clean up test fixture after validation

**Checkpoint**: Migration script is validated. Safe to prepare remaining updates before cutover.

---

## Phase 4: User Story 3 — Re-scope Specflow Commands (Priority: P3)

**Goal**: Audit all 13 `global/specflow*.md` commands and update path references BEFORE cutover

**Independent Test**: All remaining specflow commands reference `openspec/` paths and function correctly against the new directory structure

- [x] T015 [US3] Create command-audit.md at `openspec/changes/020-openspec-migration/command-audit.md` — list all 13 commands with keep/modify/remove classification and rationale
- [x] T016 [P] [US3] Update `global/specflow.md` — replace `specs/` path references with `openspec/changes/` and update workflow description
- [x] T017 [P] [US3] Update `global/specflow.approve.md` — replace `specs/` path references with `openspec/changes/`
- [x] T018 [P] [US3] Update `global/specflow.fix.md` — replace `specs/` path references with `openspec/changes/`
- [x] T019 [P] [US3] Update `global/specflow.impl.md` — replace `specs/` path references with `openspec/changes/`
- [x] T020 [P] [US3] Update `global/specflow.impl_review.md` — replace `specs/` path references with `openspec/changes/`
- [x] T021 [P] [US3] Update `global/specflow.plan.md` — replace `specs/` path references with `openspec/changes/`
- [x] T022 [P] [US3] Update `global/specflow.plan_fix.md` — replace `specs/` path references with `openspec/changes/`
- [x] T023 [P] [US3] Update `global/specflow.plan_review.md` — replace `specs/` path references with `openspec/changes/`
- [x] T024 [P] [US3] Update `global/specflow.reject.md` — replace `specs/` path references with `openspec/changes/`
- [x] T025 [P] [US3] Update `global/specflow.setup.md` — replace `specs/` path references with `openspec/changes/`
- [x] T026 [P] [US3] Update `global/specflow.spec_fix.md` — replace `specs/` path references with `openspec/changes/`
- [x] T027 [P] [US3] Update `global/specflow.spec_review.md` — replace `specs/` path references with `openspec/changes/`
- [x] T028 [P] [US3] Update `global/specflow.decompose.md` — replace `specs/` path references with `openspec/changes/`
- [x] T029 [US3] Delete any commands classified as "remove" in the audit and verify no broken references remain

**Checkpoint**: All specflow commands updated for `openspec/` paths. Ready for cutover.

---

## Phase 5: User Story 4 — Update Install/Init/Template (Priority: P4)

**Goal**: Update bootstrap scripts and template for OpenSpec conventions (additive changes only)

**Independent Test**: Running `specflow-init` in a fresh project creates `openspec/` directories alongside existing bootstrap artifacts

- [x] T030 [US4] Update `bin/specflow-init` — add creation of `openspec/specs/`, `openspec/changes/`, and `openspec/README.md` directories to the init flow (preserve all existing init behavior)
- [x] T031 [US4] Update `bin/specflow-install` — ensure updated `global/specflow*.md` commands are installed to `~/.config/specflow/global/`
- [x] T032 [P] [US4] Add `template/openspec/specs/.gitkeep` and `template/openspec/changes/.gitkeep` for bootstrap directory scaffolding
- [x] T033 [P] [US4] Copy `template/openspec/README.md` (created in T002) — ensure it's included in the template bootstrap payload
- [x] T034 [US4] Update `template/CLAUDE.md` — replace `specs/` references with `openspec/changes/` references

**Checkpoint**: Install/init/template updated. All preparation complete — ready for real cutover.

---

## Phase 6: User Story 1b — Execute Real Cutover (Priority: P1, Part 2)

**Goal**: Run the migration on the actual repository data — one-shot cutover

**Independent Test**: `openspec/specs/` exists (empty), `openspec/changes/` has 20 subdirectories each with `proposal.md`, old `specs/` directory is removed

- [x] T035 [US1] Run `bin/specflow-migrate-openspec.sh` on the repository — migrate all 20 entries from `specs/` to `openspec/changes/`
- [x] T036 [US1] Verify migration correctness — check each of the 20 `openspec/changes/<NNN>-<name>/proposal.md` files exist with Historical Migration header
- [x] T037 [US1] Assert end state: `openspec/specs/` directory exists and is empty, `openspec/changes/` has 20 subdirectories, old `specs/` directory does not exist
- [x] T038 [US1] Create `openspec/README.md` at repository root with OpenSpec convention guide

**Checkpoint**: Repository fully migrated. One-shot cutover complete.

---

## Phase 7: User Story 2 — Update Documentation (Priority: P2)

**Goal**: Update README and documentation to reflect the post-cutover architecture

**Independent Test**: A reader can identify the purpose of `openspec/`, `bin/`, `template/`, and `global/` directories from the README alone

- [x] T039 [US2] Update `README.md` — add architecture section explaining distributable assets vs planning state, directory map, and contribution workflow
- [x] T040 [US2] Update `CLAUDE.md` — replace `specs/` references with `openspec/changes/` references in Active Technologies and Recent Changes sections

**Checkpoint**: Documentation reflects the final migrated state.

---

## Phase 8: User Story 5 — Cleanup Obsolete Assets (Priority: P5)

**Goal**: Remove obsolete code and verify no broken references remain

**Independent Test**: No removed command references exist in any documentation or scripts; all remaining commands work

- [x] T041 [US5] Grep all repository files for remaining `specs/` path references (excluding `openspec/specs/`) and fix any missed references
- [x] T042 [US5] Verify all `bin/specflow-*` scripts work against the new structure — run each with `--help` or dry-run
- [x] T043 [US5] Remove any `.specflow/` references to old `specs/` paths in review prompts at `~/.config/specflow/global/review_*_prompt.md`

**Checkpoint**: Repository is fully migrated with no legacy path references.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation

- [x] T044 [P] Run `bin/specflow-migrate-openspec.sh` one final time to confirm idempotence (all 20 skipped)
- [x] T045 [P] Verify `openspec/specs/` exists and is empty, `openspec/changes/` has exactly 20 subdirectories each with `proposal.md`
- [x] T046 Run quickstart.md verification checklist against the final repository state

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all subsequent phases
- **Phase 3 (US1a — Test Script)**: Depends on Phase 2 — test on fixtures first
- **Phase 4 (US3 — Commands)**: Depends on Phase 3 — can start after script is validated
- **Phase 5 (US4 — Install/Init)**: Depends on Phase 4 — needs command audit complete
- **Phase 6 (US1b — Real Cutover)**: Depends on Phase 4 AND Phase 5 — all updates ready before one-shot cutover
- **Phase 7 (US2 — Documentation)**: Depends on Phase 6 — documents final state
- **Phase 8 (US5 — Cleanup)**: Depends on Phase 6 and Phase 7
- **Phase 9 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Split into Part 1 (test) and Part 2 (cutover). Part 2 runs after US3 and US4 are done.
- **US2 (P2)**: Depends on US1 Part 2 (needs final structure to document)
- **US3 (P3)**: Depends on US1 Part 1 (needs validated script, not cutover)
- **US4 (P4)**: Depends on US3 (needs updated commands to install)
- **US5 (P5)**: Depends on US1 Part 2, US2

### Parallel Opportunities

- T016–T028 can all run in parallel (different command files, same transformation)
- T032–T033 can run in parallel (different template files)
- T044–T045 can run in parallel (independent verifications)

---

## Implementation Strategy

### MVP First

1. Complete Phase 1–2: Setup + Migration Script
2. Complete Phase 3: Test on fixtures — validate correctness and atomicity
3. Complete Phase 4–5: Update commands and install/init/template
4. Complete Phase 6: Execute real cutover (one-shot)
5. **STOP and VALIDATE**: All 20 entries migrated, openspec/specs/ exists empty, specs/ gone
6. Complete Phase 7–9: Documentation, cleanup, polish

### Key Change from Previous Version

The real cutover (Phase 6) now runs AFTER all command/template updates (Phase 4–5) are prepared. This ensures the one-shot cutover produces a fully consistent state where all tools already reference `openspec/` paths.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The global/ commands are installed to `~/.config/specflow/global/` — updates must target both the source files in this repo and the installed copies
- The migration script itself (020-openspec-migration) will migrate its own spec directory as part of the cutover
- `openspec/specs/` MUST exist as an empty directory after migration — it is NOT deleted, only old `specs/` is removed
- Commit after each phase completion for safety
