## 1. Artifact Model Extension

- [x] 1.1 Add `TaskGraph: "task-graph"` to `ChangeArtifactType` in `src/lib/artifact-types.ts`
- [x] 1.2 Add `"task-graph"` to `SingletonChangeArtifactType` union
- [x] 1.3 Add `task-graph` path resolution case to `resolvePath()` in `src/lib/local-fs-change-artifact-store.ts`
- [x] 1.4 Update artifact type tests in `src/tests/artifact-types.test.ts` and `src/tests/artifact-store.test.ts`

## 2. Task Graph Schema and Types

- [x] 2.1 Create `src/lib/task-planner/types.ts` with `TaskGraph`, `Bundle`, `Task`, `BundleStatus` type definitions
- [x] 2.2 Create `src/lib/task-planner/schema.ts` with JSON schema definition object and `validateTaskGraph()` function
- [x] 2.3 Write unit tests for schema validation (valid graph, missing fields, duplicate IDs, cycle detection, invalid refs)

## 3. Task Graph Generation

- [x] 3.1 Define `LlmClient` interface in `src/lib/task-planner/generate.ts`
- [x] 3.2 Implement `generateTaskGraph(designContent, changeId, specNames, llmClient)` with prompt construction
- [x] 3.3 Implement JSON schema validation + retry loop (up to configurable max attempts)
- [x] 3.4 Write unit tests with mock LLM client (success, validation failure + retry, all retries exhausted)

## 4. Tasks Markdown Rendering

- [x] 4.1 Create `src/lib/task-planner/render.ts` with `renderTasksMd(taskGraph)` function
- [x] 4.2 Render bundle headings with title, goal, dependency annotations, and status indicators
- [x] 4.3 Render task checkboxes within each bundle section
- [x] 4.4 Write unit tests for rendering (all bundles present, dependency info, idempotent output)

## 5. Bundle Completion and Window Selection

- [x] 5.1 Create `src/lib/task-planner/completion.ts` with `checkBundleCompletion(bundle, artifactChecker)`
- [x] 5.2 Create `src/lib/task-planner/window.ts` with `selectNextWindow(taskGraph, artifactChecker)`
- [x] 5.3 Write unit tests for completion (all outputs present, missing outputs, empty outputs)
- [x] 5.4 Write unit tests for window selection (independent bundles, soft dependency resolution, non-pending exclusion)

## 6. Status Transitions

- [x] 6.1 Create `src/lib/task-planner/status.ts` with `updateBundleStatus(taskGraph, bundleId, newStatus)`
- [x] 6.2 Implement valid transition validation (pending→in_progress, in_progress→done, pending→skipped)
- [x] 6.3 Ensure immutability — return new TaskGraph without mutating original
- [x] 6.4 Write unit tests for valid transitions, invalid transitions, and immutability

## 7. Gate Matrix Update

- [x] 7.1 Add `oneOf` variant to `ArtifactRequirement` type in `src/lib/artifact-types.ts` and add `oneOf()` helper function in `src/lib/artifact-phase-gates.ts` (alongside the existing `req()` helper)
- [x] 7.2 Update `resolveRequirement()` in `src/lib/artifact-phase-gates.ts` to handle the `oneOf` variant (iterate candidates, resolve each, return first existing ref) and update `checkGateRequirements()` to handle `oneOf` resolution
- [x] 7.3 Update `MissingRequiredArtifactError` in `src/lib/artifact-types.ts` to format the `oneOf` variant correctly (list all candidate types in the error message)
- [x] 7.4 Update `design_draft → review_design` gate to use `oneOf("task-graph", "tasks")`
- [x] 7.5 Update `apply_draft → review_apply` gate to use `oneOf("task-graph", "tasks")`
- [x] 7.6 Write unit tests for gate with task-graph present, tasks fallback, neither present, and `MissingRequiredArtifactError` formatting for `oneOf`

## 8. Module Index and Integration

- [x] 8.1 Create `src/lib/task-planner/index.ts` with public re-exports
- [x] 8.2 Verify all task-planner functions are importable from the index
- [x] 8.3 Run full test suite to confirm no regressions

## 9. Design Skill Integration

> Depends on: bundles 3, 4, 8

- [x] 9.1 Update the `/specflow.design` skill/command to call `generateTaskGraph()` + `renderTasksMd()` after design.md generation, replacing the OpenSpec tasks template passthrough
- [x] 9.2 Persist the generated `task-graph.json` and rendered `tasks.md` via `ChangeArtifactStore.write()`
- [x] 9.3 Disable OpenSpec tasks template/instruction usage in the design phase
- [x] 9.4 Write integration test verifying the design skill produces both `task-graph.json` and `tasks.md`

## 10. Apply Phase Runtime Integration

> Depends on: bundles 5, 6, 7

- [x] 10.1 Wire `selectNextWindow()` into the apply phase runtime (e.g., `src/core/run-commands.ts` or apply skill) to read `task-graph.json` and select eligible bundles for the current execution window
- [x] 10.2 Wire `updateBundleStatus()` into the apply phase to write back status transitions (`pending → in_progress → done`) after bundle execution, followed by `renderTasksMd()` re-render
- [x] 10.3 Implement legacy fallback path: when `task-graph.json` is absent, fall back to reading `tasks.md` directly (unified interface that abstracts over both modes)
- [x] 10.4 Write integration tests for apply phase with task-graph present, legacy fallback, and status write-back
