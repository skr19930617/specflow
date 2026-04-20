## Why

`/specflow.apply` currently drives every bundle in `task-graph.json` through a single main-agent loop. When a change spans many bundles or a single bundle carries a large context footprint (many files, long design excerpts, dense baseline specs), the main agent's context window fills quickly: late bundles start with degraded recall of early-bundle code, error handling, and review findings. The existing `bundle` structure already encodes natural isolation boundaries (`inputs`, `outputs`, `depends_on`, `owner_capabilities`), yet we are not taking advantage of them for execution isolation.

We want an opt-in dispatch mode where each bundle — when it exceeds a configured size threshold — is executed by a freshly-spawned subagent that receives only the context it needs. The main agent remains the orchestrator (state transitions, `specflow-advance-bundle` calls, fail-fast enforcement, review gate handoff) but delegates the _implementation work_ per bundle, so the main context stays lean and each bundle gets a clean working memory. When multiple bundles are simultaneously eligible per the existing `selectNextWindow` contract, the dispatcher fans them out in parallel (bounded by a configured cap) to shorten wall-clock time.

## What Changes

- Introduce a new capability `bundle-subagent-execution` that specifies:
  - **Threshold rule (C1)**: `size_score = bundle.tasks.length`. A bundle is subagent-eligible when `size_score > apply.subagent_dispatch.threshold`. No per-capability weighting; the computation is deterministic at `task-graph.json` generation time.
  - **Concurrency model (C4, C6)**:
    - When `selectNextWindow` returns a window in which **at least one** bundle is subagent-eligible, the dispatcher uniformly treats the **entire window** as subagent-dispatched (inline and subagent bundles alike become subagents). This yields a single code path per window and avoids mixed-mode scheduling.
    - When no bundle in the window is subagent-eligible, the dispatcher executes the window inline on the main agent (preserving the default behavior).
    - The parallelism is bounded by `apply.subagent_dispatch.max_concurrency` (default `3`). Windows exceeding the cap are split into sequential chunks of size ≤ cap; within a chunk, subagents run in parallel.
    - The main agent waits for all subagents in the current chunk to settle before starting the next chunk or the next window.
  - **Context packaging (C2, C3)**: the subagent payload SHALL contain exactly:
    1. `openspec/changes/<CHANGE_ID>/proposal.md` (full content — no slicing)
    2. `openspec/changes/<CHANGE_ID>/design.md` (full content)
    3. For every `cap` in the bundle's `owner_capabilities`:
       - The baseline spec at `openspec/specs/<cap>/spec.md`, if it exists
       - The spec-delta at `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md`, if it exists
       - At least one of the two SHALL exist; otherwise the dispatcher SHALL fail fast with a clear error citing the missing `cap`
    4. The bundle slice of `task-graph.json` (bundle object + its direct dependencies' outputs)
    5. The bundle's section of `tasks.md` (the rendered checklist for this bundle only)
    6. The bundle's `inputs` artifact contents
  - **Dispatch protocol (C5)**: the main agent transitions `pending → in_progress` via `specflow-advance-bundle` BEFORE dispatch. The subagent returns a structured result (success/failure + produced artifacts + error details). After each subagent returns, the main agent transitions `in_progress → done` via `specflow-advance-bundle` on success. Subagents MUST NOT call `specflow-advance-bundle`.
  - **Fail-fast (C5)**: if any subagent in the current chunk returns failure, the main agent SHALL wait for all remaining sibling subagents in the same chunk to settle (so partial successes are recorded correctly), then STOP the apply. Succeeded bundles in that chunk are transitioned to `done`; the failed bundle remains `in_progress`; un-dispatched bundles (later chunks, later windows) remain `pending`; the run SHALL remain in `apply_draft`. Recovery paths are `/specflow.fix_apply` or manual intervention — consistent with the existing CLI-mandatory fail-fast contract.
- Extend `task-planner` to:
  - Emit a per-bundle `size_score` field in `task-graph.json` during generation, computed as `bundle.tasks.length`.
  - Document the `size_score` field in the `Bundle` schema and in the contract tests.
  - **Backward compatibility (C7)**: existing `task-graph.json` files without a `size_score` field continue to be valid. At apply time, any bundle whose `size_score` is missing SHALL be treated as inline-only (never subagent-eligible), regardless of the configured threshold. No auto-migration is required; re-running the generator for a given change brings it onto the new schema.
- Update `slash-command-guides` so that `specflow.apply.md.tmpl` documents:
  - The size_score threshold rule.
  - The window-level uniform subagent dispatch.
  - The context-packaging contract referenced above.
  - The chunked parallel fan-out bounded by `max_concurrency` and its fail-fast semantics.
  - That `specflow-advance-bundle` remains the sole mutation entry point and continues to be invoked only by the main agent.
  - The backward-compatibility rule for bundles missing `size_score`.

## Capabilities

### New Capabilities
- `bundle-subagent-execution`: Defines the threshold rule, concurrency model (windowed uniform subagent dispatch with bounded parallelism), context-packaging contract, dispatch protocol, and fail-fast semantics for spawning per-bundle subagents during `/specflow.apply`.

### Modified Capabilities
- `task-planner`: Augment the `Bundle` schema with an optional `size_score` field computed as `bundle.tasks.length` during generation; specify the backward-compatibility rule (missing field → inline-only at apply time); update validation and rendering to preserve it.
- `slash-command-guides`: Update the `/specflow.apply` command guide to describe the window-level subagent-vs-inline decision, the context-packaging contract, the chunked parallel fan-out with the `max_concurrency` cap, the fail-fast semantics, and the interaction with `specflow-advance-bundle` and the review gate.

## Impact

- **Code**: `src/lib/task-planner/*` (schema + generator for `size_score`), new module (likely `src/lib/apply-dispatcher/*`) for threshold evaluation, context packaging, subagent invocation, and result integration. `assets/commands/specflow.apply.md.tmpl` for updated prose.
- **Contracts**: `TaskGraph` / `Bundle` in `src/contracts/*` gains an optional `size_score` field; contract tests extended for both presence and absence.
- **Workflow**: `/specflow.apply` Step 1 gains a dispatcher between bundle selection and execution; `/specflow.review_apply` is unchanged because review runs on aggregated implementation output after the main agent has recorded all `done` transitions.
- **CLI**: `specflow-advance-bundle` is untouched — still the only mutation entry point, still called only by the main agent.
- **Artifacts**: `task-graph.json` schema gains `size_score` as an optional field. Archived changes and pre-feature graphs continue to work; bundles without `size_score` are always handled inline.
- **Configuration**: New `openspec/config.yaml` knobs:
  - `apply.subagent_dispatch.enabled` — boolean, default `false` (opt-in).
  - `apply.subagent_dispatch.threshold` — integer, default `5` (bundles with `size_score > 5` are subagent-eligible when enabled).
  - `apply.subagent_dispatch.max_concurrency` — integer, default `3` (upper bound on parallel subagents per chunk).
