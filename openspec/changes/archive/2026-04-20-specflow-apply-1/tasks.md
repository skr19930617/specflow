## 1. Add Size Score to Task Graphs ✓

> Persist deterministic bundle size metadata in generated task graphs while keeping validation backward-compatible.

- [x] 1.1 Extend Bundle types and schema to accept optional non-negative size_score values
- [x] 1.2 Emit size_score = bundle.tasks.length during task graph generation without changing tasks.md rendering
- [x] 1.3 Add validation tests covering graphs with size_score, without size_score, and archived legacy graphs

## 2. Add Dispatcher Config Guard ✓

> Read subagent dispatch settings from openspec config and gate dispatcher activation on config plus task-graph existence.

- [x] 2.1 Define DispatchConfig defaults and shouldUseDispatcher guard semantics
- [x] 2.2 Implement readDispatchConfig for enabled, threshold, and max_concurrency using the existing YAML reader pattern
- [x] 2.3 Add tests for missing config, partial config, invalid values, and task-graph absent fallback behavior

## 3. Build Dispatcher Context and Preflight ✓

> Implement window classification, capability preflight, and deterministic context-package assembly for subagent-ready bundles.

> Depends on: task-graph-size-score, dispatch-config-guard

- [x] 3.1 Define dispatcher contracts for ContextPackage and SubagentResult and export classifyWindow and preflightWindow APIs
- [x] 3.2 Implement window-uniform classification with deterministic chunking from bundle order and maxConcurrency
- [x] 3.3 Implement capability resolution rules that require a baseline or delta spec for every owner capability
- [x] 3.4 Implement assembleContextPackage to produce the six-category payload from proposal, design, specs, bundle slice, tasks section, and inputs
- [x] 3.5 Add tests for all-small, all-large, mixed windows and baseline-only, delta-only, both, and missing capability cases

## 4. Implement Chunked Subagent Orchestration ✓

> Execute subagent-mode windows in bounded parallel chunks while preserving serialized bundle status mutations and fail-fast semantics.

> Depends on: dispatcher-context-preflight, dispatch-config-guard

- [x] 4.1 Implement runDispatchedWindow to preflight the full window before any in_progress transition or subagent dispatch
- [x] 4.2 Advance each dispatched bundle to in_progress, invoke chunked subagents in parallel, and serialize done transitions through the main agent
- [x] 4.3 Use Promise.allSettled-style draining to record successful siblings, keep failed bundles in_progress, and return every chunk failure
- [x] 4.4 Add tests for all-success, multi-failure drain-then-stop, and zero-mutation preflight failure behavior

## 5. Integrate Dispatcher Into Apply Command ✓

> Update /specflow.apply guidance and tests so the apply loop branches between legacy inline execution and dispatcher-driven subagent windows.

> Depends on: dispatcher-chunk-orchestration, dispatch-config-guard

- [x] 5.1 Rewrite Step 1 to read config, call shouldUseDispatcher, and branch between legacy tasks.md and dispatcher paths per window
- [x] 5.2 Document inline versus subagent window execution, chunked fan-out, window preflight, drain-then-stop, and sole-mutation-entry-point behavior
- [x] 5.3 Embed the mandatory subagent no-mutation constraint covering specflow-advance-bundle, task-graph.json, and tasks.md
- [x] 5.4 Regenerate snapshots and add template tests for legacy, inline-mode, and subagent-mode control flow
