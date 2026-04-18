## 1. Baseline verification and barrel-equivalence test ✓

> Confirm npm run check is green on current main and add or confirm barrel-equivalence smoke tests for task-planner, agent-session, and phase-router barrels.

- [x] 1.1 Run npm run check on current branch and confirm green baseline
- [x] 1.2 Check whether a barrel-equivalence smoke test already exists for task-planner, agent-session, and phase-router barrels
- [x] 1.3 Add barrel-equivalence smoke test asserting exported keys of task-planner/index.ts, agent-session/index.ts, and phase-router/index.ts
- [x] 1.4 Run npm run check and confirm the new test passes

## 2. Delete dormant bootstrap modules ✓

> Remove ecosystem-detector.ts and profile-diff.ts which have zero production consumers and zero dedicated tests.

> Depends on: baseline-verification

- [x] 2.1 Verify ecosystem-detector.ts has zero non-test, non-archived consumers via grep
- [x] 2.2 Verify profile-diff.ts has zero non-test, non-archived consumers via grep
- [x] 2.3 Delete src/lib/ecosystem-detector.ts
- [x] 2.4 Run npm run typecheck and confirm green
- [x] 2.5 Delete src/lib/profile-diff.ts
- [x] 2.6 Run npm run typecheck and confirm green

## 3. Verify spec delta for setup rerun requirement retirement ✓

> Ensure the spec delta correctly retires the setup rerun diff-and-resolve requirement and openspec validate is green.

> Depends on: baseline-verification

- [x] 3.1 Confirm the spec delta contains the REMOVED Requirements block retiring the setup rerun requirement
- [x] 3.2 Run openspec validate librefactoring --type change and confirm green

## 4. Merge completion.ts into window.ts ✓

> Absorb the single-consumer completion.ts into window.ts, update barrel and test imports, keeping all exported symbols intact.

> Depends on: baseline-verification

- [x] 4.1 Move ArtifactChecker type and checkBundleCompletion function from completion.ts into window.ts, preserving exports
- [x] 4.2 Delete src/lib/task-planner/completion.ts
- [x] 4.3 Update task-planner/index.ts barrel to re-export checkBundleCompletion and ArtifactChecker from ./window.js instead of ./completion.js
- [x] 4.4 Update src/tests/task-planner-core.test.ts imports to use ../lib/task-planner/window.js or the barrel
- [x] 4.5 Run npm run check and confirm green including barrel-equivalence test

## 5. Merge send-queue.ts into session-manager.ts ✓

> Absorb the single-consumer send-queue.ts into session-manager.ts, update barrel exports, keeping SendQueue symbol intact.

> Depends on: baseline-verification

- [x] 5.1 Move SendQueue class from send-queue.ts into session-manager.ts, preserving export
- [x] 5.2 Delete src/lib/agent-session/send-queue.ts
- [x] 5.3 Update agent-session/index.ts barrel to re-export SendQueue from ./session-manager.js instead of ./send-queue.js
- [x] 5.4 Run npm run check and confirm green including barrel-equivalence test

## 6. Final verification and review handoff ✓

> Run full verification suite after all changes and confirm all completion conditions are met.

> Depends on: delete-dormant-modules, retire-setup-spec, merge-completion-into-window, merge-send-queue-into-session-manager

- [x] 6.1 Confirm ecosystem-detector.ts and profile-diff.ts no longer exist on disk
- [x] 6.2 Confirm completion.ts and send-queue.ts no longer exist on disk
- [x] 6.3 Run npm run check (typecheck + lint + format + coverage + validate:contracts + tests) and confirm green
- [x] 6.4 Run openspec validate librefactoring --type change and confirm green
- [x] 6.5 Confirm barrel-equivalence smoke test passes for all three barrels
- [x] 6.6 Verify coverage has not dropped beyond lines removed
