## 1. Foundation — Planning Heading Constant

- [x] 1.1 Create `src/lib/design-planning-headings.ts` with the 7 mandatory heading names as a readonly constant array
- [x] 1.2 Export a type for the heading names and a human-readable description map for error messages
- [x] 1.3 Write unit tests for the heading constant (correct count, correct names, immutability)

## 2. Structural Validation Function

- [x] 2.1 Implement `validatePlanningHeadings(designContent: string)` in `src/lib/design-planning-validation.ts` that returns `{ valid: boolean, missing: string[], empty: string[] }`
- [x] 2.2 Implement case-insensitive heading matching that allows additional words in the heading (e.g., "## Concerns and Vertical Slices" matches "Concerns")
- [x] 2.3 Detect empty sections (heading exists but no non-whitespace content before the next heading or EOF)
- [x] 2.4 Accept "N/A" with justification as valid non-empty content
- [x] 2.5 Write unit tests: all headings present → valid, missing heading → invalid with correct missing list, empty heading → invalid with correct empty list, N/A content → valid, case-insensitive matching

## 3. Design Generation Prompt Update

- [x] 3.1 Update the review prompt markdown sources (`assets/global/prompts/review_design_prompt.md` and `review_design_rereview_prompt.md`) to instruct the review agent to check for planning section headings, referencing the heading list from `src/lib/design-planning-headings.ts`
- [x] 3.2 Update the design generation instructions in `src/contracts/command-bodies.ts` (the `/specflow.design` command body) to include planning section requirements so the design agent produces the 7 mandatory headings
- [x] 3.3 If needed, update `src/contracts/prompts.ts` prompt metadata (e.g., add `task-plannable` to the output example category union) to keep the output schema example consistent
- [x] 3.4 Rebuild distribution prompts (`npm run build`) and verify the rendered prompt files in `dist/package/global/prompts/` include planning section instructions
- [x] 3.5 Verify existing design generation tests still pass after prompt updates

## 4. Design Review Integration

- [x] 4.1 Add backward compatibility check: read the review round number from the review ledger and run the task-plannable structural gate only when `reviewRound === 1` (first review after generation). Skip the gate for subsequent rounds (design was already validated) and for pre-existing designs (which will never enter round 1 again)
- [x] 4.2 Integrate `validatePlanningHeadings()` into the review pipeline in `src/bin/specflow-review-design.ts` — call before or alongside `callReviewAgent()`
- [x] 4.3 Convert structural validation failures to `ReviewFinding[]` objects with severity `high` and category `task-plannable`
- [x] 4.4 Merge task-plannable findings into the design review ledger alongside LLM-generated findings
- [x] 4.5 Write integration tests: new design missing sections → `request_changes` with task-plannable findings; new design with all sections → no task-plannable findings; pre-existing design missing sections → no task-plannable findings (backward compat)

## 5. End-to-End Verification

- [x] 5.1 Run full build (`npm run build`) and verify no type errors or build failures
- [x] 5.2 Run full test suite and verify all tests pass with 80%+ coverage on new code
- [ ] 5.3 Generate a test design.md using `specflow-design-artifacts next` on a test change and verify planning sections are present
- [ ] 5.4 Run `specflow-review-design review` on the test design and verify task-plannable gate behavior
