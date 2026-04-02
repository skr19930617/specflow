# Implementation Plan: Issue-Local current-phase.md

**Branch**: `007-current-phase` | **Date**: 2026-04-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-current-phase/spec.md`

## Summary

Add automatic generation and consumption of `specs/<feature>/current-phase.md` — a 7-field Markdown summary derived from review-ledger.json and git log. Produced by specflow.impl and specflow.fix after each Codex review; consumed by specflow.impl, specflow.fix, and specflow.approve at command start for orientation context.

## Technical Context

**Language/Version**: Markdown (Claude Code slash commands) + Bash (inline git commands)
**Primary Dependencies**: Claude Code CLI, speckit (.specify/), GitHub CLI (gh), jq (not needed — inline logic)
**Storage**: File-based — `specs/<feature>/current-phase.md`, `specs/<feature>/review-ledger.json` (read-only)
**Testing**: Manual integration testing via specflow cycle
**Target Platform**: macOS/Linux (Claude Code CLI environment)
**Project Type**: CLI tool (slash command system)
**Performance Goals**: N/A (file generation is instant)
**Constraints**: `.specflow/` is read-only; no new external dependencies
**Scale/Scope**: 3 slash command files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is template-only (not configured for this project). Gate: PASSED (no violations possible).

## Project Structure

### Documentation (this feature)

```text
specs/007-current-phase/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-contract.md  # Phase 1 output
├── checklists/
│   └── requirements.md  # Specification checklist
└── tasks.md             # Phase 2 output (next step)
```

### Source Code (repository root)

```text
global/
├── specflow.impl.md     # Modified: add producer + consumer logic
├── specflow.fix.md      # Modified: add producer + consumer logic
└── specflow.approve.md  # Modified: add consumer logic
```

**Structure Decision**: No new files or directories in source. All changes are additions to existing slash command markdown files.

## Implementation Approach

### Phase 1: Producer — specflow.impl (Generation)

Add two sections to `global/specflow.impl.md`:

1. **Consumer read** (at command start): If `specs/<feature>/current-phase.md` exists, read and display as context.
2. **Producer write** (after Step 2.5 ledger write): Generate `current-phase.md` from review-ledger.json + git log.

The generation logic:
- Read the just-written review-ledger.json
- Extract: feature_id, current_round, status, findings[]
- Filter high findings with status in ["new", "open"] → Open High Findings
- Filter findings with status in ["accepted_risk", "ignored"] → Accepted Risks
- Run `git log --oneline -5 $(git merge-base HEAD ${BASE_BRANCH:-main})..HEAD` → Latest Changes. **If git command fails or returns empty, use fallback `(no commits yet)`.**
- Derive Phase from round (1 → impl-review, ≥2 → fix-review)
- Derive Next Recommended Action from Open High Findings count
- Write to `specs/<feature>/current-phase.md`

**Data source clarification (FR-004)**: The review-ledger.json is the **authoritative serialized form** of the latest review output. By the time the producer writes current-phase.md, the ledger has already incorporated all data from the Codex review response (findings, round, status). Therefore, reading the ledger alone satisfies FR-004 — no second data source is needed. In the malformed-ledger fallback path, the producer should also attempt to use the in-memory review data that was just parsed (before it was written to the ledger), as a secondary source before falling back to spec defaults.

**Malformed/missing ledger recovery**: If `review-ledger.json` cannot be fully parsed:
1. **First**: Attempt partial recovery of the ledger file — extract any readable top-level fields (`feature_id`, `current_round`, `status`, `findings[]`). Use whatever is available.
2. **Second**: For fields still missing after partial ledger recovery, supplement with in-memory Codex review data (findings, decision) that is available in the slash command context.
3. **Third**: For any remaining unreadable fields, use spec-defined fallback values (Phase: `impl-review`, Round: `1`, Status: `in_progress`, Open High Findings: `0 件`, Accepted Risks: `none`, Next Recommended Action: `/specflow.fix`).
- If `findings[]` is missing/not an array from both ledger and in-memory: set findings-dependent fields to fallback + `(ledger findings unavailable)` note.
- When using fallback, append parenthetical note to that field's value (e.g., `in_progress (ledger parse error)`) so consumer Claude sees degraded data.

**Field-level output contract**: The generation logic MUST produce each field as follows:
- **Phase**: `impl-review` if `current_round == 1`, else `fix-review`
- **Round**: Integer from `review-ledger.current_round`
- **Status**: Direct read from `review-ledger.status` (one of `has_open_high`, `all_resolved`, `in_progress`)
- **Open High Findings**: Filter `findings[]` where `severity == "high"` AND `status in ["new", "open"]` → format as `<count> 件 — "<title1>", "<title2>"` or `0 件` if none
- **Accepted Risks**: Filter `findings[]` where `status in ["accepted_risk", "ignored"]` → format as `<title> (<status>, notes: "<notes>")` per finding, or `none` if empty
- **Latest Changes**: Run `git log --oneline -5 $(git merge-base HEAD ${BASE_BRANCH:-main})..HEAD`; each line as `  - <hash> <subject>`. Fallback: `(no commits yet)`
- **Next Recommended Action**: If Open High Findings count > 0 → `/specflow.fix`; else → `/specflow.approve`
- **Overwrite semantics**: Write the complete file from scratch every time (no read-modify-write)

**Consumer read contract**: Each consumer command MUST:
- Check if `FEATURE_DIR/current-phase.md` exists
- If present: read and display as "Current Phase Context" summary before proceeding
- If absent: proceed without error, optionally note "No prior phase context found"

### Phase 2: Producer — specflow.fix (Update)

Add two sections to `global/specflow.fix.md`:

1. **Consumer read** (at command start): Same as impl.
2. **Producer write** (after ledger write): Same generation logic as impl.

The logic is identical because both producers write at the same trigger point (after ledger update) and have the same data available.

### Phase 3: Consumer — specflow.approve (Read)

Add one section to `global/specflow.approve.md`:

1. **Consumer read** (at command start, before quality gate): If `current-phase.md` exists, read and use as additional context for the approval summary.

No producer logic needed — approve doesn't run a Codex review.

### Integration Notes

- **Commit scope verification (FR-009)**: The `git add -A -- . ':(exclude).specflow'` in specflow.approve stages all files except `.specflow/`. Since `current-phase.md` lives under `specs/<feature>/`, it is included. This MUST be verified during implementation (T010) by checking the actual `git add` command in specflow.approve.md and confirming the exclude pattern does not accidentally match `specs/`. If the staging command is different from expected, update it to explicitly include `specs/<feature>/current-phase.md`.
- Consumer read is non-blocking: if the file doesn't exist, proceed without error.
- The generation section should be clearly marked with a comment header for maintainability (e.g., "Step 2.6: Generate current-phase.md").

## Complexity Tracking

No constitution violations. No complexity justifications needed.
