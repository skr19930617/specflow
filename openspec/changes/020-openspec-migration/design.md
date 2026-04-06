<!-- Historical Migration
  Source: specs/020-openspec-migration/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: OpenSpec Migration

**Branch**: `020-openspec-migration` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-openspec-migration/spec.md`

## Summary

Migrate the specflow repository from a `specs/`-centered structure to an OpenSpec-aligned `openspec/` structure. All 20 existing spec directories are migrated as historical change records to `openspec/changes/`. The `openspec/specs/` directory is created empty (structure-only migration). A dedicated migration script handles the cutover, specflow commands are audited, and install/init/template are updated for OpenSpec conventions.

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit (.specify/)
**Storage**: File-based — Markdown, JSON, shell scripts
**Testing**: Manual verification via script dry-run mode + integration tests (run migration, verify output)
**Target Platform**: macOS / Linux CLI
**Project Type**: CLI tool / developer workflow automation
**Performance Goals**: N/A (one-time migration + config updates)
**Constraints**: Must be idempotent, atomic per-entry migration, preserve all existing bootstrap artifacts
**Scale/Scope**: 20 spec directories, 13 specflow commands, 5 bin scripts, 2 template files

## Constitution Check

*Constitution is a template with no project-specific gates defined. No violations to check.*

## Project Structure

### Documentation (this feature)

```text
specs/020-openspec-migration/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── tasks.md             # Phase 2 output (speckit.tasks)
├── checklists/
│   └── requirements.md
├── review-ledger-spec.json
├── review-ledger-spec.json.bak
└── current-phase.md
```

### Source Code (repository root)

```text
# Post-migration target structure
openspec/
├── specs/                    # Empty (future capability specs)
├── changes/                  # Migrated historical change records
│   ├── 001-current-truth/
│   │   └── proposal.md      # From specs/001-current-truth/spec.md
│   ├── 002-review-ledger/
│   │   ├── proposal.md      # From spec.md
│   │   ├── design.md        # From plan.md (if exists)
│   │   ├── tasks.md         # From tasks.md (if exists)
│   │   └── ...              # Other artifacts copied as-is
│   ├── ... (003 through 019)
│   └── 020-openspec-migration/
│       ├── proposal.md
│       ├── command-audit.md  # FR-006 artifact
│       └── ...
└── README.md                 # OpenSpec convention guide

bin/
├── specflow-create-sub-issues  # Keep
├── specflow-fetch-issue        # Keep
├── specflow-filter-diff        # Keep
├── specflow-init               # Modify (add openspec/ bootstrapping)
├── specflow-install            # Modify (install updated commands)
└── specflow-migrate-openspec.sh  # NEW (FR-007 migration script)

global/                         # Remains as Claude Code slash command home
├── specflow.md                 # Audit per FR-006
├── specflow.approve.md         # Audit per FR-006
├── ... (other specflow*.md)
└── specflow.spec_review.md     # Audit per FR-006

template/
├── .mcp.json                   # Keep (existing bootstrap)
├── CLAUDE.md                   # Modify (update specs/ refs to openspec/)
└── openspec/                   # NEW (bootstrap payload)
    ├── specs/                  # Empty placeholder
    ├── changes/                # Empty placeholder
    └── README.md               # OpenSpec convention guide
```

**Structure Decision**: Single project, file-based. The migration adds `openspec/` at root, adds one script to `bin/`, modifies existing scripts, and updates `template/`. No new directories beyond what OpenSpec requires.

## Implementation Phases

### Phase 1: Migration Script (FR-007, FR-004)

Build `bin/specflow-migrate-openspec.sh` with:
- Atomic `.migrating/` temp directory pattern
- File mapping: spec.md→proposal.md, plan.md→design.md, tasks.md→tasks.md, rest as-is
- "Historical Migration" header injection into proposal.md
- 3-state idempotence detection
- Summary output

### Phase 2: Test Migration Script on Fixtures

Validate correctness before touching real data:
- Create test fixture with sample spec directories
- Verify file mapping, headers, idempotence, and failure recovery
- Verify `openspec/specs/` exists (empty) after migration — distinct from removing old `specs/`
- Clean up fixtures

### Phase 3: Command Audit & Updates (FR-006)

Audit all 13 `global/specflow*.md` commands:
- Classify each as keep/modify/remove with rationale
- Update path references from `specs/` to `openspec/changes/`
- Generate `command-audit.md` artifact
- Delete removed commands

### Phase 4: Install/Init/Template Updates (FR-008)

- Update `bin/specflow-init` to create `openspec/` directories
- Update `bin/specflow-install` to install updated commands
- Add `template/openspec/` with empty dirs + README
- Update `template/CLAUDE.md` to reference `openspec/`
- Ensure all existing bootstrap artifacts preserved (additive changes)

### Phase 5: Execute Real Cutover (FR-009) — after all updates are ready

- Run `bin/specflow-migrate-openspec.sh` on the repository itself
- Verify all 20 entries migrated correctly
- Assert: `openspec/specs/` exists (empty), `openspec/changes/` has 20 entries, old `specs/` removed
- All commands and docs already reference `openspec/` (updated in Phase 3-4)

### Phase 6: Documentation & Cleanup (FR-005)

- Update repository README with new architecture explanation (post-cutover)
- Final grep for stale `specs/` references
- Verify all scripts work against new structure

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration script corrupts spec data | High | Atomic temp-directory pattern, backup before delete, git history as safety net |
| Command references break after path updates | Medium | Grep-based verification after updates, manual smoke test of each command |
| Install/init breaks for downstream users | Medium | Additive changes only, test in fresh project before merge |
| Reviewer keeps flagging empty openspec/specs/ | Low | Accepted risk (R2-F01), follow-up issue for capability specs |

## Complexity Tracking

No constitution violations requiring justification.
