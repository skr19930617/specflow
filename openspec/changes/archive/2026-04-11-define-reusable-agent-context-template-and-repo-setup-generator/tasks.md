## 1. Profile Schema & Validation

- [x] 1.1 Create `src/lib/profile-schema.ts` with TypeScript types for profile (ProfileSchema, ProfileCommands, ProfileDirectories)
- [x] 1.2 Add `schemaVersion` constant (`CURRENT_PROFILE_SCHEMA_VERSION = "1"`), version comparison utilities, and raw `schemaVersion` sniff helper
- [x] 1.3 Add profile validator to `src/lib/schemas.ts` following existing `validateSchemaValue()` pattern — enforce closed objects, required/optional field rules, nullability rules
- [x] 1.4 Add profile load/write utilities in `profile-schema.ts`: `loadProfileForSetup()` for raw read -> minimal object guard -> schemaVersion sniff -> migrate older -> validate current schema -> continue, and `readProfileStrict()` for raw read -> minimal object guard -> schemaVersion sniff -> older/newer mismatch abort with remediation -> validate current schema -> continue; do not validate a stale pre-migration payload against the current schema
- [x] 1.5 Implement migration helpers for older profile versions and strict-abort behavior for newer-version profiles
- [x] 1.6 Write unit tests for profile schema validation and load paths — valid profile, missing required fields, unknown keys in closed objects, null vs empty array semantics, outdated-profile rerun migration, and strict reader / render-update behavior on older/newer versions

## 2. Agent Context Core Contract

- [x] 2.1 Create `src/lib/agent-context-template.ts` with canonical five-layer definitions, ownership/persistence metadata, namespace identifiers, layer-to-artifact mapping, and precedence constants
- [x] 2.2 Add adapter-facing types/helpers that surfaces and runtime injectors consume without Claude-specific wording (layer descriptors, priority comparator, adapter input envelope, resolved envelope helper for all five layer namespaces); adapters must import this core contract instead of re-encoding precedence or namespace rules
- [x] 2.3 Write unit tests for namespace separation, full five-namespace envelope resolution, and conflict resolution priority (Layer 1 > 3 > 2 > 4 > 5)

## 3. Ecosystem Detection

- [x] 3.1 Create `src/lib/ecosystem-detector.ts` with `detectEcosystem()` function implementing the priority-based detection matrix
- [x] 3.2 Implement primary indicator scanning (package.json, Cargo.toml, go.mod, pyproject.toml)
- [x] 3.3 Implement conflict detection (multiple ecosystems, workspace definitions, no indicators)
- [x] 3.4 Implement toolchain resolution from lockfiles (npm/pnpm/yarn/bun, cargo, go, pip/poetry/uv)
- [x] 3.5 Implement command detection from package.json scripts, Makefile, pyproject.toml tool sections
- [x] 3.6 Implement directory detection (source, test, generated directories)
- [x] 3.7 Write unit tests for ecosystem detection — single-root JS repo, Rust repo, Python repo, multi-ecosystem conflict, workspace detection, ambiguous toolchain

## 4. Profile Diff & Rerun

- [x] 4.1 Create `src/lib/profile-diff.ts` with `diffProfiles()` function implementing field-level comparison
- [x] 4.2 Implement diff rules: equal (no change), both non-null different (conflict), null->value (proposal), value->null (preserve)
- [x] 4.3 Implement diff flattening for nested objects (commands child keys, directories child keys) and array normalization
- [x] 4.4 Write unit tests for profile diff — no changes, field conflict, new detection, lost detection, nested object diff

## 5. Claude Adapter Renderer

- [x] 5.1 Create `src/lib/claude-renderer.ts` with managed/unmanaged marker parser and structured render result types including `warning`, `diffPreview`, and `writeDisposition`
- [x] 5.2 Implement `parseClaudeMd()` — extract managed block, unmanaged content, and detect marker anomalies (missing, duplicate, wrong order)
- [x] 5.3 Implement `renderManagedBlock()` using the shared agent context contract and generate managed Layer 1-2 content
- [x] 5.4 Implement `renderClaudeMd()` — compose final CLAUDE.md and return proposed content, warnings, diff preview, and `writeDisposition` (`safe-write` / `confirmation-required` / `abort`)
- [x] 5.5 Implement legacy migration planning — detect marker-less CLAUDE.md, prepend managed block, preserve existing content as unmanaged, and mark the result as `confirmation-required`
- [x] 5.6 Implement version mismatch detection — compare profile schemaVersion with template expected version and abort on mismatch for strict render callers
- [x] 5.7 Write unit tests for renderer — new file, existing with markers, legacy without markers, marker anomalies, version mismatch, and `safe-write` / `confirmation-required` / `abort` result handling

## 6. Template & Contract Updates

- [x] 6.1 Update `assets/template/CLAUDE.md` to v2 format with managed markers and profile reference slot
- [x] 6.2 Update `src/contracts/templates.ts` — update `template-claude-md` contract sourcePath if needed
- [x] 6.3 Verify `src/lib/project-gitignore.ts` does not add `.specflow/profile.json` to gitignore
- [x] 6.4 Update shared exports or contract wiring so future surfaces and runtime injectors can depend on `agent-context-template.ts` instead of Claude-specific helpers
- [x] 6.5 Add `template-profile-schema` contract if profile schema needs to be distributed as a template asset

## 7. Setup Command Body Rewrite

- [x] 7.1 Rewrite `specflow.setup` sections in `src/contracts/command-bodies.ts` — Step 1: Scope & Ecosystem Detection
- [x] 7.2 Add Step 2: Profile Load / Migration / Diff-and-Resolve using `loadProfileForSetup()` (raw read -> schemaVersion sniff -> migrate older -> diff current object)
- [x] 7.3 Add Step 3: Schema Validation & Profile Write for the migrated/resolved current-schema object only
- [x] 7.4 Add Step 4: Claude Adapter Render Planning and `RenderResult` handling (`warning`, `diffPreview`, `writeDisposition`)
- [x] 7.5 Add Step 5: `CLAUDE.md` warning/diff/confirmation gate before write; show renderer-provided warning + diff preview, only `safe-write` may auto-apply, `confirmation-required` must prompt for explicit accept/reject, `abort` must leave the file unchanged
- [x] 7.6 Add Important Rules section (validation-first, no silent guess, setup-only migration, user confirmation required)
- [x] 7.7 Write setup flow tests for first run, rerun with outdated profile, and legacy `CLAUDE.md` reject/accept paths

## 8. Init/Update Integration

- [x] 8.1 Add profile existence check and skip-with-suggestion when profile is missing during `--update`
- [x] 8.2 Use `readProfileStrict()` during `--update` and non-setup renderer entrypoints so older/newer schema versions abort with remediation text instead of migrating implicitly
- [x] 8.3 Update `src/bin/specflow-init.ts` `--update` flow to trigger Claude adapter rendering when a strict-read current profile exists
- [x] 8.4 Add legacy `CLAUDE.md` warning/diff/confirmation gate to `--update`; show renderer-provided warning + diff preview and leave the file unchanged on reject
- [x] 8.5 Write update-flow tests for older/newer profile version aborts and rejected/confirmed legacy migration write

## 9. Build & Verification

- [x] 9.1 Run `npm run build` and fix any TypeScript compilation errors
- [x] 9.2 Run `npm run lint` and fix formatting issues
- [x] 9.3 Run `npm test` and ensure all existing tests pass
- [x] 9.4 Run `npm run check` (if exists) for type checking
- [x] 9.5 Manually test setup flow on this repository (specflow dogfooding)
