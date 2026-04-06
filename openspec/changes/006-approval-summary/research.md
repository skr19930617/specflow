# Research: Approval Summary Generation

## R1: Existing approve flow structure

**Decision**: Insert summary generation between Quality Gate and Commit in `global/specflow.approve.md`.
**Rationale**: The Quality Gate already reads review-ledger.json and validates status. The summary generation step can reuse the same ledger data and add spec/diff analysis before committing.
**Alternatives considered**: Creating a separate script — rejected because the summary generation requires LLM inference (Spec Coverage, Human Checkpoints) which is naturally handled within the slash command context.

## R2: review-ledger.json schema

**Decision**: Use the `findings` array with fields `id`, `origin_round`, `severity`, `status` for all counting. Use `round_summaries` only as cross-validation.
**Rationale**: The findings array contains the authoritative per-item data. Existing ledgers (003, 005) confirm the schema: each finding has `id` (R{round}-F{number}), `origin_round`, `latest_round`, `severity`, `status`, `relation`, `supersedes`.
**Alternatives considered**: Using `round_summaries.by_severity` for counting — rejected because it aggregates per-round and doesn't directly give cross-round totals.

## R3: Diff scope

**Decision**: Use `git diff main...HEAD` for committed changes only.
**Rationale**: The approve flow runs before `git add -A && git commit`. The diff captures all implementation changes on the feature branch relative to main, which is the scope of work being approved.
**Alternatives considered**: Including uncommitted changes — rejected for simplicity; the existing approve flow commits everything via `git add -A`, so any uncommitted changes will be staged at commit time regardless.

## R4: Spec Coverage mapping method

**Decision**: LLM-inferred semantic mapping with structured Markdown table output.
**Rationale**: Acceptance criteria are natural-language statements; deterministic file matching is not feasible. The LLM reads criteria + diff and produces a best-effort mapping. The structured table format ensures consistency.
**Alternatives considered**: Keyword matching — rejected as too fragile and low-recall for natural-language criteria.

## R5: Human Checkpoints generation

**Decision**: LLM-inferred from all available inputs (spec, ledger, diff, coverage table).
**Rationale**: Human checkpoints are inherently judgment-based — identifying what automated review cannot cover requires semantic understanding.
**Alternatives considered**: Template-based checkpoints — rejected because the spec explicitly requires feature-specific, non-generic items.
