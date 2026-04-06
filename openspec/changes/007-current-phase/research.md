# Research: Issue-Local current-phase.md

**Date**: 2026-04-02

## R1: Where to inject generation logic in specflow.impl

**Decision**: Add a new step after "Step 2.5: Update Review Ledger" (after ledger backup+write) and before "Step 3: Present Review Results" in `global/specflow.impl.md`.

**Rationale**: At this point the review-ledger has been fully updated with the latest round data, findings, and status. All data needed to populate current-phase.md is available. Inserting before the results presentation keeps the generation invisible to the user's flow.

**Alternatives considered**:
- After Step 3 (Present Results): Possible but delays generation; if the user immediately starts a new phase, the file might not yet exist.
- As part of the handoff: Too late; handoff is user-facing and shouldn't do file I/O.

## R2: Where to inject update logic in specflow.fix

**Decision**: Add a new step after the "Update Review Ledger" section (after ledger backup+write) and before "Present Review Results" in `global/specflow.fix.md`. Same position as in impl.

**Rationale**: Symmetric with impl. The re-review ledger update is complete, round summary is computed, and all data is fresh.

## R3: Where to inject read logic in consumer commands

**Decision**: Add a step at the beginning of each consumer command (specflow.impl, specflow.fix, specflow.approve) that reads `current-phase.md` if it exists, and passes it as additional context. For impl and fix, this goes into the Codex review prompt as context. For approve, it's used in the approval summary generation.

**Rationale**: Reading at command start gives the Claude executing the command immediate orientation. Absence is handled gracefully (first-run scenario).

**Alternatives considered**:
- Embedding in the Codex prompt directly: Too tightly coupled; current-phase.md is for Claude orientation, not for Codex review.
- Reading only in the handoff: Too late for orientation.

## R4: Implementation approach — inline vs helper script

**Decision**: Inline the generation logic directly in the slash command markdown files. No new helper scripts.

**Rationale**: 
- The generation is a simple deterministic derivation from review-ledger.json fields + git log.
- `.specflow/` is read-only per project rules.
- A Bash helper script would need to parse JSON (requires jq) and write markdown — this is simpler expressed as slash command instructions.
- Keeps the feature self-contained in the slash commands that are already being modified.

**Alternatives considered**:
- New script in `scripts/` directory: Overkill for a file that's 7 key-value lines. Would add a dependency on jq being installed.
- New script in `.specify/scripts/`: Not appropriate — specflow scripts are for specflow functionality.

## R5: BASE_BRANCH detection for Latest Changes

**Decision**: Use `$BASE_BRANCH` from `.specflow/config.env` if set, otherwise default to `main`.

**Rationale**: The config.env is already sourced at the start of each specflow command. This follows the existing pattern. The `git log --oneline -5 $(git merge-base HEAD $BASE_BRANCH)..HEAD` command is deterministic and fast.

## R6: File format for current-phase.md

**Decision**: Markdown key-value list as specified in the spec clarifications:

```markdown
# Current Phase: <feature-id>

- Phase: impl-review
- Round: 1
- Status: has_open_high
- Open High Findings: 2 件 — "Missing input validation", "Race condition in handler"
- Accepted Risks: none
- Latest Changes:
  - abc1234 feat: add new handler
  - def5678 fix: update validation
- Next Recommended Action: /specflow.fix
```

**Rationale**: Simple, scannable, parseable by both humans and AI. The heading includes feature-id for disambiguation when reading out of context.
