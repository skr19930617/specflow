## Context

specflow's settings currently sit in two files with no documented ownership rule:

- `openspec/config.yaml` — holds `apply.subagent_dispatch.*`, `diff_warn_threshold`, `max_autofix_rounds`, `autofix_heartbeat_seconds`, `autofix_stale_threshold_seconds`, etc., mixed with OpenSpec's own `context:` entry. Read by `src/lib/apply-dispatcher/config.ts:readDispatchConfig` and `src/lib/review-runtime.ts:readReviewConfig`.
- `.specflow/config.env` — holds `SPECFLOW_MAIN_AGENT`, `SPECFLOW_REVIEW_AGENT`, and any other operator-local environment overrides. Read by `src/lib/review-runtime.ts:loadConfigEnv` and consulted via `process.env` in `resolveMainAgent` / `resolveReviewAgent`.

Two problems result:

1. `openspec/config.yaml` is conceptually OpenSpec's config surface. Putting specflow settings there means specflow and OpenSpec share a file with no clean boundary, and contributors have no rule for where a new specflow knob should live.
2. `apply.subagent_dispatch.enabled` defaults to `false` (`DEFAULT_DISPATCH_CONFIG.enabled = false` in `src/lib/apply-dispatcher/config.ts:14-18`). This was the right default while the dispatcher was an experimental feature, but the dispatcher is now part of the apply execution strategy — task-graph and `size_score` already exist on the happy path. With the default off, the feature is dormant unless an operator opts in.

The proposal accepted by the spec phase resolves both: introduce `.specflow/config.yaml` as the canonical home for specflow's shared workflow policy, leave operator-local settings in `.specflow/config.env`, and flip the dispatch default to `true`. Misplaced entries in `openspec/config.yaml` are ignored with a deprecation warning. Default-engaged dispatch with missing local subagent runtime fails fast.

The change is cross-cutting — it touches the config loader, the dispatcher startup path, the init/analyze flow that seeds config files, multiple specs, and external docs — so a design doc is warranted.

## Goals / Non-Goals

**Goals:**

- Establish `.specflow/config.yaml` as the canonical home for specflow shared workflow policy, with both `readDispatchConfig` and `readReviewConfig` reading from it instead of `openspec/config.yaml`.
- Flip `DEFAULT_DISPATCH_CONFIG.enabled` from `false` to `true`.
- When the dispatcher engages by default and at least one bundle in the current window is subagent-eligible, verify local subagent runtime prerequisites and fail fast with an actionable error if they are missing or invalid.
- Detect specflow settings still present in `openspec/config.yaml` and emit a clear deprecation warning naming the canonical location, while ignoring the misplaced value.
- Support a single shared→local override path for borderline settings: shared default in `.specflow/config.yaml`, optional override in `.specflow/config.env`.
- Keep the change behaviorally minimal beyond these specific intents — the dispatcher's eligibility rule, classification logic, window/chunk semantics, and integration contract are unchanged.

**Non-Goals:**

- Full redesign of the config system or introduction of a multi-source precedence framework beyond the single shared→local override path.
- Server-runtime config hierarchy.
- Changes to `task-planner`'s classification rule (`size_score > threshold`) or to subagent transport / orchestration.
- Reclassifying or moving OpenSpec's own settings (e.g., `context:` in `openspec/config.yaml`). The ownership rule applies only to specflow's domain.
- Auto-migration of existing operator config files. Strict ignore-with-warning is sufficient; operators relocate settings manually based on the warning.
- Changing how `.specflow/config.env` is read (`loadConfigEnv` and `process.env` flow remain).

## Decisions

### D1. New file: `.specflow/config.yaml` as the canonical shared-policy home

**Decision:** Add `.specflow/config.yaml`. It is committed to the repo. specflow's shared workflow policy reads from this file. `openspec/config.yaml` retains only OpenSpec's own keys (currently the `context:` block).

**Alternatives considered:**

- *Keep `openspec/config.yaml` as the home and just add a clearer doc.* Rejected — does not address the ownership-boundary problem; a future contributor still has no answer to "where do I put this new specflow knob?".
- *Use `.specflow/policy.yaml` or `.specflow/workflow.yaml`.* Rejected during reclarify — the user chose `.specflow/config.yaml` as the symmetric counterpart of `.specflow/config.env`.
- *Split into per-domain yamls (`.specflow/dispatch.yaml`, `.specflow/review.yaml`).* Rejected — premature; one shared yaml mirrors the existing single-file pattern and avoids invented hierarchy.

**Rationale:** The pair `.specflow/config.yaml` (committed, shared) + `.specflow/config.env` (gitignored, local) gives both files a parallel name and one obvious place to look. Both live under `.specflow/`, which clearly delimits specflow's domain. `openspec/config.yaml` returns to being purely OpenSpec's concern.

### D2. Loader strategy: read canonical, detect-and-warn on legacy

**Decision:** Both `readDispatchConfig` and `readReviewConfig` are extended to:

1. Read the canonical file (`.specflow/config.yaml`) using the existing line-scanning parser. If the canonical file or the relevant key is absent, fall through to defaults.
2. Probe `openspec/config.yaml` for the same keys as a *detect-only* read. If a value is found there, emit a one-time warning per process to `process.stderr` naming the key and the canonical location, then ignore the value.
3. Resolve duplicates (key set in both files) by canonical-wins + warning on the legacy occurrence.

**Alternatives considered:**

- *Multi-source merge with documented precedence.* Rejected — explicit non-goal; would inflate scope.
- *Hard-error on misplaced keys.* Rejected during reclarify — too disruptive for an upgrade path; the user chose strict-ignore-with-warning.
- *Silent backward-compatible read.* Rejected — would mask the migration intent and let stale config drift indefinitely.

**Rationale:** The detect-and-warn path keeps existing repos functional after upgrade (no hard error) while making the migration visible at every load. Once an operator moves the keys, the warning disappears.

### D3. Single shared→local override path for borderline settings

**Decision:** A "borderline" setting (workflow-policy semantics with a per-operator-tunable aspect) is defined in `.specflow/config.yaml` as the shared default. An operator MAY override it via `.specflow/config.env` — overrides use the existing `SPECFLOW_*` environment-variable mechanism that `loadConfigEnv` already populates. The yaml value is read first; if a corresponding env var is present, it wins for that operator.

The convention for borderline keys: yaml key `apply.foo.bar` corresponds to env var `SPECFLOW_APPLY_FOO_BAR` (uppercase, dots → underscores, prefixed). Documented in `config-ownership-boundaries`.

**Alternatives considered:**

- *No local override at all.* Rejected during reclarify — the user chose to allow it.
- *Symmetric override (env can override yaml or vice-versa).* Rejected — adds a precedence dimension we don't need.
- *Operator-specific yaml file (`.specflow/config.local.yaml`).* Rejected — invents a third file when `.specflow/config.env` already exists for this purpose.

**Rationale:** The env file already exists, is already gitignored, and is already loaded into `process.env`. Reusing it as the override channel costs no new file and keeps the "shared = yaml, local = env" framing intact. None of `apply.subagent_dispatch.*` is currently classified as borderline, so this path is documented but not exercised by this change.

### D4. Default flip + canonical wording shift

**Decision:** Set `DEFAULT_DISPATCH_CONFIG.enabled = true` in `src/lib/apply-dispatcher/config.ts:14-18`. Update the file's leading comment (lines 1-3) and `readDispatchConfig`'s doc comment (lines 126-131) to reference `.specflow/config.yaml` and the new default. Spec wording in `bundle-subagent-execution` shifts from "opt-in / gated by configuration" to "enabled by default, explicit opt-out".

**Alternatives considered:**

- *Two-step deprecation (warn first, flip later).* Rejected during clarify — the user chose immediate flip.
- *Keep default `false`, document the file move only.* Rejected — would leave the dispatcher dormant and miss the proposal's intent.

**Rationale:** The eligibility guards (`task-graph.json` present, `size_score > threshold`) already protect repos that don't need dispatch, so flipping the default does not silently dispatch every apply. Existing tests that pin `enabled: false` as the default need to flip alongside the constant.

### D5. Default-engaged dispatch fails fast on missing local runtime

**Decision:** Add a runtime-prerequisite check in the dispatcher's window-entry path. The check runs only when:

- `apply.subagent_dispatch.enabled` is unset OR `true`, AND
- the current window contains at least one subagent-eligible bundle.

The check verifies:

1. The agent CLI required by `.specflow/config.env` is resolvable on `PATH` (or its absolute path is set and exists).
2. The main/review agent identifiers in `.specflow/config.env` are valid (one of `claude` / `codex` / `copilot` for main; `codex` / `claude` for review — matching `resolveMainAgent` / `resolveReviewAgent` validation).

On failure, the apply stops with an error that names the unresolvable CLI / invalid identifier and explicitly cites both fix paths: resolve the local runtime in `.specflow/config.env`, or set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`. The run remains in `apply_draft`. The dispatcher does NOT silently fall back to inline.

**Alternatives considered:**

- *Silent inline fallback on missing runtime.* Rejected during reclarify — would mask misconfiguration introduced by the new default.
- *Validate at config-load time (eager).* Rejected — config is loaded in many code paths that don't need to dispatch; running a CLI-presence check on every load would be wasteful and would surface errors in unrelated contexts.
- *Skip the check entirely when explicit opt-out is set.* Already part of D5 — when `enabled: false` is explicit, the check is a no-op.

**Rationale:** The check runs lazily (only when dispatch is actually about to engage) and is gated by window-level eligibility, so the cost is paid only on apply runs that would have spawned a subagent anyway. Failing fast with a clear message is better than a runtime crash deep inside subagent spawn.

### D6. Init/analyze flow seeds `.specflow/config.yaml`

**Decision:** `specflow-init` and `specflow-analyze` (which currently write to `openspec/config.yaml` for specflow keys) are updated to write specflow keys to `.specflow/config.yaml` instead. `openspec/config.yaml` retains only the OpenSpec-owned `context:` block. The init template under `assets/template/` includes a starter `.specflow/config.yaml` (alongside the existing starter `.specflow/config.env`).

**Alternatives considered:**

- *Leave init writing to `openspec/config.yaml` and rely on the deprecation warning.* Rejected — would mean every fresh install starts in the deprecated state.

**Rationale:** New installs should not produce immediately-deprecated config. This keeps init/analyze and the loader aligned.

## Risks / Trade-offs

- **Risk: Existing repos see an unexpected dispatch behavior change on upgrade.** → Mitigation: the eligibility guards (`task-graph.json` present + `size_score > threshold`) already protect repos that don't have a task graph or whose bundles are small. The release-note entry calls out the new default and the explicit opt-out path. The fail-fast-on-missing-runtime check (D5) keeps any operator with broken local runtime from a confusing partial-failure state.
- **Risk: Operators don't notice the deprecation warning and leave specflow keys in `openspec/config.yaml`.** → Mitigation: warning is emitted on every config load (deduped per-process to avoid spam) and is also surfaced in the release notes. The strict ignore policy means stale config does not silently take effect.
- **Risk: The dual-file probe (canonical + legacy) makes the loader more complex.** → Mitigation: factor the legacy-detection into a small helper used by both `readDispatchConfig` and `readReviewConfig`. Add unit tests for (a) canonical only, (b) legacy only, (c) both (canonical wins), (d) neither.
- **Trade-off: No auto-migration tool.** Operators relocate settings by hand based on the warning. Acceptable because the canonical-vs-legacy structure is shallow (a flat top-level `apply:` / `review:` set) and the warning identifies each key explicitly.
- **Trade-off: `loadConfigEnv` reads the env file unconditionally; the runtime-prereq check (D5) re-reads it for validation.** Slight duplication, but `loadConfigEnv` is side-effecting (mutates `process.env`) while the prereq check needs structured access; keeping them separate is clearer than overloading `loadConfigEnv`.

## Migration Plan

1. **Implement loader changes (D2)** with both canonical and legacy probes; default-flip (D4) follows in the same change.
2. **Update init/analyze (D6)** so new installs target `.specflow/config.yaml`.
3. **Add the runtime-prereq check (D5)** in the dispatcher window-entry path.
4. **Update tests:** flip default-pinning unit tests; add tests for the legacy-warning path; add tests for the runtime-prereq fail-fast.
5. **Update docs/comments:** README, AGENTS.md, slash-command guides, sample yaml in `assets/template/`, file-level comments in `apply-dispatcher/config.ts` and `review-runtime.ts`.
6. **Release notes / changelog:** call out (a) the default flip, (b) the canonical config location, (c) the deprecation warning operators will see, (d) the explicit opt-out (`apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`).

**Rollback strategy:** If the default flip causes operator-visible regressions, an operator can immediately set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`. No code rollback is required for individual operators. A repo-wide rollback would re-pin `DEFAULT_DISPATCH_CONFIG.enabled = false`.

## Open Questions

- *None blocking implementation.* The shared→local override convention (D3) is documented but not exercised by this change; the first borderline setting that uses it will validate the convention end-to-end.

## Concerns

- **C1: Loader migration.** Make `readDispatchConfig` and `readReviewConfig` read from `.specflow/config.yaml` and emit a deprecation warning when keys are still found in `openspec/config.yaml`. Resolves the ownership-boundary ambiguity and makes the migration visible.
- **C2: Default flip.** Set `DEFAULT_DISPATCH_CONFIG.enabled = true`; update file/function comments and any test that pins the old default. Resolves the dormant-feature problem.
- **C3: Init/analyze seeding.** Update `specflow-init` and `specflow-analyze` to write specflow keys to `.specflow/config.yaml`. Resolves the "fresh installs start deprecated" risk.
- **C4: Runtime-prereq fail-fast.** Add the missing-local-runtime check at dispatcher window entry. Resolves the risk that the new default surfaces confusing partial failures on misconfigured machines.
- **C5: Doc & template sync.** Update README, AGENTS.md, slash-command guides, sample yaml under `assets/template/`, release notes. Keeps documented and implemented behavior aligned.
- **C6: Test coverage.** Cover (i) canonical-only read, (ii) legacy-only read with warning, (iii) both files (canonical wins, legacy warned), (iv) neither (defaults), (v) explicit opt-out, (vi) default-engaged with valid runtime, (vii) default-engaged with missing CLI, (viii) default-engaged with invalid agent identifier, (ix) shared→local override smoke test. Keeps the spec scenarios tied to executable verification.

## State / Lifecycle

- **Canonical state.** The dispatcher's effective `DispatchConfig` (immutable per apply invocation) is derived from `.specflow/config.yaml` plus defaults. There is no new persistent state.
- **Derived state.** Effective config is computed at the start of each apply run and is treated as read-only thereafter. The runtime-prereq check (D5) is also stateless — it inspects `process.env` and `PATH` at the moment of check.
- **Lifecycle boundaries.** Per process. Each `/specflow.apply` invocation: load env (`loadConfigEnv`) → load config (`readDispatchConfig`, `readReviewConfig`) → check prerequisites (D5 — only if dispatch about to engage) → run windows. The deprecation warning is deduped per-process.
- **Persistence-sensitive state.** None new. The legacy detection does not modify any file; it only reads.

## Contracts / Interfaces

- **`readDispatchConfig(projectRoot: string): DispatchConfig`** — unchanged signature. New behavior: reads `.specflow/config.yaml`, probes `openspec/config.yaml` for legacy keys, emits warning on legacy hit, defaults unchanged in shape.
- **`parseDispatchConfig(content: string): DispatchConfig`** — unchanged signature; pure parser still operates on a single yaml string. Legacy detection is at the file-resolution layer, not in the parser.
- **`readReviewConfig(projectRoot: string): ReviewConfig`** — unchanged signature; same legacy-detection treatment as dispatch.
- **`DEFAULT_DISPATCH_CONFIG: DispatchConfig`** — value of `enabled` flips from `false` to `true`. Shape unchanged.
- **New helper (internal): `verifyLocalSubagentRuntime(projectRoot: string): { ok: true } | { ok: false, reason: string }`** — used at dispatcher window entry when D5's preconditions are met. Returns structured result so the caller assembles the operator-facing error.
- **No breaking changes** to the public contracts of `apply-dispatcher`, `review-runtime`, `task-planner`, or `apply-worktree-integration`.

## Persistence / Ownership

- **Ownership of shared workflow policy:** `.specflow/config.yaml`, committed to the repo. Edited by humans; written by `specflow-init` / `specflow-analyze` on initial setup.
- **Ownership of local runtime preference:** `.specflow/config.env`, gitignored. Edited by humans; written by `specflow-init` for the operator's machine.
- **Ownership of OpenSpec config:** `openspec/config.yaml`. Owned by OpenSpec, not this change.
- **Ownership of dispatcher state:** No new persistent artifact.
- **Migration of existing operator data:** Manual, guided by the deprecation warning. No automated relocation.

## Integration Points

- **`src/lib/apply-dispatcher/config.ts`:** `readDispatchConfig`, `DEFAULT_DISPATCH_CONFIG`, file/function comments.
- **`src/lib/review-runtime.ts`:** `readReviewConfig`, `loadConfigEnv` (no change), file-level comments referring to `openspec/config.yaml`.
- **`src/lib/apply-dispatcher/index.ts`:** call site of dispatcher window entry — insert D5's prereq check.
- **`src/bin/specflow-init.ts`:** seeding logic for specflow keys; rerouted from `openspec/config.yaml` to `.specflow/config.yaml`.
- **`src/bin/specflow-analyze.ts`:** analyze flow that reads/writes config.
- **`assets/template/`:** new starter `.specflow/config.yaml`; update existing `openspec/config.yaml` template to drop specflow keys.
- **External regeneration / retry / save / restore boundaries:** None — config is loaded fresh each run; no caching layer affected.
- **Cross-layer dependencies:** `apply-worktree-integration` and `task-planner` consume the dispatcher's effective config but do not need to be aware of where it was loaded from.

## Ordering / Dependency Notes

- **C1 (loader migration)** is foundational — both C2 (default flip) and C4 (runtime check) depend on the loader returning correct values from the new canonical location.
- **C2 (default flip)** can land in the same change as C1 (it's a one-line constant change in the same file).
- **C3 (init/analyze seeding)** depends on C1 to be coherent (otherwise init writes to the new location but the loader still reads the old one). Best landed in the same window as C1.
- **C4 (runtime prereq check)** depends on C2 (the check is only meaningful once the default is `true`).
- **C5 (doc & template sync)** depends on C1–C4 having landed; otherwise docs lie about the implementation.
- **C6 (test coverage)** runs in parallel with each of C1–C4 — tests are written alongside their target capability.
- **Parallelizable:** C5 and tail-end of C6 (e.g., shared→local override smoke test) can be done in parallel with C1–C4 once the contracts (D1–D6) are agreed.

## Completion Conditions

- **C1:** `readDispatchConfig` and `readReviewConfig` read from `.specflow/config.yaml`; legacy keys in `openspec/config.yaml` produce a single deduped warning naming the key and canonical file. Unit tests for canonical-only / legacy-only / both / neither pass.
- **C2:** `DEFAULT_DISPATCH_CONFIG.enabled` is `true`. Existing tests that pin the default are updated; new tests assert the flipped default and the explicit-opt-out scenario.
- **C3:** `specflow-init` and `specflow-analyze` write specflow keys to `.specflow/config.yaml` (or skip if absent in the analyze flow). The init template includes a starter `.specflow/config.yaml`. A fresh-install smoke test does not produce any deprecation warning.
- **C4:** With `enabled: true` (default or explicit), a window containing a subagent-eligible bundle and a missing/invalid local runtime fails fast with a message naming both fix paths. Tests cover missing CLI and invalid identifier.
- **C5:** README, AGENTS.md, slash-command guides, sample yaml, and file-level code comments reference `.specflow/config.yaml` as the home for specflow shared workflow policy and describe `enabled: true` as the default. Release notes mention the migration warning and the explicit opt-out.
- **C6:** All test cases in the C6 list above pass; CI green on the change branch.
- **Independent reviewability:** C1+C2 form a self-contained loader-and-default change. C3 is independently reviewable (init/template). C4 is independently reviewable (one new helper + one call-site). C5 and C6 are independently reviewable as docs/tests.
