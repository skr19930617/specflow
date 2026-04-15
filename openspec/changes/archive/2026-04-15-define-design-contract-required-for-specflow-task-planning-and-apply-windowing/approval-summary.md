# Approval Summary: define-design-contract-required-for-specflow-task-planning-and-apply-windowing

**Generated**: 2026-04-15T00:54:21Z
**Branch**: define-design-contract-required-for-specflow-task-planning-and-apply-windowing
**Status**: ✅ No unresolved high

## What Changed

```
 assets/global/prompts/review_design_prompt.md      |   1 +
 .../prompts/review_design_rereview_prompt.md       |   1 +
 src/bin/specflow-review-design.ts                  |  62 +++++++-
 src/contracts/command-bodies.ts                    |  38 ++++-
 src/tests/review-cli.test.ts                       | 157 +++++++++++++++++++++
 src/tests/test-helpers.ts                          |  30 +++-
 src/types/contracts.ts                             |   1 +
 7 files changed, 281 insertions(+), 9 deletions(-)
```

## Files Touched

- assets/global/prompts/review_design_prompt.md
- assets/global/prompts/review_design_rereview_prompt.md
- src/bin/specflow-review-design.ts
- src/contracts/command-bodies.ts
- src/tests/review-cli.test.ts
- src/tests/test-helpers.ts
- src/types/contracts.ts

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Design with all planning sections passes structural validation | Yes | src/lib/design-planning-validation.ts, src/tests/design-planning-validation.test.ts |
| 2 | Design missing a planning section heading fails structural validation | Yes | src/lib/design-planning-validation.ts, src/tests/design-planning-validation.test.ts |
| 3 | Design with an empty planning section fails structural validation | Yes | src/lib/design-planning-validation.ts, src/tests/design-planning-validation.test.ts |
| 4 | N/A is valid content for a non-applicable section | Yes | src/lib/design-planning-validation.ts, src/tests/design-planning-validation.test.ts |
| 5 | Each concern maps to at least one identifiable unit of work | Yes | assets/global/prompts/review_design_prompt.md, src/contracts/command-bodies.ts |
| 6 | Ordering notes express dependency direction between concerns | Yes | assets/global/prompts/review_design_prompt.md, src/contracts/command-bodies.ts |
| 7 | Completion condition maps to an observable artifact or state | Yes | assets/global/prompts/review_design_prompt.md, src/contracts/command-bodies.ts |
| 8 | Contract outputs enable bundle completion checks | Yes | assets/global/prompts/review_design_prompt.md, src/contracts/command-bodies.ts |
| 9 | New design generation includes planning sections | Yes | src/contracts/command-bodies.ts |
| 10 | Existing design is not retroactively validated | Yes | src/bin/specflow-review-design.ts, src/tests/review-cli.test.ts |
| 11 | Design with all planning sections passes task-plannable gate | Yes | src/bin/specflow-review-design.ts, src/tests/review-cli.test.ts |
| 12 | Design missing planning sections triggers request_changes | Yes | src/bin/specflow-review-design.ts, src/tests/review-cli.test.ts |
| 13 | Task-plannable gate uses existing remediation flow | Yes | src/bin/specflow-review-design.ts |
| 14 | Task-plannable gate is skipped for pre-existing designs | Yes | src/bin/specflow-review-design.ts, src/tests/review-cli.test.ts |
| 15 | Design generation prompt includes planning section instructions | Yes | assets/global/prompts/review_design_prompt.md, src/contracts/command-bodies.ts |
| 16 | Design generation prompt describes minimum content per section | Yes | src/contracts/command-bodies.ts |
| 17 | Design generation prompt instructs N/A handling | Yes | src/contracts/command-bodies.ts |

**Coverage Rate**: 17/17 (100%)

## Remaining Risks

- R2-F05 (design ledger): Task 4.1 uses 'reviewRound === 1' but codebase uses 'current_round' with incrementRound() (severity: low) — naming mismatch noted, logic is sound per review

No untested new files. No uncovered criteria.

## Human Checkpoints

- [ ] Verify that `headingMatches()` substring matching does not produce false positives on real-world design headings (e.g., heading containing "No Concerns" incorrectly matching "Concerns")
- [ ] Confirm that the `satisfies ReviewFinding` type assertion in `buildTaskPlannableFindings` compiles correctly and that `origin_round` is not required by downstream ledger consumers
- [ ] Run a manual end-to-end test: create a new change, generate a design.md via `/specflow.design`, and confirm the 7 planning section headings appear
- [ ] Verify that existing changes (pre-deployed) with design.md are not retroactively flagged during design review
