## Context

`src/contracts/command-bodies.ts` (870 lines) defines the body content for all slash commands as a `Record<string, CommandBody>`. Each `CommandBody` contains `frontmatter` and `sections`, where `sections[].content` holds long Markdown string literals mixing prose instructions, shared prerequisites, phase contract references, and runtime rules.

The current build pipeline in `src/build.ts` calls `renderCommands(contracts.commands)` which iterates over `CommandContract[]`, calling `renderBody()` + `renderFrontmatter()` + `renderHookSection()` to emit final markdown into `dist/package/global/commands/<id>.md`.

Key existing modules:
- `src/contracts/commands.ts` — constructs `CommandContract[]` by pairing each command id with its `CommandBody` from `command-bodies.ts`
- `src/generators/commands.ts` — `renderCommands()` renders frontmatter, body sections, and hook sections
- `src/contracts/prerequisites.ts` — `buildOpenspecPrereq()` generates shared prerequisite text
- `src/contracts/phase-contract.ts` — `phaseContractRegistry` + `renderPhaseMarkdown()` generate structured phase content
- `src/types/contracts.ts` — `CommandBody`, `CommandSection`, `CommandContract` type definitions

## Goals / Non-Goals

**Goals:**
- Move prose content from TS string literals to `assets/commands/*.md.tmpl` Markdown template files
- Define 3 insertion tag kinds: `{{insert:}}`, `{{contract:}}`, `{{render:}}`
- Build-time template resolution producing the same output as the current pipeline
- All commands migrated in one pass with snapshot tests verifying equivalence
- Clear TS/template responsibility split: TS owns metadata + registration, templates own prose

**Non-Goals:**
- Runtime template resolution (templates are build-time only)
- Workflow semantics redesign
- Full PhaseContract structural completion (separate issue)
- MDX/React or heavy templating systems
- Nested insertion tag support

## Decisions

### D1: Template file location — `assets/commands/<id>.md.tmpl`

Templates live outside `src/` in `assets/commands/`. File names match command ids exactly (e.g., `specflow.apply.md.tmpl`).

**Rationale:** Separates authoring source from compiled TS code. The `.md.tmpl` extension signals "template, not final output" and plays well with editor Markdown highlighting.

**Alternative considered:** `src/contracts/templates/` — rejected because it would mix non-TS authoring files with compiled source.

### D2: Three insertion tag kinds with distinct semantics

| Tag | Resolves to | Source |
|-----|-------------|--------|
| `{{insert: <key>}}` | Shared prose snippet (string) | Insert registry (`src/contracts/inserts.ts`) |
| `{{contract: <phase>}}` | Raw PhaseContract structured data (JSON-like) | `phaseContractRegistry` |
| `{{render: <phase>}}` | Markdown-formatted PhaseContract output | `renderPhaseMarkdown()` |

**Rationale:** Three kinds preserve the semantic distinction between prose reuse, structured data embedding, and formatted rendering. `{{contract:}}` exposes the data for downstream processing; `{{render:}}` produces human-readable Markdown.

**Alternative considered:** Two kinds (merge contract + render) — rejected because future consumers may need raw contract data distinct from its rendered form.

### D3: Build-time only resolution

Template resolution runs in `src/build.ts` between contract validation and `renderCommands()`. The resolver produces resolved `CommandBody` objects. Runtime code never sees `.md.tmpl` files.

**Rationale:** Keeps runtime simple, avoids distributing template source, maintains existing `CommandContract` → `renderCommands()` pipeline.

### D4: Insert registry as a TS module

A new `src/contracts/inserts.ts` module exports a `Map<string, () => string>` mapping insert keys to generator functions. Existing generators like `buildOpenspecPrereq()` and `buildDesignArtifactInstruction()` are registered here.

**Rationale:** Insert resolution stays in TS for type safety and access to existing helper functions. Insert keys are validated at build time against the registry.

### D5: `CommandBody` type gains optional `templatePath`

```typescript
export interface CommandBody {
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly sections: readonly CommandSection[];
  readonly templatePath?: string;  // relative to repo root
}
```

When `templatePath` is set, `sections` are populated at build time by the resolver. The `command-bodies.ts` export retains the same shape — the resolver fills `sections` from the template before `commandContracts` is consumed by `renderCommands()`.

**Rationale:** Minimal type change. Existing `renderCommands()` / `renderBody()` pipeline is unchanged — it still reads `sections`. The resolver is an upstream transform.

### D6: Snapshot test strategy

Before migration, capture the full output of every `renderCommands()` call as baseline snapshots. After migration, the test asserts template-resolved output matches the baseline exactly. Snapshots are stored in `src/tests/__snapshots__/`.

**Rationale:** Exact string comparison is the strongest guarantee of output equivalence during migration.

## Risks / Trade-offs

- **Risk: Template drift** — Templates can diverge from TS-side expectations if insert keys or phase names change.
  → Mitigation: Build-time hard error on missing references. Contract validation includes template source existence check.

- **Risk: Large diff in one PR** — All commands migrate simultaneously.
  → Mitigation: Snapshot tests provide a safety net. Template content is extracted verbatim from existing string literals.

- **Risk: Editor tooling** — `.md.tmpl` files may not get full Markdown tooling support.
  → Mitigation: Content is valid Markdown except for `{{ }}` tags. Most editors handle this gracefully.

- **Trade-off: Build complexity** — Adds a template resolution step to the build pipeline.
  → Accepted: The step is simple (regex-based tag replacement, depth-1 only) and runs in <100ms.

## Concerns

### C1: Template Resolver Engine

The core concern: parse `.md.tmpl` files, identify insertion tags via regex, resolve each tag against the appropriate source (insert registry, phase contract registry), and produce a list of `CommandSection[]`.

Problem resolved: Eliminates the need to embed prose in TS string literals. Prose lives in Markdown files with clear insertion boundaries.

### C2: Insert Registry

Centralized registry mapping insert keys to generator functions. Wraps existing helpers (`buildOpenspecPrereq`, `buildDesignArtifactInstruction`) and future shared snippets.

Problem resolved: Makes shared prose fragments discoverable and reusable across commands without copy-paste.

### C3: Template Source Files

The set of `assets/commands/*.md.tmpl` files — one per command — containing the prose and insertion tags extracted from `command-bodies.ts`.

Problem resolved: Command authoring becomes Markdown editing rather than TS string editing. Diff readability improves.

### C4: Build Pipeline Integration

Wire the template resolver into `src/build.ts` between contract validation and `renderCommands()`. The resolver transforms `CommandBody` objects in-place (filling `sections` from templates).

Problem resolved: Template resolution is invisible to downstream generators — they continue to consume `CommandContract` with populated `sections`.

### C5: Snapshot Test Suite

Capture-and-compare test that verifies template-resolved output matches the pre-migration baseline for every command.

Problem resolved: Provides confidence that the migration preserves existing behavior.

### C6: Command Registration Refactor

Slim down `command-bodies.ts` to only export frontmatter + templatePath per command. Remove the inline string literals.

Problem resolved: `command-bodies.ts` shrinks from ~870 lines to ~100 lines of metadata declarations.

## State / Lifecycle

- **Build-time state**: Template files are read, parsed, resolved, and discarded. The resolved `CommandBody.sections` flow into `CommandContract` objects.
- **No runtime state**: Templates do not exist at runtime. The resolved markdown is written to `dist/` during build.
- **Insert registry lifecycle**: Created once during module load. Immutable after initialization. Consumed only by the resolver.
- **Persistence-sensitive state**: None. All state is transient within the build process.

## Contracts / Interfaces

### Template Resolver API

```typescript
// src/contracts/template-resolver.ts
export interface ResolvedSections {
  readonly sections: readonly CommandSection[];
}

export function resolveTemplate(
  templatePath: string,
  insertRegistry: ReadonlyMap<string, () => string>,
  phaseRegistry: ReadonlyMap<string, PhaseContract>,
): ResolvedSections;
```

### Insert Registry API

```typescript
// src/contracts/inserts.ts
export const insertRegistry: ReadonlyMap<string, (arg?: string) => string>;
```

Keys follow the pattern `<namespace>` or `<namespace>(<arg>)`. Examples:
- `openspec_prereq(specflow.apply)` — calls `buildOpenspecPrereq("specflow.apply")`
- `important_rules.common` — returns the common important rules block
- `design_artifact_instruction` — calls `buildDesignArtifactInstruction()`

### CommandBody Extension

```typescript
export interface CommandBody {
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly sections: readonly CommandSection[];
  readonly templatePath?: string;
}
```

### Build Pipeline Call Order

```
validateContracts(contracts)
  → resolveAllTemplates(contracts.commands)  // NEW
  → renderCommands(contracts.commands)
  → ... (rest unchanged)
```

## Persistence / Ownership

- **Template source files** (`assets/commands/*.md.tmpl`): Owned by command authors. Checked into git. Not distributed in npm package.
- **Resolved command markdown** (`dist/package/global/commands/*.md`): Owned by the build pipeline. Generated, not hand-edited. Distributed in npm package.
- **Insert registry** (`src/contracts/inserts.ts`): Owned by the contracts module. Contains reusable snippet generators.
- **Snapshot baselines** (`src/tests/__snapshots__/`): Owned by the test suite. Updated only when intentional output changes are made.

## Integration Points

- **`src/build.ts`**: New `resolveAllTemplates()` call inserted between validation and rendering.
- **`src/contracts/install.ts`**: No change — it assembles contracts before resolution.
- **`src/generators/commands.ts`**: No change — it consumes `CommandContract` with already-resolved `sections`.
- **`src/contracts/phase-contract.ts`**: Consumed by the resolver for `{{contract:}}` and `{{render:}}` tags.
- **`src/contracts/prerequisites.ts`**: Consumed by the insert registry for `{{insert: openspec_prereq(...)}}`.
- **`src/lib/contracts.ts` (validator)**: Extended to check template file existence for commands declaring `templatePath`.
- **`package.json` / `.npmignore`**: Updated to exclude `assets/commands/` from the published package.

## Ordering / Dependency Notes

### Foundational (implement first, in order)
1. **Insert registry** (`src/contracts/inserts.ts`) — no dependencies; wraps existing helpers
2. **Template resolver** (`src/contracts/template-resolver.ts`) — depends on insert registry + phase contract registry
3. **CommandBody type extension** — add `templatePath` to `CommandBody` interface

### Parallel (after foundational)
4. **Template source extraction** — extract prose from `command-bodies.ts` into `assets/commands/*.md.tmpl` files (can be parallelized per command)
5. **Build pipeline integration** — wire `resolveAllTemplates()` into `src/build.ts`
6. **Contract validation extension** — add template source existence check

### Final
7. **Snapshot tests** — capture baseline before migration, verify after
8. **command-bodies.ts refactor** — slim down to frontmatter + templatePath only
9. **Package exclusion** — update `.npmignore` / `package.json` files field

## Completion Conditions

| Concern | Done when |
|---------|-----------|
| C1: Template Resolver | `resolveTemplate()` passes unit tests for all 3 tag kinds + error cases |
| C2: Insert Registry | All existing shared snippets are registered and produce identical output |
| C3: Template Sources | Every command has a `.md.tmpl` file; no command has inline string sections |
| C4: Build Integration | `npm run build` succeeds and `dist/package/global/commands/` output is unchanged |
| C5: Snapshot Tests | All snapshot comparisons pass; coverage includes every command |
| C6: Registration Refactor | `command-bodies.ts` contains only frontmatter + templatePath; no inline content strings |
