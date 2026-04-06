# Research: Split Review Commands

## Current Review Logic Location

### Spec Review (in `global/specflow.md`, Step 5)
- Reads `.specflow/review_spec_prompt.txt`
- Reads `FEATURE_SPEC` and issue body from `/tmp/specflow-issue.json`
- Calls Codex MCP with prompt
- Parses JSON response (decision, questions, summary)
- Presents review table
- Handoff: Plan に進む / Spec を修正 / 中止
- **No review-ledger integration** — spec review does not write to review-ledger.json

### Plan Review (in `global/specflow.plan.md`, Step 3)
- Reads `.specflow/review_plan_prompt.txt`
- Reads `FEATURE_SPEC`, `plan.md`, `tasks.md`
- Calls Codex MCP with prompt
- Parses JSON response (decision, questions, summary)
- Presents review table
- Handoff: 実装に進む / Plan を修正 / 中止
- **No review-ledger integration** — plan review does not write to review-ledger.json

### Impl Review (in `global/specflow.impl.md`, Step 2 + 2.5 + 2.6 + 3)
- Reads `.specflow/review_impl_prompt.txt`
- Reads `FEATURE_SPEC` and `git diff` (with exclusions)
- Calls Codex MCP with prompt
- Parses JSON response
- **Full review-ledger integration** — Step 2.5 handles ledger read/create, finding matching, round tracking
- **current-phase.md generation** — Step 2.6
- Complex handoff with auto-fix loop (Case A/B/C)

## Decision: review-ledger.json Phase Field

**Decision**: The `phase` field already exists in review-ledger.json (currently always "impl"). For spec_review and plan_review, set `phase` to "spec" or "plan" respectively. This requires no schema change.

**Rationale**: The existing schema already supports phase differentiation. The only change is to set the correct value when initializing a new ledger from spec_review or plan_review.

**Alternative considered**: Adding a separate `review_type` field — rejected because `phase` already serves this purpose.

## Decision: Spec/Plan Review Ledger Integration

**Decision**: Spec and plan reviews currently do NOT write to review-ledger.json. The new standalone commands will add ledger integration for consistency (FR-005). However, spec/plan review logic is much simpler than impl — no auto-fix loop, no finding matching, no round tracking needed for initial implementation.

**Rationale**: Keeping the ledger integration minimal for spec/plan (just recording the decision/questions) aligns with the issue's core goal (split + handoff) without over-engineering.

**Approach**: For spec_review and plan_review, write a simple ledger entry with phase, decision, questions. Use the full impl review ledger logic only in impl_review.

## Decision: Flow Command Delegation

**Decision**: Flow commands (`specflow.md`, `specflow.plan.md`, `specflow.impl.md`) will reference the new review command files by saying "Read the file `global/specflow.<phase>_review.md` and follow its complete workflow" — same pattern used for specflow commands.

**Rationale**: This is the established pattern in the codebase (e.g., `specflow.md` says "Read the file `.claude/commands/specflow.specify.md` and follow its complete workflow").

**Alternative considered**: Having flow commands call `Skill(skill: "specflow.spec_review")` — rejected because Skill calls reset context, while Read-and-follow preserves it.

## Decision: Extracting Review Logic

**Decision**: Extract the review step + handoff from each flow command into the new standalone command file. The flow command will then delegate to the new file.

**For spec_review**: Extract Step 5 + Handoff from `specflow.md`
**For plan_review**: Extract Step 3 (review part) + Handoff from `specflow.plan.md`  
**For impl_review**: Extract Step 2 + 2.5 + 2.6 + 3 + Handoff from `specflow.impl.md`
