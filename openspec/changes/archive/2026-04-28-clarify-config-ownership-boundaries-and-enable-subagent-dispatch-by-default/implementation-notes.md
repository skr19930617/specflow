# Implementation Notes — clarify-config-ownership-boundaries-and-enable-subagent-dispatch-by-default

## Operator-facing changes (release-note candidates)

### 1. New canonical config location: `.specflow/config.yaml`

- specflow's shared workflow policy now lives in `.specflow/config.yaml`.
- This file is committed to the repo (parallel to the existing `.specflow/config.env`, which remains gitignored for local-runtime preferences).
- `openspec/config.yaml` is no longer a home for specflow settings.
- `specflow-init` seeds a starter `.specflow/config.yaml` template alongside `.specflow/config.env`.

### 2. Migration warning

- The config loader now prints a one-time deprecation warning per process for any specflow-owned key found in `openspec/config.yaml` (e.g., `apply.subagent_dispatch.enabled`, `max_autofix_rounds`).
- The warning names both the offending key and the canonical destination (`.specflow/config.yaml`).
- The legacy value is **ignored** — it is NOT honored as a backward-compatible fallback. Operators must relocate the setting to take effect.

### 3. Subagent dispatch default flipped to `true`

- `apply.subagent_dispatch.enabled` now defaults to `true`.
- Existing eligibility guards remain unchanged: a `task-graph.json` must be present and at least one bundle must have `size_score > threshold` for the dispatcher to engage.
- Operators who require pre-feature behavior set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`.
- Canonical wording: **"enabled by default, explicit opt-out"** (the prior "opt-in" framing is dropped).

### 4. Default-engaged dispatch fails fast on missing local subagent runtime

- When dispatch engages by default and a window contains a subagent-eligible bundle, specflow verifies the operator's local subagent runtime prerequisites before spawning any subagent.
- Verified: agent identifiers in `.specflow/config.env` are valid; the chosen main-agent CLI is resolvable on `PATH` (or at the configured override path).
- On failure the apply stops with an actionable error citing both fix paths:
  1. Resolve the local runtime in `.specflow/config.env`, or
  2. Set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`.
- The run remains in `apply_draft`. There is no silent fallback to inline execution.

### 5. Borderline-setting override path (documented, with one concrete instance)

- A "borderline" specflow setting (workflow-policy semantics with a per-operator-tunable aspect) is defined in `.specflow/config.yaml` as the shared default.
- An operator MAY override it via `.specflow/config.env` using the convention `<a>.<b>.<c>` → `SPECFLOW_<A>_<B>_<C>`.
- This release classifies `apply.subagent_dispatch.max_concurrency` as borderline. Override env var: `SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY`.
- Other settings remain non-overridable via env (the override path is opt-in per setting, not blanket).

## Rollback path

- An operator who needs the old behavior on a single machine: set `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`.
- A repo that wants to roll back the default flip: pin `DEFAULT_DISPATCH_CONFIG.enabled = false` in `src/lib/apply-dispatcher/config.ts`.
- The legacy `openspec/config.yaml` location is detect-only; restoring the old read-from-openspec/config.yaml path requires a code change.

## Spec deltas in this change

- **NEW**: `config-ownership-boundaries` — defines the partitioning rule, borderline override path, and misplaced-entry handling.
- **MODIFIED**: `bundle-subagent-execution` — file-path move, default flip, runtime-prereq fail-fast scenarios.
- **MODIFIED**: `review-orchestration` — review configuration moves to `.specflow/config.yaml`, legacy ignored.
- **MODIFIED**: `review-autofix-progress-observability` — heartbeat / stale threshold sourced from `.specflow/config.yaml`.
- **MODIFIED**: `slash-command-guides` — `/specflow.apply` documentation reflects the new default, location, and runtime-prereq fail-fast.
