## Context

`/specflow.apply` today drives the entire `task-graph.json` through a single main-agent loop in `assets/commands/specflow.apply.md.tmpl` Step 1. Each window returned by `selectNextWindow` is executed inline on the main agent; every bundle status transition flows through `specflow-advance-bundle`, which is the sole mutation entry point (`src/bin/specflow-advance-bundle.ts` → `advanceBundleStatus` in `src/lib/task-planner/advance.ts`). This contract is deliberately strict: it preserves schema validation, child-task normalization, atomic writes, and the coercion audit log.

The problem is that a single agent carries every bundle's implementation context across the whole apply. When a change has many bundles or a single bundle pulls in heavy context (baseline specs, design excerpts, input artifacts), the main agent's effective working memory degrades as the apply progresses. Late bundles regress on earlier code, review findings are more frequent, and fix loops are longer.

The `Bundle` object already encodes natural isolation boundaries (`inputs`, `outputs`, `depends_on`, `owner_capabilities`), so the refactor is to use those boundaries to spawn one subagent per bundle when a bundle is "big enough," rather than packing everything into one rolling main-agent session. The main agent remains the orchestrator — it calls `specflow-advance-bundle`, enforces fail-fast, and hands off to review — but implementation work moves into ephemeral subagents that each receive a tight context package.

The opt-in knobs live in `openspec/config.yaml` (same file that already carries `max_autofix_rounds`), and backwards compatibility is preserved for pre-feature `task-graph.json` files by treating missing `size_score` as inline-only.

## Goals / Non-Goals

**Goals:**

- Keep the main agent's context small: delegate each bundle's implementation to a fresh subagent when the bundle exceeds a configured size threshold.
- Fan out multiple eligible bundles in parallel (bounded by `max_concurrency`) to shorten wall-clock time on wide windows.
- Preserve the `specflow-advance-bundle` sole-mutation-entry-point contract end-to-end: subagents never touch `task-graph.json` / `tasks.md` and never call the CLI; only the main agent does.
- Preserve strict fail-fast: a single subagent failure drains the chunk (records successful siblings), then stops the apply in `apply_draft`.
- Ship opt-in with a safe default: existing behavior is unchanged when `apply.subagent_dispatch.enabled` is `false` (the default) or when `task-graph.json` lacks `size_score` fields.
- Add exactly one deterministic signal — `size_score = bundle.tasks.length` — to the bundle schema. No LLM re-scoring at apply time, no per-capability weighting.

**Non-Goals:**

- Parallelizing across windows. Window boundaries remain the same as today (driven by `selectNextWindow` / `depends_on`); concurrency only happens within a single window's chunk.
- Mixing inline and subagent execution within the same window. Window-level uniform dispatch is simpler and matches the decision made during clarify.
- Parallelism at the review stage. `/specflow.review_apply` is unchanged — review still runs over the full aggregated implementation output.
- Automatic migration of existing `task-graph.json` files. A bundle with no `size_score` is always inline-only; regenerating the graph via `specflow-generate-task-graph` is the documented upgrade path.
- Changing `specflow-advance-bundle` CLI behavior or its JSON error envelope. The CLI is untouched.
- Introducing a new runtime / worker pool. Subagents are spawned via the harness's existing Agent tool (in-process, same run).

## Decisions

### D1. `size_score` is computed at graph generation time, not at apply time

**Decision:** `task-planner`'s `generateTaskGraph` sets `bundle.size_score = bundle.tasks.length` when constructing each `Bundle`. The field is written to `task-graph.json` and is optional in the schema (backward compat).

**Alternatives:**
- Compute at apply time by counting `bundle.tasks.length` on the fly. Rejected because it couples the dispatcher to the current-state graph and makes the signal invisible in persisted artifacts (hard to inspect in logs, `specflow-watch`, and reviews).
- Include context-weight (baseline spec lines, inputs file sizes). Rejected during clarify: adds filesystem IO at generation time, is non-deterministic across checkouts (different spec content for the same bundle shape), and task count alone is a good-enough proxy given the threshold is operator-tunable.

**Rationale:** Persisting a deterministic signal keeps the apply-time dispatcher purely functional over `task-graph.json`: no reads of specs, no filesystem probes, no surprises when the graph is diffed in PR review.

### D2. Window-level uniform dispatch (not per-bundle)

**Decision:** The dispatcher evaluates eligibility at the window granularity. If any bundle in the window is subagent-eligible (`size_score > threshold`), the entire window dispatches as subagents; otherwise the entire window runs inline on the main agent.

**Alternatives:**
- Per-bundle mixed dispatch (small inline + large subagent in the same window). Rejected because it introduces a schedule ordering problem (which goes first? do inline runs share context with subagents?) and doubles the code paths that need to be reasoned about for fail-fast.
- Always dispatch as subagents when the feature is enabled. Rejected because many windows are small and the subagent overhead (payload assembly, process spawn, result parse) is pure overhead at that size.

**Rationale:** One uniform dispatch path per window simplifies the state machine and makes `specflow-advance-bundle` invocations trivially serialized through the main agent.

### D3. Chunked parallel fan-out with `max_concurrency`

**Decision:** When a window is dispatched as subagents, split it into chunks of size ≤ `apply.subagent_dispatch.max_concurrency` (default `3`). Within a chunk, subagents run in parallel via `Promise.all`. Between chunks, execution is serial. Chunk boundaries are a stable function of bundle order in `task-graph.json`.

**Alternatives:**
- Unbounded fan-out. Rejected during clarify: high risk of rate-limiting (Claude API), unbounded token spend, and harness pressure when the graph has a large window.
- Reuse `max_autofix_rounds` as the cap. Rejected: semantics are different (autofix rounds bound retry count; concurrency bounds parallel actors). Mixing them makes config values confusing.

**Rationale:** Operators already tune concurrency per their runtime budget; a dedicated knob with a conservative default (3) is clearer than reusing an unrelated one.

### D4. Fail-fast drains the chunk before stopping

**Decision:** On any subagent failure in the current chunk, the main agent awaits every sibling in the chunk (`Promise.allSettled` semantics), records `done` for each success via `specflow-advance-bundle`, leaves the failed bundle in `in_progress`, and then stops the apply with the run remaining in `apply_draft`.

**Alternatives:**
- Cancel siblings on first failure. Rejected: requires a cancellation protocol (AbortSignal or similar) passed into the subagent context, which is impossible to enforce without subagent cooperation. Siblings may also be mid-write to output artifacts; killing them can leave partial files on disk that the fix loop then has to reconcile.
- Continue despite failures, collect all results, then report. Rejected: contradicts the existing `specflow-advance-bundle` fail-fast contract documented in `slash-command-guides`.

**Rationale:** "Drain then stop" preserves partial work (no lost successes) and keeps the failure surface identical to the existing single-agent fail-fast: the run is always in `apply_draft` when anything goes wrong, and the same recovery paths (`/specflow.fix_apply`, manual) apply.

### D5. Context package is an explicit, closed set of 6 items

**Decision:** Each subagent receives exactly 6 categories of content (see `bundle-subagent-execution` spec). The dispatcher does not include baseline specs outside the bundle's `owner_capabilities`, does not include other bundles' outputs beyond direct `depends_on`, and does not include `.specflow/runs/` state.

**Alternatives:**
- Whole-repo context. Rejected: defeats the goal of a small per-bundle context.
- Dynamic / LLM-selected context. Rejected: non-deterministic, hard to audit in reviews, and contradicts the deterministic `size_score` decision (D1).

**Rationale:** A closed, rule-based context set is auditable (operators can see exactly what was sent), deterministic across runs, and trivially testable.

### D6. `owner_capabilities` resolves to `openspec/specs/<cap>/spec.md` and/or `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md`

**Decision:** For each `cap`, the dispatcher includes the baseline spec if it exists and the spec-delta if it exists. At least one must exist; if both are missing the apply aborts fail-fast before dispatching any subagent in the window.

**Alternatives:**
- Include every `*.md` under `openspec/specs/<cap>/`. Rejected: today the directory only contains `spec.md`; globbing is unnecessary and couples the dispatcher to future directory layout decisions.
- Soft-skip missing capabilities. Rejected: missing baseline + missing delta is almost certainly a bug in the task graph generation or manual edit, and silently continuing hides the problem.

**Rationale:** Simple resolution with a loud failure for the "shouldn't happen" case.

### D10. Window-wide context preflight before first subagent dispatch

**Decision:** Before dispatching any subagent in a subagent-mode window, the dispatcher runs a preflight validation pass over every bundle in the window. The preflight resolves each bundle's `owner_capabilities` to verify that at least one spec (baseline or delta) exists per capability. If any bundle in the window fails preflight, the entire window aborts before any subagent is spawned or any bundle is transitioned to `in_progress`.

**Alternatives:**
- Validate per-bundle at dispatch time (current `assembleContextPackage` behavior). Rejected: this allows early bundles in the window to be advanced to `in_progress` or dispatched before a later bundle's missing capability is discovered, leaving the graph in a partially-advanced state that requires manual cleanup.
- Validate lazily within each chunk. Rejected: same partial-advance problem — chunk 1 bundles could be `in_progress` or `done` before chunk 2 discovers a missing capability.

**Rationale:** The spec requires aborting the window before any subagent dispatch when a capability is missing. A single upfront pass is cheap (only filesystem existence checks, no content reads) and guarantees the window is either fully dispatchable or cleanly rejected with no state mutation.

### D11. Legacy `tasks.md` fallback when `task-graph.json` is absent

**Decision:** When `apply.subagent_dispatch.enabled` is `true` but `task-graph.json` does not exist for the change, `/specflow.apply` bypasses the dispatcher entirely and stays on the legacy `tasks.md`-driven path with no subagent spawning. This is a no-op for the dispatcher — the apply command template checks for `task-graph.json` existence before invoking any dispatch logic.

**Alternatives:**
- Error out when `enabled` is `true` but no graph exists. Rejected: operators may enable the feature globally while some changes have not yet been regenerated; failing hard would block legitimate legacy applies.
- Auto-generate the task graph on the fly. Rejected: graph generation is a separate step with its own review gate; silently generating it at apply time would skip that gate.

**Rationale:** The dispatcher is purely additive — it only activates when both the config flag and the graph artifact are present. This preserves full backward compatibility for changes that predate the feature or were intentionally kept on the legacy path.

### D7. Config lives in `openspec/config.yaml` alongside `max_autofix_rounds`

**Decision:** Add a new `apply.subagent_dispatch` section with three keys (`enabled`, `threshold`, `max_concurrency`), parsed via the same YAML-reader pattern used by `review-runtime.ts` for `max_autofix_rounds`.

**Rationale:** Single config surface for operators; no new files or env vars. Default values (`false`, `5`, `3`) keep the feature opt-in and safe for existing users.

### D8. Apply dispatcher lives in a new module `src/lib/apply-dispatcher/`

**Decision:** Create a new module separate from `task-planner` because the dispatcher's concerns (config reading, context packaging, subagent orchestration, chunked parallel execution) are not part of the graph schema or rendering. The dispatcher consumes `task-planner`'s public API (`selectNextWindow`, `advanceBundleStatus`, etc.) and does not modify it beyond adding the `size_score` field to `types.ts` / `schema.ts`.

**Rationale:** Keeps the `task-planner` module focused on its current responsibility (schema + generation + rendering + window selection + advancement) while isolating the new orchestration logic.

### D12. Apply-loop call-site integration in `specflow.apply.md.tmpl` Step 1

**Decision:** The generated `specflow.apply.md.tmpl` Step 1 prose is the concrete call site that ties the dispatcher into the existing apply loop. The template's Step 1 SHALL contain an explicit branching control flow:

1. Read `DispatchConfig` via `readDispatchConfig`.
2. Evaluate `shouldUseDispatcher(config, taskGraphExists)`.
   - If `false`: execute the legacy `tasks.md`-driven inline loop (existing behavior, unchanged).
   - If `true`: enter the dispatcher path:
     a. Call `selectNextWindow` to get the next window.
     b. Call `classifyWindow(window, config)` to determine `inline` vs `subagent` mode.
     c. If `inline`: execute all bundles in the window on the main agent (same as legacy per-window behavior).
     d. If `subagent`: call `runDispatchedWindow(window, config, changeId, taskGraph, repoRoot, invoke, advance)` where:
        - `invoke` is a `SubagentInvoker` that spawns an Agent tool call with the assembled `ContextPackage` rendered into a prompt. The prompt SHALL include the mandatory constraint: **"You MUST NOT call `specflow-advance-bundle`, edit `task-graph.json`, or edit `tasks.md`. Return your implementation results only."**
        - `advance` is a callback that shells out to `specflow-advance-bundle`.
     e. If `runDispatchedWindow` returns `outcome: "failed"`, stop the apply (run stays in `apply_draft`).
     f. Otherwise, proceed to the next window.

**Alternatives:**
- Implement the branching in a TypeScript orchestrator function rather than in the template prose. Rejected: the template is the contract that the LLM agent follows at apply time; burying the branching in code would make it invisible to the agent and would require a separate mechanism to teach the agent when to spawn subagents vs run inline.
- Have subagents self-manage their status transitions. Rejected: violates the sole-mutation-entry-point contract (D4, Goals).

**Rationale:** The template is the single source of truth for how `/specflow.apply` Step 1 behaves. Making the dispatcher branching explicit in the template ensures the agent follows it deterministically and that the subagent prompt carries the mandatory no-mutation constraint. The dispatcher module provides the pure-function building blocks; the template is the glue that invokes them in order.

### D9. Prose changes in `specflow.apply.md.tmpl`, not a new command

**Decision:** Update `assets/commands/specflow.apply.md.tmpl` to document the dispatcher decision, the context package, the chunked fan-out, and the fail-fast settle-then-stop rule. The existing snapshot test (`specflow.apply.md.snap`) will be regenerated.

**Rationale:** `/specflow.apply` remains one command; only its Step 1 prose grows. Introducing a new command would fragment the apply workflow.

## Risks / Trade-offs

- **Risk:** Subagent invocation is harness-dependent. The `Agent` tool may behave differently across environments (e.g., when running inside CI or without the Claude Code harness). **Mitigation:** The feature is opt-in (default `false`). When the harness cannot spawn a subagent, the dispatcher surfaces the error like any other subagent failure (fail-fast drain-then-stop), and the operator falls back to `enabled: false` or `/specflow.fix_apply` / manual.
- **Risk:** Context package assembly is IO-heavy for large input files. **Mitigation:** Files are read once per bundle at dispatch time; there is no polling or retry loop. A single large `inputs` entry is no worse than the status quo, which already reads the same files in the main agent.
- **Risk:** `max_concurrency` may still overwhelm rate limits when several bundles are heavy. **Mitigation:** Default is 3. Operators with tighter budgets can set it to 1 (effectively sequential subagent execution, trading parallelism for isolation).
- **Risk:** A bundle whose `owner_capabilities` list drifts from reality (rename, delete) causes the apply to fail fast. **Mitigation:** This is the intended behavior — missing capabilities almost always indicate a stale task graph, and failing fast surfaces the problem earlier than silent execution would.
- **Trade-off:** Window-level uniform dispatch (D2) means a small bundle in a large-bundle window runs as a subagent and incurs the per-subagent overhead. Accepted: the overhead is small compared to mixed-mode scheduling complexity, and chunks of small bundles still benefit from parallelism within the chunk.
- **Trade-off:** No automatic migration for pre-feature `task-graph.json` files (D7 on backward compat). Accepted: an auto-rewrite would silently mutate a file that is otherwise the audit-trail of the apply; keeping it opt-in (`specflow-generate-task-graph`) is safer.

## Migration Plan

1. Ship the `size_score` schema field as **optional**. Existing graphs remain valid.
2. Ship the dispatcher with `enabled: false` default. The apply path is a no-op transformation for existing users (same behavior as before).
3. Document the feature in the `specflow.apply` guide prose and the `slash-command-guides` spec delta.
4. Operators who want the feature:
   - Regenerate `task-graph.json` for open changes via `specflow-generate-task-graph <CHANGE_ID>` (to populate `size_score`).
   - Set `apply.subagent_dispatch.enabled: true` in `openspec/config.yaml`.
   - Optionally tune `threshold` and `max_concurrency`.

**Rollback strategy:** Flip `apply.subagent_dispatch.enabled` back to `false` (or remove the section). The schema remains backward-compatible; existing graphs continue to work.

## Open Questions

- Should the subagent's result format be a shared type exported from `src/contracts/` (for future reuse by other orchestrators like `/specflow.review_apply`)? **Proposed answer:** Yes — place it in `src/contracts/apply-dispatcher.ts` as `SubagentResult`. Resolve during implementation.
- Should the dispatcher emit an `observation-event` per subagent dispatch for `specflow-watch` visibility? **Proposed answer:** Yes — reuse the existing `observation-event-publisher.ts` contract so the Watch TUI shows subagent-level progress. Scope this as a follow-up if it bloats the first PR; the core dispatcher should function without it.
- Does `specflow-generate-task-graph` need a flag for "populate `size_score` only, don't regenerate bundle structure" to help operators upgrade existing graphs without semantic changes? **Proposed answer:** Out of scope for this change; document the regeneration path and accept that operators either live with `size_score`-less graphs (inline-only) or accept a full regeneration.

## Concerns

1. **Bundle size signal in the graph** — persist a deterministic `size_score = tasks.length` on every newly generated bundle so the dispatcher can make a purely functional decision. Missing field ⇒ inline-only.
2. **Window-level dispatch decision** — given a window from `selectNextWindow`, classify it as inline or subagent-dispatched based on whether any bundle has `size_score > threshold`.
3. **Context package assembly** — given a bundle and the repository state, produce the exact 6-category payload specified in `bundle-subagent-execution`. Fail fast if a capability has neither baseline nor delta.
4. **Chunked parallel subagent orchestration** — split a subagent-dispatched window into chunks of size ≤ `max_concurrency`, run each chunk in parallel, serialize `specflow-advance-bundle` calls through the main agent, drain-then-stop on failure.
5. **Configuration surface** — extend the existing YAML reader pattern to parse `apply.subagent_dispatch.{enabled, threshold, max_concurrency}` with safe defaults.
6. **Command guide prose** — update `assets/commands/specflow.apply.md.tmpl` Step 1 to document everything a human reader and a future maintainer needs to understand the dispatcher without reading the code.
7. **Window-wide context preflight** — before dispatching any subagent in a window, validate all bundles' `owner_capabilities` in one pass. Abort the entire window with no state mutation if any bundle has a capability with neither baseline nor delta spec.
8. **Legacy `tasks.md` fallback** — when `apply.subagent_dispatch.enabled` is `true` but `task-graph.json` is absent, bypass the dispatcher entirely and stay on the legacy `tasks.md`-driven apply path with no subagent spawning.
9. **Apply-loop call-site integration** — rewrite `/specflow.apply` Step 1 in `specflow.apply.md.tmpl` to branch between the legacy inline path and the dispatcher path. The dispatcher path invokes `shouldUseDispatcher`, `classifyWindow`, and `runDispatchedWindow` in sequence per window. The subagent prompt wrapper SHALL include the mandatory constraint that subagents must not call `specflow-advance-bundle` or edit `task-graph.json` / `tasks.md`.

## State / Lifecycle

- **Canonical state (persisted):**
  - `task-graph.json`: adds optional `size_score` per bundle. Status fields (`bundle.status`, `task.status`) continue to be owned by `task-planner`.
  - `openspec/config.yaml`: adds optional `apply.subagent_dispatch` section.
  - `tasks.md`: unchanged (still rendered from `task-graph.json`). `size_score` is not rendered into `tasks.md`.
  - Run-state under `.specflow/runs/<RUN_ID>/`: unchanged. The dispatcher does not introduce new state files.
- **Derived state (in-memory, per-apply):**
  - `DispatchDecision` per window: `{ mode: "inline" | "subagent", chunks: Bundle[][] }`.
  - `ContextPackage` per subagent: the assembled 6-category payload plus the bundle reference.
  - `SubagentResult` per subagent invocation: `{ status: "success" | "failure", produced_artifacts: string[], error?: { message: string, details?: unknown } }`.
  - `BundleFailure` per failed subagent in a chunk: `{ bundleId: string, error: string }`. Collected into `failures` array on the `runDispatchedWindow` result.
- **Lifecycle boundaries:**
  - The dispatcher's in-memory state lives only for the duration of one `/specflow.apply` Step 1 invocation. It is never persisted.
  - `specflow-advance-bundle` remains the only path that mutates persistent state (`task-graph.json`, `tasks.md`).
  - Subagents are ephemeral: spawned at chunk start, terminated at chunk end. No subagent state survives a chunk boundary.
- **Entry guard:**
  - `shouldUseDispatcher` checks `config.enabled && taskGraphExists` before entering any dispatch logic. When `false`, the apply stays on the legacy `tasks.md`-driven path with no subagent spawning, regardless of config.
- **Window preflight:**
  - Before the first subagent dispatch in a window, `preflightWindow` validates all bundles' `owner_capabilities` in one pass. No bundle is advanced to `in_progress` until the entire window passes preflight.

## Contracts / Interfaces

Public API of the new `src/lib/apply-dispatcher/` module:

```ts
export interface DispatchConfig {
  enabled: boolean;      // default false
  threshold: number;     // default 5
  maxConcurrency: number; // default 3
}

export function readDispatchConfig(openspecConfigYaml: string): DispatchConfig;

export function classifyWindow(
  window: readonly Bundle[],
  config: DispatchConfig,
): { mode: "inline" | "subagent"; chunks: readonly (readonly Bundle[])[] };

export interface ContextPackage {
  bundleId: string;
  proposal: string;          // full proposal.md
  design: string;            // full design.md
  specs: ReadonlyArray<{ capability: string; baseline?: string; delta?: string }>;
  bundleSlice: unknown;      // { bundle, dependency_outputs }
  tasksSection: string;      // rendered section of tasks.md
  inputs: ReadonlyArray<{ path: string; content: string }>;
}

export async function preflightWindow(
  window: readonly Bundle[],
  changeId: string,
  repoRoot: string,
): Promise<{ ok: true } | { ok: false; bundleId: string; capability: string; message: string }>;

export async function assembleContextPackage(
  bundle: Bundle,
  changeId: string,
  taskGraph: TaskGraph,
  repoRoot: string,
): Promise<ContextPackage>; // throws on missing-capability

export interface SubagentResult {
  status: "success" | "failure";
  produced_artifacts: readonly string[];
  error?: { message: string; details?: unknown };
}

export type SubagentInvoker =
  (pkg: ContextPackage) => Promise<SubagentResult>;

export interface BundleFailure {
  bundleId: string;
  error: string;
}

export async function runDispatchedWindow(
  window: readonly Bundle[],
  config: DispatchConfig,
  changeId: string,
  taskGraph: TaskGraph,
  repoRoot: string,
  invoke: SubagentInvoker,
  advance: (bundleId: string, status: BundleStatus) => Promise<void>,
): Promise<{ outcome: "ok" | "failed"; failures?: readonly BundleFailure[] }>;
// Note: runDispatchedWindow calls preflightWindow for the entire window
// before advancing any bundle to in_progress or dispatching any subagent.
// If preflight fails, it returns { outcome: "failed" } with a single entry
// in failures citing the offending bundleId and capability, and no bundle
// state is mutated.
// On chunk execution, Promise.allSettled collects ALL failed subagents in
// the chunk. Each failed bundle remains in_progress; all failures are
// returned in the failures array so the caller can report complete
// diagnostics. Succeeded siblings in the same chunk are still advanced
// to done.

export function shouldUseDispatcher(
  config: DispatchConfig,
  taskGraphExists: boolean,
): boolean;
// Returns true only when config.enabled is true AND taskGraphExists is true.
// When false, the caller stays on the legacy tasks.md-driven apply path.
```

**Changed contracts (`task-planner`):**

- `Bundle` in `src/lib/task-planner/types.ts` gains an optional `size_score?: number`.
- `validateTaskGraph` in `schema.ts` accepts `size_score` when present (must be a non-negative integer) and ignores absence.
- `generateTaskGraph` in `generate.ts` emits `size_score = bundle.tasks.length` on every newly generated bundle.
- Rendering (`render.ts`) is unchanged — `size_score` is not written into `tasks.md`.

**Unchanged contracts:**

- `specflow-advance-bundle` CLI: inputs, JSON output envelope, exit codes, side-effects — all unchanged.
- `advanceBundleStatus` in `advance.ts`: signature and behavior unchanged.
- `selectNextWindow` in `window.ts`: signature and behavior unchanged.
- `observation-event-publisher`: unchanged for the core dispatcher; optional event emission is an Open Question.

**Command template contract:**

`assets/commands/specflow.apply.md.tmpl` Step 1 prose is updated; the generated `specflow.apply.md` snapshot regenerates. `slash-command-guides` spec delta covers what the generated guide must say.

## Persistence / Ownership

- **`task-graph.json`**: owned by `task-planner`. The dispatcher reads it but never writes it. `size_score` is written by `generateTaskGraph` and mutated only via `advanceBundleStatus` (which preserves it unchanged).
- **`tasks.md`**: owned by `task-planner`. The dispatcher reads the bundle's rendered section; it does not write.
- **`openspec/config.yaml`**: owned by the operator. The dispatcher reads `apply.subagent_dispatch` via a pure function; it never writes.
- **`openspec/changes/<CHANGE_ID>/**`**: owned by the workflow (proposal/design/specs). The dispatcher reads selectively (full proposal + design; per-capability specs). Subagents write into the repository as part of implementing their bundle — exactly the same write boundary as the main agent today.
- **`.specflow/runs/<RUN_ID>/**`**: owned by `specflow-run` and the run hooks. The dispatcher does not touch this directory.

## Integration Points

- **`Agent` tool (harness-provided):** The dispatcher's `SubagentInvoker` is injected at the call site (typically the generated `specflow.apply.md` prose that tells Claude to invoke the Agent tool per bundle). The dispatcher module itself is harness-agnostic: it accepts an `invoke` callback and returns results.
- **`specflow-advance-bundle` CLI:** Invoked by the main agent between dispatches. The dispatcher's `runDispatchedWindow` takes an `advance` callback so it remains testable without shelling out in unit tests.
- **`openspec/config.yaml`:** Parsed via the same regex-based reader pattern used for `max_autofix_rounds` in `src/lib/review-runtime.ts`. No YAML library dependency change.
- **`specflow-generate-task-graph` CLI:** Regenerates `task-graph.json` with `size_score` populated. No flag changes; the effect is that the newly generated graph carries the new field.
- **`specflow-watch` TUI:** Optional enhancement (Open Questions) — emits per-subagent events via the existing `observation-event-publisher` if we choose to surface subagent progress. Out of scope for the first pass.
- **Snapshot tests:** `src/tests/__snapshots__/specflow.apply.md.snap` regenerates when the template prose changes. No new test infrastructure is required.

## Ordering / Dependency Notes

- **Foundational (must land first):** `size_score` field in `Bundle` types and `validateTaskGraph` — the schema must accept the new field before any generator or dispatcher code can rely on it. This is a one-file change in `src/lib/task-planner/types.ts` and a few lines in `schema.ts`.
- **Schema tests** must pass both "with `size_score`" and "without `size_score`" cases before the generator starts emitting it, to preserve backward compatibility.
- **Generator update** (`generate.ts` emits `size_score`) depends on the schema change but is independent of the dispatcher.
- **Dispatcher module** (`src/lib/apply-dispatcher/`) can be built in parallel with the generator update — it only reads `size_score`, so unit tests can use hand-crafted task graphs.
- **Template update** (`assets/commands/specflow.apply.md.tmpl`) depends on the dispatcher contract being stable but not on its implementation being complete — the prose describes behavior, the code enforces it.
- **Config reader** (including `shouldUseDispatcher`) is a small isolated change; can be done in parallel with any other bundle.
- **Window preflight** (`preflightWindow`) depends on capability resolution logic but is independent of chunk execution; it can be built alongside or before orchestration.
- **Call-site integration** (`specflow.apply.md.tmpl` Step 1 branching + subagent prompt wrapper) depends on the dispatcher contract (`classifyWindow`, `runDispatchedWindow`, `shouldUseDispatcher`) being stable. It can be built alongside or after the dispatcher module.
- **Snapshot test regeneration** is the last step: it consumes the updated template.

## Completion Conditions

A concern is complete when:

1. **Size signal** — `task-graph.json` validation accepts `size_score` (present or absent); `generateTaskGraph` emits `size_score = tasks.length`; schema unit tests cover both cases; existing (pre-feature) graphs in the archive still validate.
2. **Dispatch classification** — `classifyWindow` returns the correct `{mode, chunks}` for windows with: all small, all large, mixed, cap-sized, larger-than-cap; chunk boundaries are deterministic.
3. **Context package** — `assembleContextPackage` produces the exact 6-category payload for a bundle whose capabilities have (a) baseline only, (b) delta only, (c) both, (d) neither → fail-fast.
4. **Orchestration** — `runDispatchedWindow` correctly serializes `advance("in_progress")` before dispatch, runs subagents in parallel within a chunk, records `done` on each success, drains-then-stops on failure, leaves all failed bundles in `in_progress`, returns an `outcome: "failed"` with a `failures` array containing every failed bundle's id and error from that chunk.
5. **Config surface** — `readDispatchConfig` handles: missing section (→ defaults), partial section, invalid types (→ defaults with warning or typed error — implementation decision), and the three valid keys.
6. **Guide prose** — the generated `specflow.apply.md` snapshot contains every clause required by the `slash-command-guides` spec delta (size_score rule, window-uniform dispatch, 6-item context package, chunked fan-out, drain-then-stop, sole-mutation-entry-point, window preflight, legacy fallback).
7. **Window preflight** — `preflightWindow` validates all bundles' capabilities in the window before any dispatch. Tests cover: (a) all capabilities valid → ok, (b) one bundle missing both baseline and delta → fail with bundle id and capability name, (c) failure prevents any bundle from being advanced to `in_progress`.
8. **Legacy fallback** — `shouldUseDispatcher` returns `false` when `task-graph.json` is absent (regardless of `enabled`). Tests cover: (a) enabled + graph exists → true, (b) enabled + graph absent → false, (c) disabled + graph exists → false. The apply command guide documents this behavior.
9. **Apply-loop call-site integration** — `specflow.apply.md.tmpl` Step 1 contains the concrete branching control flow that invokes `shouldUseDispatcher`, `classifyWindow`, and `runDispatchedWindow` per window. The subagent prompt wrapper includes the mandatory no-mutation constraint. Tests cover: (a) `shouldUseDispatcher` false → legacy path only, (b) inline-mode window → bundles execute on main agent, (c) subagent-mode window → `runDispatchedWindow` invoked with correct `invoke` and `advance` callbacks, (d) subagent prompt contains the no-mutation constraint text.

Each concern is independently reviewable: (1) ships as a schema/generator PR, (2–4, 7) as an apply-dispatcher PR with a mocked `SubagentInvoker`, (5, 8) as a small config-reader PR, (6) as a template + snapshot PR. The whole change can also ship as one bundle — the concerns are ordered here to support either strategy.
