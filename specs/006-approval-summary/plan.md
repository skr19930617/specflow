# Implementation Plan: Approval Summary Generation

**Branch**: `006-approval-summary` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-approval-summary/spec.md`

## Summary

Add an approval summary generation step to the `/specflow.approve` command. Before committing, the system reads `review-ledger.json`, `spec.md`, and `git diff main...HEAD` to generate `approval-summary.md` with six sections (What Changed, Spec Coverage, Review Loop Summary, Remaining Risks, Files Touched, Human Checkpoints). A terminal summary of key metrics is displayed, and the user chooses to proceed or abort.

## Technical Context

**Language/Version**: Bash (shell scripts), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, GitHub CLI (gh), speckit (.specify/), jq (for JSON parsing in scripts)
**Storage**: File-based — `specs/<feature>/approval-summary.md`, `specs/<feature>/review-ledger.json`
**Testing**: Manual end-to-end testing via specflow workflow
**Target Platform**: macOS/Linux terminal (Claude Code CLI environment)
**Project Type**: CLI workflow automation (slash commands + shell scripts)
**Performance Goals**: Summary generation < 30 seconds
**Constraints**: No modification to `.specflow/` or `.specify/` directories; LLM-inferred sections are best-effort
**Scale/Scope**: Single-feature approval workflow; review-ledger typically ≤ 10 rounds

## Constitution Check

*GATE: Constitution is template-only (not customized). No violations to check. Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/006-approval-summary/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (by /speckit.tasks)
```

### Source Code (repository root)

```text
global/
└── specflow.approve.md  # Modified — add summary generation step before commit
```

**Structure Decision**: This feature modifies one existing file (`global/specflow.approve.md`) to insert the approval summary generation step. No new directories or source files are created. The `approval-summary.md` output file is a workflow artifact generated at approve time into `specs/<feature>/`.

## Design

### Approach

The implementation modifies `global/specflow.approve.md` to add a new section between the existing Quality Gate and the Commit section. This new section:

1. **Reads inputs**: review-ledger.json, spec.md, git diff main...HEAD
2. **Generates approval-summary.md** with all 6 required sections
3. **Displays terminal summary** with key metrics
4. **Prompts user** to choose "続行" or "中止" via AskUserQuestion

### Section Generation Strategy

| Section | Input | Method |
|---------|-------|--------|
| What Changed | `git diff main...HEAD --stat` | Deterministic — list changed files with stats |
| Spec Coverage | spec.md acceptance criteria + diff | LLM-inferred — semantic mapping of criteria to files |
| Review Loop Summary | review-ledger.json `findings` array | Deterministic — filter/count by severity, status, origin_round |
| Remaining Risks | review-ledger.json + diff file list | Mixed — deterministic (unresolved findings) + string-match (untested files) + carry-over (uncovered criteria) |
| Files Touched | `git diff main...HEAD --name-only` | Deterministic — list of changed files |
| Human Checkpoints | All inputs | LLM-inferred — generate 3–5 items requiring human judgment |

### Integration Point

The new section is inserted into `specflow.approve.md` between the Quality Gate section and the Commit section. The flow becomes:

```
Quality Gate → [NEW: Approval Summary Generation + User Confirmation] → Commit → Push & PR
```

If the user chooses "中止", the approve flow stops without committing.

### Normalized Diff Source

All file-based sections (What Changed, Files Touched, Spec Coverage, Remaining Risks) MUST use a single normalized diff source. The approve flow computes this once at the start of the summary generation step:

1. **File list**: `git diff main...HEAD --name-only` — committed changes only, filtered to exclude `specs/<feature>/approval-summary.md`
2. **Stat output**: `git diff main...HEAD --stat` — same scope, same exclusion
3. **Full diff** (for LLM-inferred sections): `git diff main...HEAD` — same scope, same exclusion

These outputs are computed once and reused across all sections. No section may invoke its own diff command.

### Self-Exclusion Rule

`specs/<feature>/approval-summary.md` is excluded from the normalized diff source (see above) since it is generated during the approve step itself. If a stale version exists from a prior approve attempt, it is still excluded.

### Degraded Mode

When inputs are missing/malformed, affected sections display warnings but the summary is still generated and the user may still proceed:

| Missing Input | Affected Sections | Behavior |
|--------------|-------------------|----------|
| review-ledger.json | Review Loop Summary, Remaining Risks (deterministic) | "No review data available" |
| spec.md | Spec Coverage | "Spec not found — coverage cannot be computed" |
| Malformed review-ledger.json | Review Loop Summary, Remaining Risks | Parse error noted, sections degraded |
| git diff failure (e.g., main branch not found) | What Changed, Files Touched, Spec Coverage, Remaining Risks (untested files) | "⚠️ Diff unavailable — file-based sections cannot be computed". Summary still generated with ledger-only sections. |

## Review Loop Summary Counting Model

Computed from the `findings` array in review-ledger.json. Each finding is counted once by its current state:

```
initial_high    = findings.filter(f => f.severity == "high" && f.origin_round == 1).length
resolved_high   = findings.filter(f => f.severity == "high" && f.status == "resolved").length
unresolved_high = findings.filter(f => f.severity == "high" && (f.status == "open" || f.status == "new")).length
new_later_high  = findings.filter(f => f.severity == "high" && f.origin_round > 1).length
```

Findings with `status == "overridden"` are excluded from unresolved count (treated as resolved by override).

### Round-Aware Behavior

The formulas above are inherently round-aware because they use `origin_round` and current `status`:

- **Single-round ledger** (current_round == 1): All findings have `origin_round == 1`, so `new_later_high == 0` by formula. The `resolved_high` value is determined solely by `status == "resolved"` — if a single-round ledger happens to contain resolved findings, they are counted. In practice, single-round ledgers in the current workflow have all findings with `status == "new"`, which naturally yields `resolved_high == 0`. No special-case override is applied — the formulas produce correct results for any valid ledger.
- **Multi-round ledger**: Findings from round 1 that were resolved in round 2 will have `status == "resolved"` and `origin_round == 1`. New findings from round 2 will have `origin_round == 2`. The formulas correctly partition these.
- **Overridden findings**: `status == "overridden"` means manually dismissed. These are excluded from both `unresolved_high` and `resolved_high` — they don't appear in either filter.

### Verification contract

For any valid review-ledger:
- `initial_high + new_later_high` = total high findings ever raised
- `resolved_high + unresolved_high + overridden_high` = total high findings ever raised
- When `current_round == 1`: `new_later_high == 0` (guaranteed by formula since all `origin_round == 1`). `resolved_high` depends on actual finding statuses — no hard override applied

## Complexity Tracking

No constitution violations. No complexity justifications needed.
