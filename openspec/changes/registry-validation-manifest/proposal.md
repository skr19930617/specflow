## Why

Commands, prompts, and orchestrator scripts are currently discovered via filesystem pattern matching and hardcoded path references (`PROMPTS_DIR`, `LIB`, `COMMANDS_DIR`). There is no single source of truth that enumerates all registered assets or validates their cross-references at build time. Broken references (e.g., a slash command referencing a non-existent prompt template or handoff target) are only caught at runtime, making debugging slow and error-prone. A build-time validation step with a generated manifest provides a deterministic, testable contract that later CLI commands can consume.

## What Changes

- Add a TypeScript typed registry that declares all asset types: commands, prompts, orchestrator scripts, handoff targets, and agent roles
- Add an `npm run validate:registry` command (executed via `tsx`) that checks the registry for consistency errors (duplicate IDs, missing references, invalid targets)
- Generate a manifest file (`dist/manifest.json`) from the validated registry
- Type-check the registry with `tsc --noEmit` as a separate validation step
- **Out of scope**: Runtime consumption of the manifest by existing Bash scripts (deferred to a follow-up issue)

### Technical Decisions

- **Registry format**: TypeScript — provides type safety for the registry definition; `tsx` for direct execution without a compile step, `tsc --noEmit` for type checking
- **Entry point**: `npm run validate:registry` — aligns with issue acceptance criteria and CI integration
- **Scope**: Validation + manifest generation only; existing script path resolution remains unchanged in this change
- **Asset coverage**: All asset types from the start (commands, prompts, orchestrator scripts, handoff targets, agent roles, asset destinations)

## Capabilities

### New Capabilities
- `registry-validation`: Build-time validation command (`npm run validate:registry`) that checks the typed TypeScript registry for uniqueness, referential integrity, and structural correctness across all command/prompt/orchestrator/handoff/agent-role references
- `manifest-generation`: Deterministic generation of `dist/manifest.json` from the validated registry, providing a single artifact that runtime code can consume instead of re-deriving structure

### Modified Capabilities
- `validate-command-syntax`: Extend existing syntax validation to integrate with the new registry validation pipeline, ensuring command syntax checks run as part of the unified validation step

## Impact

- **Code**: New `src/` directory with TypeScript registry definitions and validation logic; `dist/manifest.json` output
- **Project setup**: New `package.json` with `tsx`, `typescript` dev dependencies; `tsconfig.json` configuration
- **CI**: A new `validate:registry` step can be added to CI pipelines to catch reference errors before merge
- **Existing scripts**: No changes in this scope — Bash scripts continue using hardcoded paths
- **Dependencies**: `tsx`, `typescript` (dev only)
- **Related**: #58 (parent registry work)
