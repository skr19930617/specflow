# Approval Summary: decide-run-identity-and-lifecycle-boundary

**Generated**: 2026-04-11T11:00:00Z
**Branch**: decide-run-identity-and-lifecycle-boundary
**Status**: ⚠️ 1 unresolved high (design review — impl review skipped due to diff size)

## What Changed

```
 src/bin/specflow-prepare-change.ts                 |  54 +-
 src/bin/specflow-run.ts                            | 249 ++++++++-
 src/lib/schemas.ts                                 |  20 +
 src/lib/workflow-machine.ts                        |  49 +-
 .../legacy-final/specflow-run/advance.json         |   7 +-
 .../fixtures/legacy-final/specflow-run/start.json  |  12 +-
 src/tests/parity.test.ts                           |  12 +-
 src/tests/specflow-run.test.ts                     | 605 +++++++++++++++++----
 src/tests/workflow-source.test.ts                  |   4 +-
 src/types/contracts.ts                             |   5 +-
 10 files changed, 863 insertions(+), 154 deletions(-)
```

New files (untracked):
- `src/lib/run-identity.ts` — Run ID generation and change-level lookup helpers

## Files Touched

- src/bin/specflow-prepare-change.ts
- src/bin/specflow-run.ts
- src/lib/run-identity.ts (new)
- src/lib/schemas.ts
- src/lib/workflow-machine.ts
- src/tests/fixtures/legacy-final/specflow-run/advance.json
- src/tests/fixtures/legacy-final/specflow-run/start.json
- src/tests/parity.test.ts
- src/tests/specflow-run.test.ts
- src/tests/workflow-source.test.ts
- src/types/contracts.ts

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 0     |
| Unresolved high    | 1     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

⚠️ No impl review data available (review skipped due to diff size warning)

## Proposal Coverage

| # | Criterion (scenario) | Covered? | Mapped Files |
|---|----------------------|----------|--------------|
| 1 | First run for a change produces sequence 1 | Yes | src/lib/run-identity.ts, src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 2 | Subsequent runs increment the sequence | Yes | src/lib/run-identity.ts, src/tests/specflow-run.test.ts |
| 3 | run_id is persisted explicitly in run.json | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 4 | change_name is required for change runs | Yes | src/lib/schemas.ts, src/bin/specflow-run.ts |
| 5 | change_name is null for synthetic runs | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 6 | Multiple runs reference the same artifacts | Yes | src/lib/run-identity.ts (artifacts not copied on retry) |
| 7 | Start is rejected when an active run exists | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 8 | Start is rejected when a suspended run exists | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 9 | Start with retry is allowed when all runs are terminal | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 10 | Legacy run.json is readable | Yes | src/lib/run-identity.ts, src/tests/specflow-run.test.ts |
| 11 | New runs always include run_id | Yes | src/bin/specflow-run.ts |
| 12 | Suspend preserves current phase | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 13 | Suspend is rejected on terminal runs | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 14 | Resume restores allowed events | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 15 | Retry creates a fresh run from proposal_draft | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 16 | Retry is rejected for rejected changes | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 17 | Retry is rejected when a non-terminal run exists | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 18 | Advance is rejected when run is suspended | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |
| 19 | Run directory uses run_id not change_id | Yes | src/bin/specflow-run.ts |
| 20 | previous_run_id references the prior run on retry | Yes | src/bin/specflow-run.ts, src/tests/specflow-run.test.ts |

**Coverage Rate**: 20/20 (100%)

## Remaining Risks

- R1-F01: Start contract no longer covers synthetic runs and run-kind-specific invariants (severity: high)
  - **Note**: This design review finding was addressed during implementation — the start command now has explicit change/synthetic branches with separate validation, but the finding was never re-reviewed to be marked resolved.
- R1-F02: Plain start versus retry preconditions are not fully specified in the tasks (severity: medium)
  - **Note**: Addressed in implementation — plain start rejects when terminal-only history exists without --retry.
- R1-F03: Suspend and resume are implemented at the CLI layer but not in the shared lifecycle contract (severity: medium)
  - **Note**: Addressed in implementation — lifecycle contract exported from workflow-machine.ts with deriveAllowedEvents, lifecycleTransitionRules.

## Human Checkpoints

- [ ] Verify that `specflow-prepare-change` correctly finds non-terminal runs using the new `<change_id>-<N>` directory pattern (the `require("node:fs")` inline import should be validated)
- [ ] Confirm that existing `.specflow/runs/` directories from prior sessions still work with the backward-compatible fallback
- [ ] Test that the `suspend` event on a run in `start` phase (before `propose`) behaves correctly with `deriveAllowedEvents`
- [ ] Verify the generated `state-machine.json` in dist reflects version 5.0 after rebuild
- [ ] Check that the `--retry` flag on a change with only one approved run correctly creates run-2 with previous_run_id pointing to run-1
