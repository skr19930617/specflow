## Context

specflow currently manages ~16 command files (`global/commands/*.md`), 5 prompt files (`global/prompts/*.md`), and 10 orchestrator scripts (`bin/specflow-*`). These assets cross-reference each other: commands invoke other commands as handoff targets, orchestrator scripts read prompt files at runtime, and commands embed `openspec validate` calls.

Today, these references are validated only at runtime — a typo in a handoff target or a renamed prompt file silently breaks the flow until a user hits it. The codebase has no `package.json` or TypeScript setup; all logic is in Bash scripts and Markdown command files.

## Goals / Non-Goals

**Goals:**
- Establish a TypeScript typed registry as the single source of truth for all specflow assets
- Provide a build-time `npm run validate:registry` command that catches broken references before they reach users
- Verify registry completeness against on-disk command, prompt, and orchestrator files
- Generate `dist/manifest.json` as a deterministic, machine-readable inventory of all assets
- Set up the Node/TypeScript project foundation (`package.json`, `tsconfig.json`, `tsx`)

**Non-Goals:**
- Replacing runtime path resolution in existing Bash scripts (deferred to follow-up)
- Using filesystem discovery as the source of truth for asset metadata or references
- UI or interactive tooling for registry management
- Changing any existing Bash script behavior

## Decisions

### D1: TypeScript with tsx for execution, tsc --noEmit for type checking

**Choice:** TypeScript source in `src/`, executed via `tsx`, type-checked via `tsc --noEmit`.

**Rationale:** TypeScript provides compile-time type safety for the registry schema. `tsx` allows direct execution without a build step, keeping the workflow simple. `tsc --noEmit` provides a separate type-checking gate.

**Alternatives considered:**
- Pure JSON registry: No type safety, verbose, error-prone for large registries.
- YAML registry: More readable but no type safety; would need a separate schema validator.
- JavaScript: No type safety at definition time.

### D2: Manually maintained registry with filesystem completeness validation

**Choice:** The registry is a hand-written TypeScript file (`src/registry.ts`) that explicitly lists all assets.

**Rationale:** Auto-discovery would miss cross-reference metadata (which command references which prompt, handoff targets, etc.). Manual maintenance keeps metadata explicit and reviewable, while a separate completeness checker scans `global/commands/*.md`, `global/prompts/*.md`, and executable files in `bin/` to ensure file-backed assets are neither missing from nor extra in the registry. This preserves the registry as the source of truth for metadata without allowing it to silently drift from the filesystem.

**Alternatives considered:**
- Auto-discovery with annotation: Scan files and extract metadata from frontmatter. More complex, requires markdown parsing, and cross-references still need manual declaration.
- Hybrid (auto-discover files, manually declare references): Splits the source of truth, making it unclear what is authoritative.

### D3: Handoff targets and agent roles are first-class registry groups

**Choice:** `Registry` and the generated manifest expose top-level `commands`, `prompts`, `orchestrators`, `handoffTargets`, and `agentRoles` arrays. `handoffTargets` are symbolic alias assets that carry the shared entry contract (`id`, `type`, `filePath`, `references`) and resolve to a registered command via `references`. `agentRoles` are symbolic registry-defined assets that also use the shared entry contract, with `filePath` anchored to `src/registry.ts` because they do not have standalone files on disk.

**Rationale:** The proposal and manifest requirements explicitly call for top-level `handoffTargets` and `agentRoles`. Modeling both as first-class asset groups keeps the schema and manifest consistent, preserves a common entry contract across asset types, and lets commands reference validated IDs instead of free-form strings. Treating `handoffTargets` as aliases over command assets avoids inventing new files, while treating `agentRoles` as registry-defined symbolic assets reflects how roles are actually maintained.

**Alternatives considered:**
- Commands-only handoff references: Simpler initially, but it leaves the required manifest sections underspecified and makes handoff metadata impossible to validate uniformly.
- Enum-only agent roles with no registry entries: Validates strings, but cannot satisfy the requirement that agent roles appear as first-class manifest assets with the common entry contract.

### D4: Validation checks run as a pipeline of independent checkers

**Choice:** Each validation rule (unique IDs, prompt existence, handoff targets, etc.) is an independent checker function. The pipeline runs all checkers and collects all errors before reporting.

**Rationale:** Independent checkers are easy to test, extend, and run selectively. Collecting all errors (rather than failing on the first) gives users a complete picture in one run.

### D5: Manifest includes sorted keys for deterministic output

**Choice:** All arrays in the manifest are sorted by `id`. Object keys are sorted. Only the `generatedAt` timestamp varies between runs.

**Rationale:** Deterministic output means `git diff` on the manifest is meaningful and CI caching works reliably.

### D6: File structure

```
src/
├── registry.ts          # Typed asset declarations
├── types.ts             # Registry type definitions
├── validate.ts          # Validation pipeline entry point
├── checks/              # Individual checker functions
│   ├── unique-ids.ts
│   ├── unique-slash-names.ts
│   ├── prompt-refs.ts
│   ├── handoff-targets.ts
│   ├── agent-roles.ts
│   ├── command-syntax.ts
│   ├── file-exists.ts
│   └── registry-completeness.ts
└── manifest.ts          # Manifest generation logic
dist/
└── manifest.json        # Generated output (gitignored)
package.json
tsconfig.json
```

## Risks / Trade-offs

- **[Manual registry drift]** → The registry can fall out of sync with actual files. Mitigation: Keep the registry manual for metadata, but add both a `file-exists` checker for declared paths and a `registry-completeness` checker that scans file-backed asset locations for missing or extra entries. CI runs validation on every PR.
- **[New dependency on Node/TypeScript]** → The project currently has no Node dependencies. Mitigation: Keep dependencies minimal (`tsx`, `typescript` dev-only). No runtime dependencies.
- **[Incomplete cross-reference extraction]** → Initial registry may miss some references in Markdown command files. Mitigation: Start with known references from existing code analysis; iterate as gaps are found.
- **[Symbolic asset ambiguity]** → `handoffTargets` and `agentRoles` are not both backed by standalone files. Mitigation: Treat them explicitly as symbolic asset groups in the schema, give them stable `filePath` anchors, and keep completeness scanning limited to file-backed asset types.
- **[Registry maintenance burden]** → Adding a new command requires updating `registry.ts`. Mitigation: Validation fails immediately if a new file-backed asset is added on disk without the corresponding registry entry.

## Open Questions

- Should `dist/manifest.json` be committed to the repository or generated in CI only? (Leaning toward gitignored + CI-generated to avoid stale committed artifacts.)
