## 1. Add Mainline Handoff Question Blocks ✓

> Add AskUserQuestion blocks to the three mainline terminal handoffs while preserving the existing prose guidance.

- [x] 1.1 Add an AskUserQuestion block to specflow step 9 for the spec_ready handoff with /specflow.design and /specflow.reject targets.
- [x] 1.2 Add an AskUserQuestion block to specflow.design step 4 for the design_ready handoff with /specflow.apply and /specflow.reject targets.
- [x] 1.3 Add an AskUserQuestion block to specflow.apply step 2 for the apply_ready handoff with /specflow.approve, /specflow.fix_apply, and /specflow.reject targets.

## 2. Align OpenSpec Change Artifacts ✓

> Ensure the change spec and task checklist encode the new handoff contract and required manual verification steps.

- [x] 2.1 Tighten the slash-command-guides change delta so mainline terminal handoffs require AskUserQuestion blocks and the correct slash-command target sets, with review-loop and utility exemptions preserved.
- [x] 2.2 Update tasks.md to track build, structural test, snapshot, openspec validation, and non-automated Claude Code UI verification work for this change.

## 3. Regenerate Distributed Command Guides ✓

> Rebuild the generated slash-command guides so the distributed artifacts include the new handoff blocks.

> Depends on: add-mainline-handoff-question-blocks

- [x] 3.1 Run the standard build pipeline to regenerate the three distributed command guides from the updated templates.
- [x] 3.2 Inspect the regenerated guides to confirm each terminal handoff contains an AskUserQuestion block with the expected slash-command targets.

## 4. Extend Structural Regression Coverage ✓

> Update structural tests and snapshots so regressions in mainline handoff question blocks are caught automatically.

> Depends on: add-mainline-handoff-question-blocks, regenerate-distributed-command-guides, align-openspec-change-artifacts

- [x] 4.1 Extend command-order.test.ts with ordered fragments for AskUserQuestion and each required slash-command target in the three generated guides.
- [x] 4.2 Regenerate the affected snapshot files for specflow.md, specflow.design.md, and specflow.apply.md.
- [x] 4.3 Run the relevant structural and snapshot tests to verify the new coverage passes against the regenerated output.

## 5. Run End-to-End Verification ✓

> Validate the change, observe the Claude Code UI behavior directly, and close out the change checklist.

> Depends on: align-openspec-change-artifacts, regenerate-distributed-command-guides, extend-structural-regression-coverage

- [x] 5.1 Run openspec validate ensure-askquestion-coverage-for-all-phase-transitions --type change and resolve any remaining contract drift.
- [x] 5.2 Run the full test suite and confirm the change is green end-to-end.
- [x] 5.3 Manually drive spec_ready, design_ready, and apply_ready in Claude Code and confirm clickable buttons appear at each handoff.
- [x] 5.4 Mark the change tasks complete in tasks.md, including the manual verification outcome.
