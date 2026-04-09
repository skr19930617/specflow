## 1. Project Setup

- [ ] 1.1 Create `package.json` with `tsx` and `typescript` as dev dependencies
- [ ] 1.2 Create `tsconfig.json` with strict mode, ES module output, and `src/` as root
- [ ] 1.3 Run `npm install` and verify `tsx` and `tsc` are available
- [ ] 1.4 Add `dist/` to `.gitignore`

## 2. Type Definitions

- [ ] 2.1 Create `src/types.ts` with asset type enum (`command`, `prompt`, `orchestrator`, `handoffTarget`, `agentRole`)
- [ ] 2.2 Define a shared `RegistryEntry` interface with `id`, `type`, `filePath`, `references`, and optional metadata fields
- [ ] 2.3 Define specialized entry types so `HandoffTargetEntry` resolves to a command via `references` and `AgentRoleEntry` remains a first-class symbolic asset with the shared entry contract
- [ ] 2.4 Define `Registry` interface grouping entries into top-level `commands`, `prompts`, `orchestrators`, `handoffTargets`, and `agentRoles`
- [ ] 2.5 Define `ValidationError` interface with `id`, `type`, `check`, `message`, `filePath`
- [ ] 2.6 Define `Manifest` interface with asset groups and `metadata` (generatedAt, registryVersion, gitCommit)

## 3. Registry Declaration

- [ ] 3.1 Create `src/registry.ts` with all command entries from `global/commands/*.md`
- [ ] 3.2 Add all prompt entries from `global/prompts/*.md`
- [ ] 3.3 Add all executable orchestrator entries from `bin/`
- [ ] 3.4 Add first-class `handoffTargets` entries that map each handoff ID to its target command and command file path
- [ ] 3.5 Add first-class `agentRoles` entries for the supported role set, anchored to `src/registry.ts`
- [ ] 3.6 Add cross-references (command→prompt, command→handoffTarget, command→agentRole, orchestrator→prompt) based on current codebase analysis

## 4. Command Source Updates

- [ ] 4.1 Update `global/commands/specflow.design.md` so its validate step and explanatory text use `openspec validate "<CHANGE_ID>" --type change --json`

## 5. Validation Checkers

- [ ] 5.1 Create `src/checks/unique-ids.ts` — verify all asset IDs are unique within their type
- [ ] 5.2 Create `src/checks/unique-slash-names.ts` — verify slash command names are unique
- [ ] 5.3 Create `src/checks/prompt-refs.ts` — verify referenced prompt templates exist in registry
- [ ] 5.4 Create `src/checks/handoff-targets.ts` — verify command-referenced handoff target IDs exist in `registry.handoffTargets` and each resolves to a registered command
- [ ] 5.5 Create `src/checks/agent-roles.ts` — verify command-referenced agent role IDs exist in `registry.agentRoles`
- [ ] 5.6 Create `src/checks/command-syntax.ts` — verify `openspec validate` calls use correct syntax
- [ ] 5.7 Create `src/checks/file-exists.ts` — verify every `filePath` in registry points to an existing file
- [ ] 5.8 Create `src/checks/registry-completeness.ts` — scan `global/commands/*.md`, `global/prompts/*.md`, and executable files in `bin/`, failing on missing or extra registry entries for file-backed asset types

## 6. Validation Pipeline

- [ ] 6.1 Create `src/validate.ts` — pipeline entry point that runs all checkers and collects errors
- [ ] 6.2 Implement formatted error output with actionable context (id, type, check name, message)
- [ ] 6.3 Exit with code 0 on success (print asset summary), non-zero on failure (print all errors)
- [ ] 6.4 Add `validate:registry` script to `package.json` pointing to `tsx src/validate.ts`

## 7. Manifest Generation

- [ ] 7.1 Create `src/manifest.ts` — generate `dist/manifest.json` from validated registry with top-level `commands`, `prompts`, `orchestrators`, `handoffTargets`, and `agentRoles`
- [ ] 7.2 Implement deterministic output: sorted keys, sorted arrays by id, 2-space indent
- [ ] 7.3 Include metadata: `generatedAt` (ISO 8601), `registryVersion`, `gitCommit` (short SHA)
- [ ] 7.4 Skip manifest generation when validation fails
- [ ] 7.5 Integrate manifest generation into the validation pipeline (generate after all checks pass)

## 8. Tests

- [ ] 8.1 Add test framework (`vitest` or Node test runner) to dev dependencies
- [ ] 8.2 Write unit tests for each checker in `src/checks/`, including completeness and symbolic asset validation (valid and invalid cases)
- [ ] 8.3 Write integration test: full pipeline with a valid registry produces a manifest containing all five asset groups
- [ ] 8.4 Write integration test: missing/extra filesystem assets or dangling handoff/agent role references produce errors and no manifest
- [ ] 8.5 Write test for deterministic manifest output (two runs produce identical JSON except for `generatedAt`)
- [ ] 8.6 Verify test coverage ≥ 80%
