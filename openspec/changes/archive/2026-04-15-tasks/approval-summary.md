# Approval Summary: tasks

**Generated**: 2026-04-15T08:16:11Z
**Branch**: tasks
**Status**: ✅ No unresolved high

## What Changed

```
 src/contracts/command-bodies.ts |  26 +++++-
 src/tests/generation.test.ts    | 176 ++++++++++++++++++++++++++++++++++++++++
 2 files changed, 199 insertions(+), 3 deletions(-)
```

Plus the entire `openspec/changes/tasks/` directory as a new untracked addition (proposal.md, design.md, tasks.md, task-graph.json, specs/{slash-command-guides,task-planner,utility-cli-suite}/spec.md, review-ledger.json, review-ledger-design.json, current-phase.md). Staged at commit time via `git add -A`.

## Files Touched

### Modified (tracked)
- `src/contracts/command-bodies.ts`
- `src/tests/generation.test.ts`

### Added (currently untracked — openspec change directory)
- `openspec/changes/tasks/proposal.md`
- `openspec/changes/tasks/design.md`
- `openspec/changes/tasks/tasks.md`
- `openspec/changes/tasks/task-graph.json`
- `openspec/changes/tasks/specs/slash-command-guides/spec.md`
- `openspec/changes/tasks/specs/task-planner/spec.md`
- `openspec/changes/tasks/specs/utility-cli-suite/spec.md`
- `openspec/changes/tasks/review-ledger.json`
- `openspec/changes/tasks/review-ledger-design.json`
- `openspec/changes/tasks/current-phase.md`

### Regenerated dist (tracked; staged via `git add -A`)
- `dist/package/global/commands/specflow.apply.md`
- `dist/package/global/commands/specflow.fix_apply.md`
- Other `dist/**` artifacts touched by the full rebuild (manifest.json, install-plan.json, etc.)

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

## Proposal Coverage

Acceptance criteria extracted from `openspec/changes/tasks/specs/*/spec.md` (10 scenarios across 9 requirements in three spec deltas).

### slash-command-guides delta (4 requirements / 5 scenarios)

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Generated apply guide documents the three-way path selection | Yes | src/contracts/command-bodies.ts, src/tests/generation.test.ts |
| 2 | Generated apply guide names the CLI as the only status-mutation tool | Yes | src/contracts/command-bodies.ts, src/tests/generation.test.ts |
| 3 | Generated apply guide does not embed example inline-edit scripts | Yes | src/contracts/command-bodies.ts, src/tests/generation.test.ts (negative assertions) |
| 4 | Generated apply guide documents fail-fast on CLI error | Yes | src/contracts/command-bodies.ts, src/tests/generation.test.ts |
| 5 | Generated fix_apply guide carries the safety-net reference | Yes | src/contracts/command-bodies.ts, src/tests/generation.test.ts |

### task-planner delta (1 requirement / 4 scenarios)

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 6 | CLI named as sole entry point when task-graph is present and valid | Yes (spec codification) | openspec/changes/tasks/specs/task-planner/spec.md |
| 7 | Legacy fallback unaffected when task-graph.json is absent | Yes (spec codification) | openspec/changes/tasks/specs/task-planner/spec.md |
| 8 | Malformed task-graph.json does not permit silent fallback | Yes (spec codification + runtime encoded in command-bodies.ts) | openspec/changes/tasks/specs/task-planner/spec.md, src/contracts/command-bodies.ts |
| 9 | Violation detection explicitly out of scope | Yes (spec codification) | openspec/changes/tasks/specs/task-planner/spec.md |

### utility-cli-suite delta (4 requirements / 6 scenarios)

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 10 | CLI positional signature + allowed NEW_STATUS values | Yes (already implemented in src/bin/specflow-advance-bundle.ts; codified here) | openspec/changes/tasks/specs/utility-cli-suite/spec.md, src/bin/specflow-advance-bundle.ts |
| 11 | Stdout JSON envelope (success/error) | Yes (already implemented) | src/bin/specflow-advance-bundle.ts |
| 12 | Stderr `task_status_coercion` audit log format | Yes (already implemented) | src/bin/specflow-advance-bundle.ts |
| 13 | Exit code 0/1 two-valued contract | Yes (already implemented) | src/bin/specflow-advance-bundle.ts |

**Coverage Rate**: 13/13 (100%)

## Remaining Risks

### Deterministic risks (from review-ledger)

- R1-F01: Spec delta files not included in diff (severity: low) — Advisory. Spec deltas exist in `openspec/changes/tasks/specs/` and are validated via `openspec validate tasks --type change --json` (valid:true). They are currently untracked and will be staged together with the rest of the change via `git add -A` at commit time.

### Untested new files

None: `--diff-filter=A` against HEAD returns no new .sh / .md files under tracked paths. All new markdown (proposal, design, tasks, specs, current-phase) lives under `openspec/changes/tasks/` and is openspec schema-validated.

### Uncovered criteria

None. All 13 criteria mapped.

## Human Checkpoints

- [ ] Confirm the commit stages the untracked `openspec/changes/tasks/` directory (acceptance criteria 6–13 rely on it landing with the diff).
- [ ] Spot-check `dist/package/global/commands/specflow.apply.md` Step 1 in the PR diff view — confirm the three-way detection rule, CLI mandate, and fail-fast block render as intended.
- [ ] Confirm the regression test `specflow.apply command body source encodes the specflow-advance-bundle contract` (the orchestrator-added source-level test) covers the same positive assertions as the dist-level test, making the contract enforcement independent of build ordering.
- [ ] Decide whether to open a follow-up issue for the deferred automated violation detection (proposal Impact section explicitly marks this out of scope).
