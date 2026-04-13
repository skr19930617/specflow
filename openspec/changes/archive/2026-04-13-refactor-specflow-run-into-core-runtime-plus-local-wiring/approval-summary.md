# Approval Summary: refactor-specflow-run-into-core-runtime-plus-local-wiring

**Generated**: 2026-04-13T06:53:09Z
**Branch**: refactor-specflow-run-into-core-runtime-plus-local-wiring
**Status**: ✅ No unresolved high

## What Changed

```
 src/bin/specflow-run.ts        | 561 +++++++++++-------------------------
 src/tests/specflow-run.test.ts | 628 +++++++----------------------------------
 2 files changed, 265 insertions(+), 924 deletions(-)
```

Note: the stat above covers tracked files only. 14 new files under
`src/core/` and `src/tests/helpers/` are untracked and will be staged by
the approve flow's `git add -A`:

- `src/core/_helpers.ts`
- `src/core/advance.ts`
- `src/core/get-field.ts`
- `src/core/resume.ts`
- `src/core/run-core.ts`
- `src/core/start.ts`
- `src/core/status.ts`
- `src/core/suspend.ts`
- `src/core/types.ts`
- `src/core/update-field.ts`
- `src/tests/core-advance.test.ts`
- `src/tests/core-error-wording.test.ts`
- `src/tests/core-purity.test.ts`
- `src/tests/core-start.test.ts`
- `src/tests/core-status-fields.test.ts`
- `src/tests/core-suspend-resume.test.ts`
- `src/tests/fixtures/core-error-wording.json`
- `src/tests/helpers/fake-workspace-context.ts`
- `src/tests/helpers/in-memory-change-store.ts`
- `src/tests/helpers/in-memory-run-store.ts`
- `src/tests/helpers/workflow.ts`

## Files Touched

Tracked (modified):

- `src/bin/specflow-run.ts`
- `src/tests/specflow-run.test.ts`

Untracked (new — to be staged by `git add -A`):

- `src/core/_helpers.ts`
- `src/core/advance.ts`
- `src/core/get-field.ts`
- `src/core/resume.ts`
- `src/core/run-core.ts`
- `src/core/start.ts`
- `src/core/status.ts`
- `src/core/suspend.ts`
- `src/core/types.ts`
- `src/core/update-field.ts`
- `src/tests/core-advance.test.ts`
- `src/tests/core-error-wording.test.ts`
- `src/tests/core-purity.test.ts`
- `src/tests/core-start.test.ts`
- `src/tests/core-status-fields.test.ts`
- `src/tests/core-suspend-resume.test.ts`
- `src/tests/fixtures/core-error-wording.json`
- `src/tests/helpers/fake-workspace-context.ts`
- `src/tests/helpers/in-memory-change-store.ts`
- `src/tests/helpers/in-memory-run-store.ts`
- `src/tests/helpers/workflow.ts`

OpenSpec change directory (`openspec/changes/refactor-specflow-run-into-core-runtime-plus-local-wiring/`) will be archived before commit per the approve flow.

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

Impl round 1 produced one LOW finding (`R1-F01`, import consolidation in
`specflow-run.test.ts`), which was auto-resolved in round 2.

## Proposal Coverage

The proposal does not follow a Given/When/Then or FR-NNN pattern. Its
acceptance criteria come from the issue body's `Acceptance Criteria`
section and the spec deltas under
`openspec/changes/refactor-specflow-run-into-core-runtime-plus-local-wiring/specs/workflow-run-state/spec.md`.

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Core runtime is callable without CLI | Yes | `src/core/run-core.ts`, `src/core/start.ts`, `src/core/advance.ts`, `src/core/suspend.ts`, `src/core/resume.ts`, `src/core/status.ts`, `src/core/update-field.ts`, `src/core/get-field.ts`, `src/tests/core-start.test.ts`, `src/tests/core-advance.test.ts`, `src/tests/core-suspend-resume.test.ts`, `src/tests/core-status-fields.test.ts` |
| 2 | `specflow-run` is a thin local wiring layer | Yes | `src/bin/specflow-run.ts` |
| 3 | Existing local flow is not broken | Yes | `src/tests/specflow-run.test.ts` (10 smoke tests pass), `src/tests/core-error-wording.test.ts` (17 stderr parity tests pass) |
| 4 | Core runtime accepts pre-parsed WorkflowDefinition | Yes | `src/core/advance.ts` (WorkflowDefinition injected via `deps.workflow`) |
| 5 | Core runtime returns `Result<Ok, CoreRuntimeError>` (no throw, no process I/O) | Yes | `src/core/types.ts` (Result + CoreRuntimeError union), `src/tests/core-purity.test.ts` (guardrail: no process/fs/child_process imports under `src/core/`) |
| 6 | CLI wiring maps Result to stderr/stdout/exit with preserved wording | Yes | `src/bin/specflow-run.ts:renderResult`, `src/tests/core-error-wording.test.ts` (18 kinds × fixture) |
| 7 | Behavioral coverage migrates to core tests; CLI keeps smoke only | Yes | `src/tests/core-*.test.ts` (45 tests), `src/tests/specflow-run.test.ts` trimmed 27→10 tests (807→384 LOC) |

**Coverage Rate**: 7/7 (100%)

## Remaining Risks

No deterministic risks: all medium/high findings are resolved.

No untested new files: every new file under `src/core/` has a corresponding
test (or a purity guardrail test), every test helper is exercised by the
tests that use it, and the fixture file is consumed by
`src/tests/core-error-wording.test.ts`.

No uncovered criteria.

Residual considerations (informational, not blocking):

- Diff size warning (1,398 lines after filtering) was bypassed with
  `--skip-diff-check` during review. The diff is dominated by balanced
  additions in `src/core/` / `src/tests/` and deletions in
  `src/bin/specflow-run.ts` and `src/tests/specflow-run.test.ts`
  (net −659 lines on tracked files). The reviewer explicitly confirmed
  byte-for-byte preservation of the observable CLI surface.
- 11 unrelated pre-existing test failures in the baseline branch
  (`challenge-proposal`, `review-apply`, `review-design`) are
  untouched by this diff per the reviewer's summary.

## Human Checkpoints

- [ ] Run `specflow-run --help`-style smoke manually (e.g. `specflow-run status <run>` against a real local run) to confirm JSON output is byte-identical to the pre-refactor output.
- [ ] Confirm that any downstream automation parsing stderr messages (e.g. custom scripts, CI parsers) is unaffected by reviewing the `src/tests/fixtures/core-error-wording.json` snapshot.
- [ ] Decide whether `src/core/` should have its own `README.md` (or a note in `docs/architecture.md`) documenting the injection contract — deferred out of this refactor per the "no new docs" scope.
- [ ] Review `src/tests/core-purity.test.ts` as the canonical guardrail for the core/wiring boundary; confirm the rule set (node:fs, node:child_process, node:path, process.*, ../bin/*) matches the team's intent before merge.
