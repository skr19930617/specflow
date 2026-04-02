# CLI Contract: current-phase.md Generation

**Date**: 2026-04-02

This feature modifies existing slash commands (Claude Code markdown files). There are no new CLI tools, scripts, or APIs. The contract describes what each modified command does with current-phase.md.

## Producer Commands

### specflow.impl (modified)

**New behavior**: After updating review-ledger.json (Step 2.5), generate `specs/<feature>/current-phase.md`.

**Trigger**: After ledger backup+write, before presenting review results (Step 3).

**Input**:
- `review-ledger.json` (just written)
- `git log` output for Latest Changes

**Output**:
- `specs/<feature>/current-phase.md` (created or overwritten)

### specflow.fix (modified)

**New behavior**: After updating review-ledger.json, update `specs/<feature>/current-phase.md`.

**Trigger**: After ledger backup+write, before presenting review results.

**Input**:
- `review-ledger.json` (just written)
- `git log` output for Latest Changes

**Output**:
- `specs/<feature>/current-phase.md` (overwritten)

## Consumer Commands

### specflow.impl (modified — also consumer)

**New behavior**: At command start, if `specs/<feature>/current-phase.md` exists, read it and display as context summary.

**Input**: `specs/<feature>/current-phase.md` (optional — absent on first run)

**Behavior on absence**: Proceed normally without error.

### specflow.fix (modified — also consumer)

**New behavior**: At command start, if `specs/<feature>/current-phase.md` exists, read it and display as context summary.

**Input**: `specs/<feature>/current-phase.md` (optional)

**Behavior on absence**: Proceed normally without error.

### specflow.approve (modified)

**New behavior**: At command start, if `specs/<feature>/current-phase.md` exists, read it and use as context for approval summary generation.

**Input**: `specs/<feature>/current-phase.md` (optional)

**Behavior on absence**: Proceed with degraded mode (same as current behavior).

**Commit behavior**: `current-phase.md` is already included by the existing `git add -A -- . ':(exclude).specflow'` command. No change needed.
