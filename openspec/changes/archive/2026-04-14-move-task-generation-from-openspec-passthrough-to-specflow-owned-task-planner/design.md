## Context

specflow currently delegates `tasks.md` generation to OpenSpec's template/instruction passthrough in the design phase. This produces a human-readable checklist that works for manual tracking but lacks machine-readable structure for:

- Execution windowing in the apply phase (selecting which bundles to run next)
- Sub-agent bounded context (passing isolated work units to specialist agents)
- Dependency graph resolution (determining parallelizable work)
- Output-artifact-based completion semantics (vs. checkbox counting)

The existing artifact model (`src/lib/artifact-types.ts`) defines 7 change-domain types. The `ChangeArtifactStore` interface and `LocalFsChangeArtifactStore` adapter handle read/write/exists for all types. The artifact-phase gate matrix (`src/lib/artifact-phase-gates.ts`) validates required artifacts at phase transitions.

This design introduces a `task-planner` module as a specflow-owned responsibility, adds `task-graph` as a new change-domain artifact type, and wires the apply phase to consume the task graph for window selection and status tracking.

## Goals / Non-Goals

**Goals:**
- Define the `TaskGraph` JSON schema with bundle-based structure
- Implement LLM-based task graph generation from `design.md` with JSON schema validation and retry
- Implement deterministic `tasks.md` rendering from task graph
- Add `task-graph` as a change-domain artifact type in the artifact model
- Wire apply phase to read task graph for next-window selection and write back bundle status
- Provide legacy fallback for existing changes without `task-graph.json`

**Non-Goals:**
- Replacing OpenSpec proposal/spec/design generation
- Introducing full server orchestration
- Implementing graph-based progress UI
- Full apply-phase windowed execution runtime (only the interface and selection logic)

## Decisions

### D1: New module at `src/lib/task-planner/`

The task-planner module lives under `src/lib/task-planner/` with the following files:

| File | Responsibility |
|------|---------------|
| `types.ts` | `TaskGraph`, `Bundle`, `Task`, `BundleStatus` types and JSON schema |
| `schema.ts` | JSON schema definition object and `validateTaskGraph()` function |
| `generate.ts` | `generateTaskGraph()` — LLM-based inference from design.md |
| `render.ts` | `renderTasksMd()` — deterministic markdown rendering from task graph |
| `completion.ts` | `checkBundleCompletion()` — output artifact existence check |
| `window.ts` | `selectNextWindow()` — eligible bundle selection for apply phase |
| `status.ts` | `updateBundleStatus()` — immutable status transitions with validation |
| `index.ts` | Public re-exports |

**Why over a single file:** Each function is independently testable and has distinct concerns. The module boundary keeps task-planner logic isolated from artifact store and workflow concerns.

**Alternative considered:** Putting task-planner functions directly in `src/core/`. Rejected because core runtime is for workflow state machine operations, not artifact content generation.

### D2: `task-graph` added to `ChangeArtifactType` enum

Add `TaskGraph: "task-graph"` to the `ChangeArtifactType` object in `src/lib/artifact-types.ts`. This is a singleton change-domain artifact (no qualifier needed).

Add to `SingletonChangeArtifactType` union. Update `changeRef()` overloads. The `ChangeArtifactRef` union gains a new variant automatically.

In `src/lib/local-fs-change-artifact-store.ts`, add path resolution:
```
case ChangeArtifactType.TaskGraph:
  return resolve(changeDir, "task-graph.json");
```

**Why singleton:** Each change has exactly one task graph, like `proposal` and `design`. No qualifier needed.

### D3: Gate matrix update with legacy fallback

In `src/lib/artifact-phase-gates.ts`, the `design_draft → review_design` and `apply_draft → review_apply` transitions currently require `tasks`. The gate matrix will be updated to check for `task-graph` first, falling back to `tasks` if `task-graph` is absent.

Implementation approach: Introduce a `requiredOneOf` variant in the gate entry that accepts a prioritized list. The `checkGateRequirements()` function will try each in order and only fail if none are present.

```typescript
// New requirement variant
type ArtifactRequirement =
  | { domain: "change"; type: SingletonChangeArtifactType }
  | { domain: "change"; type: "spec-delta"; qualifierFrom: "specName" }
  | { domain: "change"; type: "review-ledger"; qualifier: ReviewLedgerKind }
  | { domain: "run"; type: "run-state" }
  | { domain: "change"; oneOf: readonly SingletonChangeArtifactType[] };  // NEW
```

Gate entry for `design_draft → review_design`:
```
required: [req("proposal"), req("design"), oneOf("task-graph", "tasks")]
```

An `oneOf()` helper function (analogous to the existing `req()` helper in `artifact-phase-gates.ts`) will be added in the same file to construct `oneOf` requirements declaratively.

`resolveRequirement()` must be updated to handle the `oneOf` variant: it iterates over the `oneOf` types in order, resolves each as a singleton change ref, checks existence via the store, and returns the first existing ref (or `null` if none exist). This differs from other variants because resolution depends on artifact existence.

`MissingRequiredArtifactError` must be updated to format the `oneOf` variant correctly in its error message, since the `oneOf` variant has no `type` field. The message should list all candidate types, e.g. `(changeId, oneOf[task-graph, tasks])`.

`checkGateRequirements()` must handle `oneOf` requirements specially: instead of resolving to a single ref and checking existence, it should delegate to `resolveRequirement()` which already handles the existence-based resolution for `oneOf`. If `resolveRequirement()` returns `null` for a `oneOf` requirement (meaning none of the candidates exist), the requirement is unsatisfied.

**Why `oneOf` over separate matrix entries:** Keeps the gate matrix declarative. The fallback logic is in the requirement resolution, not scattered across gate entries.

**Alternative considered:** Two separate gate entries (one for new changes, one for legacy). Rejected because phase transitions don't carry a "is-legacy" flag — the gate should detect by artifact existence.

### D4: LLM-based generation with structured output and retry

`generateTaskGraph()` uses LLM inference with a system prompt that describes the `TaskGraph` schema and a user prompt containing the `design.md` content plus the list of available spec names.

The generation pipeline:
1. Construct prompt with schema description, design content, and spec names
2. Call LLM API requesting JSON output
3. Parse response as JSON
4. Validate against `TaskGraph` schema (structural + DAG cycle check + unique IDs)
5. On validation failure, retry with the validation errors as feedback (up to `maxRetries`, default 3)
6. Return `Result<TaskGraph, TaskGraphGenerationError>`

The function accepts an `LlmClient` interface parameter for testability:
```typescript
interface LlmClient {
  generateJson(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

**Why LLM over template:** `design.md` is natural language prose — no structured section to parse deterministically. LLM inference can identify logical work units, dependencies, and output artifacts from unstructured design text.

**Why interface for LLM client:** Enables unit tests with a mock client that returns predetermined responses, avoiding LLM calls in the test suite.

### D5: Immutable status transitions

`updateBundleStatus()` returns a new `TaskGraph` — the original is never mutated. Valid transitions form a state machine:

```
pending → in_progress → done
pending → skipped
```

Invalid transitions (e.g., `done → pending`, `skipped → in_progress`) return a typed error. This prevents accidental regression of completed work.

After every status update, the caller is responsible for:
1. Persisting the new task graph via `ChangeArtifactStore.write()`
2. Re-rendering `tasks.md` via `renderTasksMd()` and persisting it

**Why caller-responsible persistence:** Keeps `updateBundleStatus()` as a pure function. The caller (apply phase) controls when and how to write, which simplifies testing and avoids hidden I/O.

### D6: Window selection uses soft dependency semantics

`selectNextWindow()` returns all bundles that are:
- Status `"pending"`
- All `depends_on` bundles have their output artifacts available (checked via an `ArtifactChecker` callback)

This means a dependent bundle can start as soon as its dependency's outputs exist, even if the dependency bundle itself hasn't been marked `"done"` yet. This maximizes parallelism.

```typescript
type ArtifactChecker = (artifactRef: string) => boolean;

function selectNextWindow(
  taskGraph: TaskGraph,
  artifactChecker: ArtifactChecker,
): readonly Bundle[];
```

**Why callback for artifact checking:** Decouples window selection from the artifact store. The caller injects the checking function, which can be backed by `ChangeArtifactStore.exists()` in production or a simple map in tests.

## Risks / Trade-offs

- **LLM output quality** → Mitigation: JSON schema validation catches structural errors; retry with error feedback improves success rate. Semantic quality (correct dependency ordering, meaningful bundle decomposition) is harder to validate automatically but will be caught during design review.

- **Schema evolution** → Mitigation: `version` field in the schema allows future readers to detect and handle older formats. Initial version is `"1.0"`.

- **Legacy fallback complexity** → Mitigation: The `oneOf` gate requirement keeps the fallback declarative. The unified interface in the apply phase abstracts over both modes. Legacy mode will be removed in a future change once all active changes have task graphs.

- **OpenSpec tasks artifact still in applyRequires** → The OpenSpec schema still lists `tasks` as an `applyRequires` artifact. During the transition, `tasks.md` is rendered from the task graph, so OpenSpec's `status` check will see it as `done`. No OpenSpec schema change is needed.

## Open Questions

- Should `selectNextWindow()` limit the number of bundles returned per window (e.g., max 3 concurrent bundles), or should the caller impose limits? Current design: caller imposes limits based on execution context.
