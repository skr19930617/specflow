<!-- Historical Migration
  Source: specs/020-openspec-migration/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: Migrate specflow to OpenSpec Repository Structure and Workflow

**Feature Branch**: `020-openspec-migration`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: GitHub Issue #47 — Migrate specflow to OpenSpec repository structure and workflow  
**Issue URL**: https://github.com/skr19930617/specflow/issues/47

## Clarifications

### Session 2026-04-06

- Q: 既存の specs/00x-* エントリをどう分類するか？ → A: 全て historical change records として openspec/changes/ に移行
- Q: 旧 specs/ と新 openspec/ の共存期間をどうするか？ → A: 即時完全移行（共存期間なし、旧ディレクトリは削除）
- Q: 移行スコープは？ → A: このリポジトリの構造移行 + install/init/template の OpenSpec 対応を含む（下流プロジェクトの運用ポリシーは別 issue）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Repository maintainer migrates planning state to OpenSpec structure (Priority: P1)

As a repository maintainer, I want to introduce an `openspec/` directory with `specs/` and `changes/` subdirectories so that repository planning state is structurally separated from distributable assets and follows a standard convention.

**Why this priority**: This is the foundational structural change that all subsequent workflow changes depend on. Without the directory structure in place, no other migration steps can proceed.

**Independent Test**: Can be fully tested by verifying that `openspec/specs/` and `openspec/changes/` directories exist, and that at least one existing spec has been migrated into the new structure with correct formatting.

**Acceptance Scenarios**:

1. **Given** the repository has no `openspec/` directory, **When** the migration is executed, **Then** `openspec/specs/` and `openspec/changes/` directories are created with appropriate structure.
2. **Given** existing tracked specs exist under `specs/00x-*`, **When** the maintainer runs the migration, **Then** all specs are moved as historical change records to `openspec/changes/<change-id>/` and the old `specs/` directory is removed.
3. **Given** the migration has completed, **When** a contributor browses the repository, **Then** they can clearly distinguish repository planning state from distributable/bootstrap assets.

---

### User Story 2 - Contributor understands the new repository architecture (Priority: P2)

As a contributor, I want clear documentation explaining the new OpenSpec-based architecture so that I understand the separation between distributable assets, repository planning state, and specflow orchestration.

**Why this priority**: Without clear documentation, contributors will be confused by the structural changes, leading to misplaced files and workflow friction.

**Independent Test**: Can be tested by having a new contributor read the README and correctly identify where to place a new spec, where distributable assets live, and what specflow commands are available.

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When** a contributor reads the README, **Then** they can identify the purpose of `openspec/`, `bin/`, `template/`, and `global/` directories.
2. **Given** a contributor wants to propose a new feature, **When** they consult the documentation, **Then** they find step-by-step guidance on creating a change under `openspec/changes/<change-id>/`.
3. **Given** the old `specs/` directory has been removed, **When** a contributor reads the documentation, **Then** they understand that all planning state lives under `openspec/` with no legacy paths to consider.

---

### User Story 3 - Repository maintainer re-scopes specflow commands (Priority: P3)

As a repository maintainer, I want specflow commands to be re-evaluated and simplified so that specflow becomes a thin orchestration layer on top of OpenSpec rather than owning the full planning framework.

**Why this priority**: This depends on the structural migration (P1) being complete. Re-scoping commands is a refinement step that reduces maintenance burden and clarifies responsibilities.

**Independent Test**: Can be tested by verifying that remaining specflow commands focus on repo-specific orchestration (setup, review, Codex/Claude integration) and that commands superseded by OpenSpec conventions are explicitly removed or deprecated.

**Acceptance Scenarios**:

1. **Given** the OpenSpec structure is in place, **When** the maintainer audits existing `global/specflow*.md` commands, **Then** each command is classified as "keep" (still valuable), "modify" (needs updating), or "remove" (superseded by OpenSpec).
2. **Given** commands have been re-scoped, **When** a contributor uses specflow, **Then** all commands operate against the `openspec/` directory structure rather than the legacy `specs/` structure.

---

### User Story 4 - Repository maintainer updates install/init and template assets (Priority: P4)

As a repository maintainer, I want the install/init scripts and template assets to reflect the new OpenSpec architecture so that new projects bootstrapped with specflow use the OpenSpec structure from the start.

**Why this priority**: This depends on the structural migration (P1) and command re-scoping (P3) being complete. It ensures the new architecture propagates to downstream users.

**Independent Test**: Can be tested by running the updated init flow in a fresh project and verifying it creates an OpenSpec-compliant structure.

**Acceptance Scenarios**:

1. **Given** a user runs the updated `specflow-init`, **When** initialization completes, **Then** the project contains an `openspec/` directory with `specs/` and `changes/` subdirectories.
2. **Given** `specflow-install` has been updated, **When** a user installs specflow, **Then** the installed assets reflect the OpenSpec directory conventions.
3. **Given** the `template/` directory has been updated, **When** it is used to bootstrap a new project, **Then** the bootstrapped project uses `openspec/` instead of `specs/` for planning state.

---

### User Story 5 - Repository maintainer cleans up obsolete assets (Priority: P5)

As a repository maintainer, I want obsolete specflow commands and scripts that are superseded by OpenSpec conventions to be removed so that the codebase is clean and maintainable.

**Why this priority**: This is a final cleanup step after all other stories are complete.

**Independent Test**: Can be tested by verifying that no removed command references remain in documentation or scripts, and that all remaining commands function correctly against the new structure.

**Acceptance Scenarios**:

1. **Given** the command audit is complete, **When** commands marked "remove" are deleted, **Then** no broken references to those commands exist in documentation or other scripts.
2. **Given** cleanup is done, **When** a contributor runs any remaining specflow command, **Then** it operates correctly against the `openspec/` structure.

---

### Edge Cases

- What happens if someone references old `specs/` paths after the directory is removed? Scripts and documentation should produce clear error messages pointing to the new `openspec/` location.
- What happens if a migration is interrupted partway through? The migration should be idempotent — re-running it completes any unfinished steps without duplicating already-migrated content.
- How are external tools or CI pipelines that reference old `specs/` paths affected? A compatibility redirect or migration guide should address path changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Repository MUST contain an `openspec/` root directory with `specs/` and `changes/` subdirectories after migration.
- **FR-002**: `openspec/specs/` MUST exist after migration but will start empty. **Authoring canonical capability specs is explicitly out of scope for this migration issue.** Rationale:
  - The issue's §2 says "migrate tracked repo design state from specs/ into openspec/specs/". Upon inventory, all existing `specs/00x-*` entries are feature-development change records (e.g., "add review ledger", "fix autofix loop"), not descriptions of stable product capabilities. None qualify as OpenSpec capability specs.
  - The issue's Non-goals section states: "Full rewrite of all scripts in one step." Creating new canonical capability specs from scratch (which do not currently exist in any form) would constitute new authoring work beyond the migration scope.
  - **Post-migration current truth**: The repository's current truth is defined by the codebase itself (scripts, commands, templates) plus the README conventions. This satisfies the issue's goal of making "repository layout easier to understand" — the layout now clearly separates distributable assets from planning state, even though the planning state contains only change records and no capability specs yet.
  - **Future capability specs**: A follow-up issue SHOULD be created to author the first canonical capability specs under `openspec/specs/` once the team identifies which capabilities to formally document.
  - Per-change spec deltas (`openspec/changes/<change-id>/specs/`) are not required for migrated historical records; new changes created after migration SHOULD include spec deltas when modifying an existing capability spec
- **FR-003**: Each proposed change MUST have its own directory under `openspec/changes/<change-id>/` containing at minimum a `proposal.md` file.
- **FR-004**: All existing tracked specs under `specs/` MUST be migrated as historical change records to `openspec/changes/<change-id>/`, and the old `specs/` directory MUST be removed. Migration rules:
  - **Change-id naming**: Use the existing directory name as-is (e.g., `specs/002-review-ledger/` → `openspec/changes/002-review-ledger/`).
  - **Mandatory files per migrated record**:
    - `proposal.md` — generated from the original `spec.md` content (copy with a "Historical Migration" header noting the original source path and migration date).
  - **Optional files** (included if they exist in the source):
    - `design.md` — from the original `plan.md` (if present).
    - `tasks.md` — from the original `tasks.md` (if present).
    - Other artifacts (e.g., `research.md`, `data-model.md`, `review-ledger*.json`) are copied as-is into the change record directory.
  - **Content transformation**: Files are copied with minimal transformation — only the front matter or header is updated to reflect the new location and migration context. No content rewriting.
- **FR-005**: The README MUST clearly explain the repository architecture, distinguishing distributable assets from planning state.
- **FR-006**: Each existing `global/specflow*.md` command MUST be audited and the results recorded in `openspec/changes/020-openspec-migration/command-audit.md`. Decision rule for classification:
  - **keep**: Command provides value not available through OpenSpec conventions alone (e.g., Codex review orchestration, approval workflow, Claude-specific integration)
  - **modify**: Command is still needed but references `specs/` paths or Spec Kit conventions that must be updated to `openspec/`
  - **remove**: Command is fully superseded by OpenSpec-native conventions or duplicates functionality now handled by the directory structure itself
  - The `global/` directory MUST remain as the home for Claude Code slash command definitions (this is a Claude Code convention, not a specflow invention). No rename or restructuring of `global/` itself is in scope.
  - Commands classified as "keep" stay as-is. Commands classified as "modify" have their path references and Spec Kit assumptions updated. Commands classified as "remove" are deleted and their removal is documented in the command-audit artifact.
  - The command-audit artifact MUST list every `global/specflow*.md` file with its classification, rationale, and (for removed commands) confirmation that no other file references it
- **FR-007**: The migration MUST be implemented as a dedicated Bash script (`bin/specflow-migrate-openspec.sh`) that:
  - Creates `openspec/specs/` and `openspec/changes/` if they don't exist
  - For each `specs/<NNN>-<name>/` directory, performs an atomic migration:
    1. Copy all contents to a temporary directory `openspec/changes/<NNN>-<name>.migrating/` with the file mapping defined in FR-004
    2. Rename the temporary directory to `openspec/changes/<NNN>-<name>/` (atomic move)
    3. Remove the source `specs/<NNN>-<name>/` directory
  - Removes the empty `specs/` directory after all entries are migrated
  - Is idempotent with proper partial-migration handling:
    - If `openspec/changes/<change-id>/` exists AND source `specs/<change-id>/` does not exist → fully migrated, skip
    - If `openspec/changes/<change-id>.migrating/` exists → incomplete previous run, remove the temp directory and re-migrate from source
    - If both source and target exist → re-migrate (remove target, redo from source)
  - Exits with a summary of actions taken (migrated N entries, skipped M already-migrated entries, recovered K partial entries)
- **FR-008**: `specflow-install`, `specflow-init`, and `template/` MUST be updated to use the OpenSpec directory structure for new project bootstrapping. **This change is additive** — all existing non-OpenSpec bootstrap artifacts (`.specflow/config.env`, `.mcp.json`, `CLAUDE.md`, speckit `.specify/` scaffolding, etc.) MUST be preserved. The following OpenSpec-specific items are added to the existing bootstrap payload:
  - `openspec/specs/` — empty directory (placeholder for future capability specs)
  - `openspec/changes/` — empty directory (placeholder for change proposals)
  - `openspec/README.md` — brief explanation of the OpenSpec directory convention and how to create specs/changes
  - Any existing bootstrap references to `specs/` as the planning directory MUST be updated to point to `openspec/changes/` instead
  - No migrated repository-internal change records are included in the bootstrap payload; those are specific to the specflow repository itself
  - Downstream project migration policy (how existing user projects transition from `specs/` to `openspec/`) is deferred to a separate issue
- **FR-009**: Migration MUST be a one-shot complete cutover — no coexistence period between old `specs/` and new `openspec/` structures.
- **FR-010**: specflow MUST operate against the `openspec/` directory structure for all new work after migration.

### Key Entities

- **Capability Spec**: A specification describing a stable, canonical capability of the system. Lives under `openspec/specs/<capability>/spec.md`. Represents current truth.
- **Change Record**: A proposed modification containing proposal, design, tasks, and spec deltas. Lives under `openspec/changes/<change-id>/`. Represents proposed changes to current truth.
- **Distributable Asset**: Scripts, templates, and commands intended for installation into downstream projects. Lives under `bin/`, `template/`, and `global/`.
- **Repository Planning State**: Specs, changes, and design artifacts that describe this repository's own evolution. Lives under `openspec/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Repository contains a valid `openspec/` directory with both `specs/` (empty — no capability specs are authored in this migration) and `changes/` (populated with migrated historical records) subdirectories. This is a structure-only migration; populating `openspec/specs/` with canonical capability specs is deferred to a follow-up issue.
- **SC-002**: 100% of existing tracked specs are migrated to `openspec/changes/` as historical change records, with no orphaned specs remaining in the old `specs/` location (which is removed).
- **SC-003**: A new contributor can correctly identify where to place new work (spec vs. change vs. distributable asset) within 5 minutes of reading the documentation.
- **SC-004**: All specflow commands that interact with specs operate against the `openspec/` structure rather than the legacy structure.
- **SC-005**: Running `bin/specflow-migrate-openspec.sh` multiple times produces the same final state without duplicating or corrupting previously migrated content.
- **SC-006**: The README and migration guide cover all architectural decisions, making the separation between planning state and distributable assets unambiguous.

## Assumptions

- All existing `specs/00x-*` entries are treated as historical change records (not canonical capability specs) and migrated to `openspec/changes/`.
- Migration is a one-shot cutover with no coexistence period — old `specs/` directory is removed.
- Scope includes this repository's structure migration plus updating install/init/template for OpenSpec conventions. Downstream project migration policy is deferred to a separate issue.
- `openspec/specs/` starts empty after migration; the repository's current truth is the codebase itself. Canonical capability specs will be authored as a future step.
- Per-change spec deltas are not required for migrated historical records; only new changes created after migration should include them when modifying capability specs.
- The bootstrap payload for downstream projects contains only empty directories and a README — no repository-internal content is included.
- The `template/` directory continues to serve as bootstrap assets for new projects.
- External CI pipelines or tools referencing old paths will need manual updates as documented in the README.
