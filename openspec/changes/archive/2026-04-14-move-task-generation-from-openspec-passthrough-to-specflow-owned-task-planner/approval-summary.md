# Approval Summary: move-task-generation-from-openspec-passthrough-to-specflow-owned-task-planner

**Generated**: 2026-04-14T11:09:33Z
**Branch**: move-task-generation-from-openspec-passthrough-to-specflow-owned-task-planner
**Status**: ✅ No unresolved high

## What Changed

```
 package.json                              |  1 +
 src/contracts/command-bodies.ts           |  4 +--
 src/contracts/orchestrators.ts            |  8 ++++++
 src/lib/artifact-phase-gates.ts           | 45 ++++++++++++++++++++++++++++---
 src/lib/artifact-types.ts                 | 18 ++++++++++---
 src/lib/local-fs-change-artifact-store.ts |  2 ++
 src/lib/schemas.ts                        | 21 +++++++++++++++
 src/tests/artifact-store.test.ts          | 22 +++++++++++++++
 src/tests/artifact-types.test.ts          |  5 ++--
 src/types/contracts.ts                    |  1 +
 10 files changed, 116 insertions(+), 11 deletions(-)
```

New files (untracked):
- `bin/specflow-generate-task-graph` — bin launcher
- `src/bin/specflow-generate-task-graph.ts` — CLI for task graph generation
- `src/lib/task-planner/types.ts` — TaskGraph, Bundle, Task types
- `src/lib/task-planner/schema.ts` — JSON schema validation + cycle detection
- `src/lib/task-planner/generate.ts` — LLM-based task graph generation with retry
- `src/lib/task-planner/render.ts` — Deterministic tasks.md rendering
- `src/lib/task-planner/completion.ts` — Bundle completion check
- `src/lib/task-planner/window.ts` — Next execution window selection
- `src/lib/task-planner/status.ts` — Immutable bundle status transitions
- `src/lib/task-planner/index.ts` — Public re-exports
- `src/tests/task-planner-schema.test.ts` — 13 schema validation tests
- `src/tests/task-planner-core.test.ts` — 23 core function tests
- `src/tests/artifact-phase-gates.test.ts` — 7 gate matrix tests

## Files Touched

package.json, src/contracts/command-bodies.ts, src/contracts/orchestrators.ts, src/lib/artifact-phase-gates.ts, src/lib/artifact-types.ts, src/lib/local-fs-change-artifact-store.ts, src/lib/schemas.ts, src/tests/artifact-store.test.ts, src/tests/artifact-types.test.ts, src/types/contracts.ts

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
| 1 | TaskGraph JSON schema with bundle-based structure | Yes | src/lib/task-planner/types.ts, src/lib/task-planner/schema.ts |
| 2 | Task graph generated from design.md via LLM inference | Yes | src/lib/task-planner/generate.ts, src/bin/specflow-generate-task-graph.ts |
| 3 | tasks.md rendered from task graph as single source of truth | Yes | src/lib/task-planner/render.ts |
| 4 | Bundle completion by output artifact existence | Yes | src/lib/task-planner/completion.ts |
| 5 | Apply phase reads task graph for next window selection | Yes | src/lib/task-planner/window.ts |
| 6 | Apply phase writes back bundle status | Yes | src/lib/task-planner/status.ts |
| 7 | Legacy fallback for changes without task graph | Yes | src/lib/artifact-phase-gates.ts (oneOf gate) |
| 8 | task-graph added to ChangeArtifactType | Yes | src/lib/artifact-types.ts |
| 9 | ChangeArtifactStore task-graph read/write/exists | Yes | src/lib/local-fs-change-artifact-store.ts |
| 10 | Gate matrix updated with oneOf(task-graph, tasks) | Yes | src/lib/artifact-phase-gates.ts |
| 11 | MissingRequiredArtifactError handles oneOf variant | Yes | src/lib/artifact-types.ts |

**Coverage Rate**: 11/11 (100%)

## Remaining Risks

- R2-F06: Duplicated system prompt between generate.ts and CLI bin (severity: low)
- R2-F07: generateTaskGraphResultValidator does not validate status enum values (severity: low)

## Human Checkpoints

- [ ] Verify `specflow-generate-task-graph` CLI works end-to-end with a real design.md (requires review agent configured)
- [ ] Confirm the `oneOf` gate fallback correctly handles legacy changes in CI where only tasks.md exists
- [ ] Review the LLM system prompt in generate.ts and the CLI bin for prompt quality and alignment
- [ ] Test the full specflow pipeline (`/specflow` → `/specflow.design` → `/specflow.apply`) on a new change to verify the task-graph integration works end-to-end
