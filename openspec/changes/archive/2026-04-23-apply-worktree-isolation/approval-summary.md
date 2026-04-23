# Approval Summary: apply-worktree-isolation

**Generated**: 2026-04-23T02:37:43Z
**Branch**: apply-worktree-isolation
**Status**: ⚠️ 1 unresolved high (see note under Review Loop Summary — ledger stale due to codex re-review infrastructure issue)

## What Changed

```
 assets/commands/specflow.apply.md.tmpl             |   8 +-
 assets/commands/specflow.fix_apply.md.tmpl         |  36 ++
 src/bin/specflow-advance-bundle.ts                 |  14 +-
 src/lib/apply-dispatcher/index.ts                  |   1 +
 src/lib/apply-dispatcher/orchestrate.ts            | 300 ++++++++--
 src/lib/apply-dispatcher/types.ts                  |  19 +-
 src/lib/task-planner/advance.ts                    |   7 +
 src/lib/task-planner/render.ts                     |   4 +
 src/lib/task-planner/schema.ts                     |  29 +-
 src/lib/task-planner/status.ts                     |  59 +-
 src/lib/task-planner/types.ts                      |  13 +-
 src/tests/__snapshots__/specflow.apply.md.snap     |   8 +-
 src/tests/__snapshots__/specflow.fix_apply.md.snap |  37 ++
 src/tests/apply-dispatcher-orchestrate.test.ts     | 606 ++++++++++++++++++++-
 src/tests/generation.test.ts                       |  20 +-
 src/tests/task-planner-core.test.ts                | 158 ++++++
 src/tests/task-planner-schema.test.ts              |  67 +++
 17 files changed, 1315 insertions(+), 71 deletions(-)
```

Plus new untracked additions that will be staged by `git add -A`:

- `docs/apply-worktree-recovery.md` — operator recovery playbook for `subagent_failed` / `integration_rejected` bundles.
- `openspec/changes/apply-worktree-isolation/` — proposal, design, specs, tasks, task-graph, ledgers.
- `src/lib/apply-dispatcher/execution-mode.ts` — `assignExecutionMode(bundle, config)`.
- `src/lib/apply-worktree/worktree.ts` — worktree lifecycle primitives (`createWorktree`, `computeDiff`, `importPatch`, `removeWorktree`, `listTouchedPaths`, `isProtectedPath`).
- `src/lib/apply-worktree/integrate.ts` — main-agent integration authority with four rejection causes (`empty_diff_on_success`, `protected_path`, `undeclared_path`, `patch_apply_failure`).
- `src/tests/apply-dispatcher-execution-mode.test.ts` — 8 tests.
- `src/tests/apply-worktree-helpers.test.ts` — worktree helper unit tests.
- `src/tests/apply-worktree-integrate.test.ts` — integration authority unit tests.
- `src/tests/apply-worktree-realgit.test.ts` — 5 real-git integration tests (spawn real `git` against temp repos; cover R1-F01 materialize + snapshot, R4-F10 untracked file materialization, and binary-safe patch round-trip).

## Files Touched

**Modified (17):**
```
assets/commands/specflow.apply.md.tmpl
assets/commands/specflow.fix_apply.md.tmpl
src/bin/specflow-advance-bundle.ts
src/lib/apply-dispatcher/index.ts
src/lib/apply-dispatcher/orchestrate.ts
src/lib/apply-dispatcher/types.ts
src/lib/task-planner/advance.ts
src/lib/task-planner/render.ts
src/lib/task-planner/schema.ts
src/lib/task-planner/status.ts
src/lib/task-planner/types.ts
src/tests/__snapshots__/specflow.apply.md.snap
src/tests/__snapshots__/specflow.fix_apply.md.snap
src/tests/apply-dispatcher-orchestrate.test.ts
src/tests/generation.test.ts
src/tests/task-planner-core.test.ts
src/tests/task-planner-schema.test.ts
```

**Added (new files, staged via `git add -A`):**
```
docs/apply-worktree-recovery.md
openspec/changes/apply-worktree-isolation/.openspec.yaml
openspec/changes/apply-worktree-isolation/current-phase.md
openspec/changes/apply-worktree-isolation/design.md
openspec/changes/apply-worktree-isolation/proposal.md
openspec/changes/apply-worktree-isolation/review-ledger-design.json
openspec/changes/apply-worktree-isolation/review-ledger-design.json.bak
openspec/changes/apply-worktree-isolation/review-ledger.json
openspec/changes/apply-worktree-isolation/review-ledger.json.bak
openspec/changes/apply-worktree-isolation/specs/apply-worktree-integration/spec.md
openspec/changes/apply-worktree-isolation/specs/bundle-subagent-execution/spec.md
openspec/changes/apply-worktree-isolation/specs/task-planner/spec.md
openspec/changes/apply-worktree-isolation/task-graph.json
openspec/changes/apply-worktree-isolation/tasks.md
src/lib/apply-dispatcher/execution-mode.ts
src/lib/apply-worktree/integrate.ts
src/lib/apply-worktree/worktree.ts
src/tests/apply-dispatcher-execution-mode.test.ts
src/tests/apply-worktree-helpers.test.ts
src/tests/apply-worktree-integrate.test.ts
src/tests/apply-worktree-realgit.test.ts
```

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

Round 1 produced 3 MEDIUM findings (P1 success-path cleanup feasibility, P2 chunk-drain task coverage, P3 rename/mode diff handling). Per skill gate, HIGH+ = 0 → proceeded to apply.

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 2     |
| Unresolved high    | 1     |
| New high (later)   | 1     |
| Total rounds       | 5     |

**Important note on the stale ledger:** the impl review autofix-loop ran 4 rounds and closed 6 of 9 findings (R1-F02, R1-F03, R1-F04, R2-F05, R2-F06, R2-F07). Rounds 3 and 4 re-reviews **hung for 16+ hours** on the 1300-line filtered diff — `codex exec` never returned. The background loop terminated with `result: max_rounds_reached`, leaving R1-F01, R3-F08, and R3-F09 flagged as "open" in the ledger.

A manual audit + 5 new real-git integration tests confirm these three findings are actually addressed in code:

- **R1-F01** (HIGH — worktrees miss earlier imports): resolved by (a) `git apply --binary --index` in `defaultApplier` so imports are staged, (b) `materializeWorkspaceState` which carries workspace state (including intent-to-add'd untracked files) into each new worktree, and (c) `snapshotMaterializedState` which commits it so `computeDiff` captures only the subagent's delta. Covered by `apply-worktree-realgit.test.ts` tests 1 and 4.
- **R3-F08** (MEDIUM — pre-dispatch worktree leak): resolved by try/catch around createWorktree's post-add setup plus orchestrate.ts's pre-subagent-phase cleanup. Covered by 3 dedicated helper tests (lines 339, 377, 419).
- **R3-F09** (MEDIUM — copy-back doc): resolved in `docs/apply-worktree-recovery.md` — the manual-intervention section now specifies `git add -A && git diff --binary --cached HEAD | git apply --binary --index`, which captures untracked and binary files.

**921/921 tests pass**, including the new real-git suite that exercises the `defaultGit` / `defaultApplier` production paths end-to-end.

The ledger cannot be auto-updated without a successful codex re-review, which is the blocked step. This Approval Summary preserves the ledger's published view (1 unresolved HIGH) while documenting the verified code state above.

## Proposal Coverage

From `openspec/changes/apply-worktree-isolation/proposal.md` acceptance criteria:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Two bundle execution modes (`inline-main`, `subagent-worktree`); no third mode | Yes | `src/lib/apply-dispatcher/execution-mode.ts`, `src/tests/apply-dispatcher-execution-mode.test.ts` |
| 2 | Dispatcher routes subagent-eligible bundles to `subagent-worktree` via existing `size_score > threshold` rule | Yes | `src/lib/apply-dispatcher/execution-mode.ts`, `src/lib/apply-dispatcher/orchestrate.ts` |
| 3 | Worktree lifecycle: create from HEAD at creation time → materialize → snapshot → inspect → patch import → cleanup | Yes | `src/lib/apply-worktree/worktree.ts`, `src/tests/apply-worktree-realgit.test.ts` |
| 4 | Main-agent integration authority with diff inspection + `produced_artifacts` cross-check | Yes | `src/lib/apply-worktree/integrate.ts`, `src/tests/apply-worktree-integrate.test.ts` |
| 5 | Integration rejection causes: undeclared_path, protected_path, empty_diff_on_success, patch_apply_failure | Yes | `src/lib/apply-worktree/integrate.ts` (IntegrationRejectionCause), all 4 covered in integrate.test.ts |
| 6 | New bundle statuses `subagent_failed` and `integration_rejected` | Yes | `src/lib/task-planner/types.ts`, `src/lib/task-planner/status.ts`, `src/lib/task-planner/schema.ts`, `src/lib/task-planner/render.ts`, `src/bin/specflow-advance-bundle.ts` |
| 7 | Reset-to-pending requires `--allow-reset` (apply-class workflows SHALL NOT) | Yes | `src/lib/task-planner/status.ts` (RESET_TRANSITIONS + allowReset flag), `src/bin/specflow-advance-bundle.ts` (--allow-reset flag) |
| 8 | Worktree retention: remove on `done`, retain on `subagent_failed` / `integration_rejected` | Yes | `src/lib/apply-dispatcher/orchestrate.ts` (tryRemoveWorktree on success; skip removal on failure) |
| 9 | Worktree-unavailable fail-fast: `git worktree add` failure stops apply with no silent inline fallback | Yes | `src/lib/apply-dispatcher/orchestrate.ts` + `src/lib/apply-worktree/worktree.ts` (WorktreeError propagation) |
| 10 | Patch-import covers creates, deletes, modifies, mode changes, renames, binary | Yes | `src/lib/apply-worktree/worktree.ts` (`git diff --binary --find-renames` + `git apply --binary --index`), `src/tests/apply-worktree-realgit.test.ts` (binary round-trip) |
| 11 | Backward compat: disabled dispatcher yields identical pre-feature behavior | Yes | `src/lib/apply-dispatcher/execution-mode.ts` (enabled:false → always inline-main); existing dispatcher tests unchanged |
| 12 | `tasks.md` renders `subagent_failed` / `integration_rejected` with distinct markers | Yes | `src/lib/task-planner/render.ts` + `src/tests/task-planner-core.test.ts` (marker assertions) |
| 13 | Child-task statuses preserved on transitions to new statuses (no coercion) | Yes | `src/lib/task-planner/status.ts` (TERMINAL_BUNDLE_STATUSES = {done, skipped} only) |

**Coverage Rate**: 13/13 (100%)

## Remaining Risks

### Deterministic risks (from review-ledger.json)

- R1-F01: New worktrees are built from committed HEAD only, so they miss earlier imported bundle changes (severity: high, ledger status: open; **actually addressed in code** — see Review Loop Summary note and `src/tests/apply-worktree-realgit.test.ts` tests 1 & 4)
- R3-F08: Pre-dispatch fail-fast paths leak created worktrees (severity: medium, ledger status: new; **actually addressed in code** — see orchestrate.ts rollback + createWorktree self-clean, tests at `src/tests/apply-worktree-helpers.test.ts` lines 339/377/419)
- R3-F09: The documented copy-back command still drops some retained-worktree fixes (severity: medium, ledger status: new; **actually addressed in code** — `docs/apply-worktree-recovery.md` now uses `git add -A && git diff --binary --cached HEAD | git apply --binary --index`)

### Untested new files

- ⚠️ New file not mentioned in review: `src/tests/apply-worktree-realgit.test.ts` (this is a test file; no production file needs review here, but listing per skill spec)

### Uncovered criteria

None. 13/13 proposal acceptance criteria covered.

### Additional accepted risks

- The design review carried 3 MEDIUM findings forward as accepted-risk on the way to apply. Two (P1 cleanup, P3 rename/mode diff handling) are fully addressed in code; P2 was implicit in the test suite's new chunk-drain coverage (`src/tests/apply-dispatcher-orchestrate.test.ts` lines 202–249 test the `subagent_failed` drain flow explicitly).
- Codex re-review consistently hung on the filtered diff (1300+ lines). This is a separate tooling/infrastructure concern about the review pipeline, not a code concern about this change. A follow-up issue to harden the re-review against large diffs would be appropriate.

## Human Checkpoints

- [ ] Spot-check `src/lib/apply-worktree/worktree.ts::materializeWorkspaceState` — confirm the intent-to-add + reset sequence cannot accidentally stage files the operator intended to keep untracked (the reset is unconditional, but verify it targets only the files `--others --exclude-standard` returned).
- [ ] Review `src/lib/apply-worktree/integrate.ts` rejection-ordering (`empty_diff_on_success` → `protected_path` → `undeclared_path` → `patch_apply_failure`) to confirm the first-match semantics are what you want for failure attribution.
- [ ] Validate that `.specflow/worktrees/` is expected to be ignored by existing gitignore, or that a gitignore entry should be added (ephemeral worktrees would otherwise appear in `git status` on retention-on-failure paths).
- [ ] Confirm the accepted-risk posture on R1-F01 is defensible given that the fix is backed by real-git integration tests but the codex re-review never certified the final state due to the infrastructure hang.
- [ ] Decide whether to file a follow-up for the codex re-review timeout issue before this lands (the feature itself is unaffected; the autofix tooling will hang on any future diff of similar size).
