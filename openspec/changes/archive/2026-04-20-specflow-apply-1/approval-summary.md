# Approval Summary: specflow-apply-1

**Generated**: 2026-04-20T10:41:53Z
**Branch**: specflow-apply-1
**Status**: ✅ No unresolved high

## What Changed

```
 assets/commands/specflow.apply.md.tmpl            |  39 +-
 src/bin/specflow-generate-task-graph.ts           |  34 +-
 src/lib/apply-dispatcher/capability-resolution.ts | 125 ++++++
 src/lib/apply-dispatcher/classify.ts              |  58 +++
 src/lib/apply-dispatcher/config.ts                | 169 ++++++++
 src/lib/apply-dispatcher/context-package.ts       | 267 ++++++++++++
 src/lib/apply-dispatcher/index.ts                 |  45 ++
 src/lib/apply-dispatcher/orchestrate.ts           | 155 +++++++
 src/lib/apply-dispatcher/types.ts                 |  66 +++
 src/lib/task-planner/enrich.ts                    |  28 ++
 src/lib/task-planner/generate.ts                  |  35 +-
 src/lib/task-planner/schema.ts                    |  21 +
 src/lib/task-planner/types.ts                     |   1 +
 src/tests/__snapshots__/specflow.apply.md.snap    |  39 +-
 src/tests/apply-dispatcher-classify.test.ts       | 139 ++++++
 src/tests/apply-dispatcher-config.test.ts         | 247 +++++++++++
 src/tests/apply-dispatcher-context.test.ts        | 491 ++++++++++++++++++++++
 src/tests/apply-dispatcher-orchestrate.test.ts    | 458 ++++++++++++++++++++
 src/tests/generation.test.ts                      | 150 +++++++
 src/tests/task-planner-core.test.ts               |  90 ++++
 src/tests/task-planner-enrich.test.ts             | 289 +++++++++++++
 src/tests/task-planner-schema.test.ts             | 116 +++++
 22 files changed, 3049 insertions(+), 13 deletions(-)
```

## Files Touched

```
assets/commands/specflow.apply.md.tmpl
src/bin/specflow-generate-task-graph.ts
src/lib/apply-dispatcher/capability-resolution.ts
src/lib/apply-dispatcher/classify.ts
src/lib/apply-dispatcher/config.ts
src/lib/apply-dispatcher/context-package.ts
src/lib/apply-dispatcher/index.ts
src/lib/apply-dispatcher/orchestrate.ts
src/lib/apply-dispatcher/types.ts
src/lib/task-planner/enrich.ts
src/lib/task-planner/generate.ts
src/lib/task-planner/schema.ts
src/lib/task-planner/types.ts
src/tests/__snapshots__/specflow.apply.md.snap
src/tests/apply-dispatcher-classify.test.ts
src/tests/apply-dispatcher-config.test.ts
src/tests/apply-dispatcher-context.test.ts
src/tests/apply-dispatcher-orchestrate.test.ts
src/tests/generation.test.ts
src/tests/task-planner-core.test.ts
src/tests/task-planner-enrich.test.ts
src/tests/task-planner-schema.test.ts
```

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 2     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 3     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 4     |
| Unresolved high    | 0     |
| New high (later)   | 3     |
| Total rounds       | 5     |

## Proposal Coverage

Acceptance criteria extracted from `openspec/changes/specflow-apply-1/specs/bundle-subagent-execution/spec.md` (ADDED requirements) and `specs/task-planner/spec.md` + `specs/slash-command-guides/spec.md` (MODIFIED + ADDED).

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Subagent dispatch opt-in via `apply.subagent_dispatch` config with `enabled`, `threshold`, `max_concurrency` | Yes | src/lib/apply-dispatcher/config.ts, src/tests/apply-dispatcher-config.test.ts |
| 2 | Default-disabled behavior preserves legacy inline execution | Yes | src/lib/apply-dispatcher/config.ts, src/tests/apply-dispatcher-config.test.ts |
| 3 | Legacy fallback bypasses dispatch even when enabled (no task-graph.json) | Yes | src/lib/apply-dispatcher/config.ts (shouldUseDispatcher), assets/commands/specflow.apply.md.tmpl |
| 4 | Bundle subagent-eligibility derived from `size_score > threshold` | Yes | src/lib/apply-dispatcher/classify.ts, src/tests/apply-dispatcher-classify.test.ts |
| 5 | Missing `size_score` forces inline-only classification | Yes | src/lib/apply-dispatcher/classify.ts, src/tests/apply-dispatcher-classify.test.ts |
| 6 | Window-level uniform subagent dispatch (one eligible promotes all) | Yes | src/lib/apply-dispatcher/classify.ts, src/tests/apply-dispatcher-classify.test.ts |
| 7 | Window with no eligible bundles executes inline | Yes | src/lib/apply-dispatcher/classify.ts, src/tests/apply-dispatcher-classify.test.ts |
| 8 | Windows processed sequentially (W2 waits for W1 to settle) | Yes | src/lib/apply-dispatcher/orchestrate.ts, src/tests/apply-dispatcher-orchestrate.test.ts |
| 9 | Parallel fan-out bounded by `max_concurrency` (chunked, serial between chunks) | Yes | src/lib/apply-dispatcher/classify.ts, src/lib/apply-dispatcher/orchestrate.ts, src/tests/apply-dispatcher-orchestrate.test.ts |
| 10 | Chunk boundaries deterministic across runs | Yes | src/tests/apply-dispatcher-classify.test.ts |
| 11 | Context package assembled per bundle (six categories) | Yes | src/lib/apply-dispatcher/context-package.ts, src/tests/apply-dispatcher-context.test.ts |
| 12 | Missing capability (neither baseline nor delta) fails fast with zero mutation | Yes | src/lib/apply-dispatcher/capability-resolution.ts, src/lib/apply-dispatcher/context-package.ts (preflightWindow), src/tests/apply-dispatcher-orchestrate.test.ts |
| 13 | Main agent is sole caller of `specflow-advance-bundle`; subagents MUST NOT mutate | Yes | src/lib/apply-dispatcher/orchestrate.ts, assets/commands/specflow.apply.md.tmpl (subagent constraints block) |
| 14 | Fail-fast on subagent failure: drain chunk, record successes, leave failed in_progress, STOP | Yes | src/lib/apply-dispatcher/orchestrate.ts (runDispatchedWindow), src/tests/apply-dispatcher-orchestrate.test.ts |
| 15 | Fail-fast on advance-done CLI error: STOP immediately (R4-F08) | Yes | src/lib/apply-dispatcher/orchestrate.ts, src/tests/apply-dispatcher-orchestrate.test.ts |
| 16 | `size_score = bundle.tasks.length` emitted during generation; schema tolerates absence | Yes | src/lib/task-planner/types.ts, src/lib/task-planner/schema.ts, src/lib/task-planner/enrich.ts, src/lib/task-planner/generate.ts, src/bin/specflow-generate-task-graph.ts, src/tests/task-planner-schema.test.ts, src/tests/task-planner-enrich.test.ts, src/tests/task-planner-core.test.ts |
| 17 | Pre-feature graphs without `size_score` remain valid (backward compatibility) | Yes | src/lib/task-planner/schema.ts, src/tests/task-planner-schema.test.ts |
| 18 | Schema rejects `size_score` that does not equal `tasks.length` | Yes | src/lib/task-planner/schema.ts, src/tests/task-planner-schema.test.ts |
| 19 | Generator strips stale LLM-emitted `size_score` before validation (R3-F06) | Yes | src/lib/task-planner/generate.ts, src/bin/specflow-generate-task-graph.ts, src/tests/task-planner-core.test.ts |
| 20 | Path-traversal defence for bundle `inputs` and capability names (R3-F05) | Yes | src/lib/apply-dispatcher/capability-resolution.ts, src/lib/apply-dispatcher/context-package.ts, src/tests/apply-dispatcher-context.test.ts |
| 21 | Symlink-traversal defence (realpath containment check) | Yes | src/lib/apply-dispatcher/capability-resolution.ts, src/lib/apply-dispatcher/context-package.ts |
| 22 | `/specflow.apply` Step 1 guide documents dispatcher branching, 6-item package, chunked fan-out, fail-fast, subagent constraints | Yes | assets/commands/specflow.apply.md.tmpl, src/tests/__snapshots__/specflow.apply.md.snap, src/tests/generation.test.ts |
| 23 | YAML config reader bounded to the `apply.subagent_dispatch` section (R3-F07) | Yes | src/lib/apply-dispatcher/config.ts, src/tests/apply-dispatcher-config.test.ts |

**Coverage Rate**: 23/23 (100%)

## Remaining Risks

### Deterministic (from review-ledger)

- R5-F09: Missing context artifacts are silently downgraded to empty strings (severity: medium)
- R5-F10: Absolute checkout-local input paths are still accepted (severity: low)

### Untested new files

None — every new file is referenced by at least one finding or covered by the dispatcher unit tests.

### Uncovered criteria

None — all 23 acceptance criteria map to at least one changed file.

## Human Checkpoints

- [ ] Verify `apply.subagent_dispatch.enabled: false` default is truly a no-op for existing users by running `/specflow.apply` on a change generated before this feature (no `size_score` in task-graph.json) and confirming the legacy inline path is taken.
- [ ] Run `/specflow.apply` end-to-end on a non-trivial change with `apply.subagent_dispatch.enabled: true` and at least one bundle above the threshold, inspect the dispatched subagent payload shape, and confirm no subagent attempts to call `specflow-advance-bundle` or edit `task-graph.json` / `tasks.md`.
- [ ] Decide whether R5-F09 (missing-artifact → empty-string downgrade) warrants a follow-up PR that either emits a warning or marks the artifact as `not_found` in the context package, to help subagents distinguish "empty but present" from "missing".
- [ ] Decide whether R5-F10 (repo-internal absolute paths silently accepted) warrants tightening to require repo-relative inputs across the board.
- [ ] Confirm operator-facing documentation (README / CLAUDE.md) is updated in a follow-up to describe the new `apply.subagent_dispatch` config knobs and the opt-in upgrade path (regenerate `task-graph.json` via `specflow-generate-task-graph <CHANGE_ID>` to populate `size_score`).
