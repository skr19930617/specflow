## 1. Canonical Config Loader and Default Flip ✓

> Move specflow shared-policy loading to `.specflow/config.yaml`, warn-and-ignore legacy keys in `openspec/config.yaml`, and enable dispatch by default.

- [x] 1.1 Inventory specflow-owned keys currently resolved from `openspec/config.yaml` across dispatch and review loaders.
- [x] 1.2 Implement canonical reads from `.specflow/config.yaml` with default fallback in `readDispatchConfig` and `readReviewConfig`.
- [x] 1.3 Add detect-only legacy probes, canonical-wins precedence, and one-time per-process deprecation warnings for misplaced keys in `openspec/config.yaml`.
- [x] 1.4 Flip `DEFAULT_DISPATCH_CONFIG.enabled` to `true` and align inline comments/docstrings with the new default and canonical file location.
- [x] 1.5 Preserve the shared-to-local override path at the loader boundary without changing `.specflow/config.env` loading semantics.

## 2. Init and Analyze Config Seeding ✓

> Ensure setup and analyze flows seed specflow-owned settings into `.specflow/config.yaml` while leaving OpenSpec-owned config in `openspec/config.yaml`.

> Depends on: canonical-config-loader

- [x] 2.1 Reroute `specflow-init` seeding for specflow policy keys to `.specflow/config.yaml`.
- [x] 2.2 Update `specflow-analyze` to read and write specflow-owned keys in `.specflow/config.yaml`.
- [x] 2.3 Add a starter `.specflow/config.yaml` template and strip specflow-owned keys from the `openspec/config.yaml` template.
- [x] 2.4 Keep `.specflow/config.env` seeding and local-runtime behavior unchanged while aligning file ownership comments and examples.

## 3. Dispatch Runtime Prerequisite Guard ✓

> Add lazy runtime validation so default-enabled dispatch fails fast with actionable errors before subagent spawn when local prerequisites are missing or invalid.

> Depends on: canonical-config-loader

- [x] 3.1 Identify the dispatcher window-entry hook and the exact eligibility conditions that should trigger runtime validation.
- [x] 3.2 Implement `verifyLocalSubagentRuntime(projectRoot)` to validate required CLI availability and main/review agent identifiers.
- [x] 3.3 Gate the runtime check on effective dispatch enablement and the presence of at least one subagent-eligible bundle in the current window.
- [x] 3.4 Surface an actionable failure that names both fix paths and preserves the run in `apply_draft` rather than silently falling back inline.

## 4. Spec and Docs Sync ✓

> Synchronize specs, guides, and release notes with the new config ownership boundary, migration warning, and default-enabled dispatch behavior.

> Depends on: canonical-config-loader, init-analyze-config-seeding, dispatch-runtime-prereq-guard

- [x] 4.1 Update baseline specs and operator docs to define `.specflow/config.yaml` as repo-owned shared policy and `.specflow/config.env` as gitignored local override space.
- [x] 4.2 Revise setup and slash-command guidance to describe dispatch as enabled by default with explicit opt-out via `apply.subagent_dispatch.enabled: false`.
- [x] 4.3 Document the legacy-key deprecation warning, manual migration path, and fail-fast local runtime troubleshooting steps.
- [x] 4.4 Add release-note/changelog coverage for the default flip, canonical config location, warning behavior, and rollback path.

## 5. Regression Coverage ✓

> Cover loader migration, seeding, default-enabled dispatch, fail-fast runtime validation, and override semantics with executable regression tests.

> Depends on: canonical-config-loader, init-analyze-config-seeding, dispatch-runtime-prereq-guard

- [x] 5.1 Update tests that pin the old dispatch default and add explicit opt-out coverage.
- [x] 5.2 Add loader tests for canonical-only reads, legacy-only reads with warning, canonical-wins duplicates, and defaults when neither file provides a value.
- [x] 5.3 Add fresh-install smoke coverage for `specflow-init` and `specflow-analyze` seeding `.specflow/config.yaml` without producing deprecation warnings.
- [x] 5.4 Add dispatcher tests for valid runtime, missing CLI, and invalid agent identifiers when default-enabled dispatch would engage.
- [x] 5.5 Add a shared-to-local override smoke test and verify the full change stays green under spec and CI verification.
