<!-- Historical Migration
  Source: specs/010-split-review-commands/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: Split Review Commands

**Branch**: `010-split-review-commands` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-split-review-commands/spec.md`

## Summary

Split the ambiguous `/specflow.review` into three phase-specific review commands (`/specflow.spec_review`, `/specflow.plan_review`, `/specflow.impl_review`), each with its own handoff definition. Update existing flow commands to delegate review steps to these new commands. Remove the old `/specflow.review` entry from CLAUDE.md.

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit (.specify/)
**Storage**: File-based — `global/*.md` (command files), `.specflow/review_*_prompt.txt` (review prompts), `specs/<feature>/review-ledger.json`
**Testing**: Manual execution of each command; verify handoff options and review-ledger entries
**Target Platform**: macOS / Linux (developer workstation)
**Project Type**: CLI tool / developer workflow automation
**Performance Goals**: N/A (interactive CLI tool)
**Constraints**: Command files must follow existing specflow conventions; review-ledger.json backward compatibility
**Scale/Scope**: 3 new command files, 3 modified flow commands, 1 CLAUDE.md update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is not yet configured (template only). No gates to evaluate — proceeding.

## Project Structure

### Documentation (this feature)

```text
specs/010-split-review-commands/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
global/
├── specflow.spec_review.md   # NEW: standalone spec review command
├── specflow.plan_review.md   # NEW: standalone plan/tasks review command
├── specflow.impl_review.md   # NEW: standalone impl review command
├── specflow.md               # MODIFY: delegate spec review step to spec_review
├── specflow.plan.md          # MODIFY: delegate plan review step to plan_review
├── specflow.impl.md          # MODIFY: delegate impl review step to impl_review
├── specflow.spec_fix.md      # EXISTING: unchanged
├── specflow.plan_fix.md      # EXISTING: unchanged
├── specflow.fix.md           # EXISTING: unchanged
├── specflow.approve.md       # EXISTING: unchanged
└── specflow.reject.md        # EXISTING: unchanged

CLAUDE.md                     # MODIFY: remove /specflow.review, add 3 new commands
```

**Structure Decision**: All new command files go in `global/` following the existing naming convention (`specflow.<phase>_review.md`).

## Complexity Tracking

No constitution violations — no complexity justification needed.
