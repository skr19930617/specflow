## Context

The specflow workflow has 18 phases defined in the xstate state machine (`src/lib/workflow-machine.ts`). Each phase's operational behavior — which artifacts to read/write, which CLI commands to invoke, when to prompt the user — is currently embedded as natural-language Markdown inside `src/contracts/command-bodies.ts` (854 lines). The `PhaseRouter` (`src/lib/phase-router/`) already consumes a minimal `PhaseContract` type with routing fields (`next_action`, `gated`, `terminal`), with a comment explicitly deferring the full type to issue #129.

The dependency #128 (RunState split into CoreRunState and LocalRunState) has landed. The existing contracts infrastructure (`src/contracts/`, `src/types/contracts.ts`) provides patterns for structured contract definitions.

## Goals / Non-Goals

**Goals:**
- Define a single unified `PhaseContract` type that merges routing metadata (from phase-router) with execution metadata (inputs, outputs, CLI steps, agent tasks, gated decisions)
- Build a `PhaseContract[]` registry covering all 18 workflow phases
- Implement a `PhaseContract → Markdown` renderer that produces semantically equivalent output to the current `command-bodies.ts` for structured portions
- Move `PhaseContract` to its canonical location at `src/contracts/phase-contract.ts`
- Update `phase-router` to import from the new canonical module and validate execution fields

**Non-Goals:**
- Rewiring CLI commands to use `PhaseRouter` for orchestration (deferred — router ships dormant)
- Full elimination of prose templates from `command-bodies.ts` — only structurable portions are extracted
- Runtime execution of `PhaseContract.cliCommands` by the server orchestrator (future work)
- Changing the workflow state machine shape or adding/removing phases

## Decisions

### D1: Type location — `src/contracts/phase-contract.ts`

Place the canonical `PhaseContract` type, sub-types, and the `PhaseContractRegistry` interface in `src/contracts/phase-contract.ts`. This aligns with the existing pattern where `surface-events.ts` lives in the same directory. `src/lib/phase-router/types.ts` becomes a re-export shim.

**Alternative considered**: Keeping the type in `src/lib/phase-router/types.ts` — rejected because the type is now consumed by multiple modules (router, command-bodies, Markdown renderer), making `contracts/` the natural home.

### D2: Single unified type (no split interfaces)

Merge routing fields and execution fields into one `PhaseContract` interface. The router reads only the routing subset; the renderer reads the execution subset. Both operate on the same object.

**Alternative considered**: `PhaseRoutingMeta & PhaseExecutionMeta` composition — rejected because it adds indirection without benefit; consumers still need the full type.

### D3: Incremental extraction — structured data alongside prose templates

Extract only machine-readable data (CLI commands, artifact refs, gate decisions) into `PhaseContract`. Prose guidance (natural-language explanations, conditional instructions) remains as Markdown template strings in `command-bodies.ts`. The renderer merges generated structured sections with prose templates.

**Alternative considered**: Full extraction of all content into `PhaseContract` — rejected per clarify decision; too much context-specific prose can't be meaningfully typed.

### D4: Minimal sub-types, extensible later

Sub-types use the simplest useful shape:
- `ArtifactRef = { path: string; role: "input" | "output" }`
- `CliStep = { command: string; description: string }`
- `AgentTaskSpec = { agent: string; description: string }`
- `GatedDecisionSpec = { options: string[]; advanceEvents: Record<string, string> }`

Future PRs can add fields (e.g., `CliStep.when`, `ArtifactRef.schema`) without breaking the current shape.

### D5: Router validates execution fields but doesn't change action derivation

The router's `deriveAction` logic remains unchanged. The `assertConsistent` method adds validation that `requiredInputs` and `producedOutputs` are present arrays. This catches registration errors early without altering routing behavior.

### D6: Semantic Markdown comparison for tests

Tests compare generated Markdown against the current `command-bodies.ts` output at the structural level: matching section headings, CLI command strings, and gate condition patterns. Whitespace normalization is applied before comparison.

## Risks / Trade-offs

- [Risk] Large diff touching `command-bodies.ts` and `phase-router/types.ts` → Mitigation: The refactoring is mechanical — types move, imports update. The router logic itself is unchanged. Existing router tests serve as regression guards.
- [Risk] Markdown renderer may not perfectly replicate all prose template nuances → Mitigation: Only structured portions are generated; prose stays as-is. Semantic comparison tests catch regressions.
- [Risk] Phase contracts must stay in sync with the workflow state machine → Mitigation: Add a test that asserts `registry.phases()` matches `workflowStates` from the state machine.

## Concerns

### C1: Type definition and sub-types
Define `PhaseContract`, `ArtifactRef`, `CliStep`, `AgentTaskSpec`, `GatedDecisionSpec`, `PhaseNextAction`, and `PhaseContractRegistry` in `src/contracts/phase-contract.ts`. Resolves the fragmented type ownership where `PhaseContract` lives in `phase-router` but is consumed project-wide.

### C2: Phase contract registry population
Build the production `PhaseContractRegistry` with a `PhaseContract` entry for every workflow state (18 phases). Each entry carries the routing fields from the existing router test fixtures plus new execution fields extracted from `command-bodies.ts`. Resolves the gap between the state machine definition and per-phase operational metadata.

### C3: PhaseContract → Markdown renderer
Implement `renderPhaseMarkdown(contract: PhaseContract): string` that generates Markdown from structured fields — CLI commands as fenced code blocks, artifact refs as bullet lists, gated decisions as option blocks. Resolves the dependency where Markdown guides currently own the operational truth.

### C4: command-bodies.ts refactoring
Refactor `commandBodies` entries so that sections with structurable content reference the `PhaseContract` registry and invoke the renderer, while prose sections remain as template strings. Resolves the duplication between operational data and Markdown templates.

### C5: phase-router import migration
Update all `src/lib/phase-router/*.ts` files to import `PhaseContract` and related types from `src/contracts/phase-contract.ts`. Update `index.ts` re-exports. Add execution field validation to `deriveAction`. Resolves the temporary type ownership noted in the `#129` comment.

## State / Lifecycle

- **Canonical state**: The `PhaseContract[]` registry is built at module load time (static data, no runtime mutation). Each `PhaseContract` is a frozen readonly object.
- **Derived state**: The `PhaseContractRegistry.get()` lookup is derived from the array via `Map` construction at initialization.
- **Lifecycle boundaries**: Registry is created once and never changes. The Markdown renderer is a pure function — no state.
- **Persistence-sensitive state**: None. Phase contracts are source-code constants, not persisted artifacts.

## Contracts / Interfaces

### `src/contracts/phase-contract.ts` → consumers
- **Types exported**: `PhaseContract`, `PhaseContractRegistry`, `PhaseNextAction`, `ArtifactRef`, `CliStep`, `AgentTaskSpec`, `GatedDecisionSpec`
- **Registry factory**: `createPhaseContractRegistry(contracts: readonly PhaseContract[]): PhaseContractRegistry`
- **Renderer**: `renderPhaseMarkdown(contract: PhaseContract): string`

### `src/lib/phase-router/types.ts` → re-exports
- Re-exports `PhaseContract`, `PhaseContractRegistry`, `PhaseNextAction` from `src/contracts/phase-contract.ts`
- Keeps local types: `SurfaceEventContext`, `SurfaceEventSink`, `PhaseAction` (these are router-specific)

### `src/contracts/command-bodies.ts` → slash-command generation
- Imports `PhaseContract` registry and `renderPhaseMarkdown`
- Section content generation: `prose template + renderPhaseMarkdown(contract)` for phases with contracts

## Persistence / Ownership

- **Type ownership**: `src/contracts/phase-contract.ts` owns all `PhaseContract` types. `phase-router/types.ts` delegates via re-export.
- **Data ownership**: Phase contract data lives as const arrays in `src/contracts/phase-contract.ts` (or a sibling data file). No filesystem persistence.
- **Artifact ownership**: Markdown guides are generated artifacts owned by the build pipeline. They are not hand-edited.

## Integration Points

- **Workflow state machine** (`src/lib/workflow-machine.ts`): Registry must cover exactly `workflowStates`. A cross-check test enforces this.
- **Build pipeline** (`src/contracts/install.ts`): The `commandContracts` array already drives guide generation. This change makes section content partially dynamic (from `PhaseContract`) instead of fully static.
- **Phase router** (`src/lib/phase-router/router.ts`): Imports shift to `src/contracts/phase-contract.ts`. Router code changes are limited to import paths and execution field validation.

## Ordering / Dependency Notes

1. **C1 (types)** is foundational — all other concerns depend on it.
2. **C2 (registry)** depends on C1 and on reading `command-bodies.ts` to extract structured data.
3. **C3 (renderer)** depends on C1. Can be developed in parallel with C2.
4. **C4 (command-bodies refactoring)** depends on C2 + C3.
5. **C5 (phase-router migration)** depends on C1. Can be developed in parallel with C2/C3/C4.

Parallelizable pairs: (C2, C3), (C2, C5), (C3, C5).

## Completion Conditions

- **C1 complete**: `src/contracts/phase-contract.ts` exports all types and compiles. Unit test verifies type shape.
- **C2 complete**: `createPhaseContractRegistry` returns a registry with entries for all 18 workflow states. Test asserts `registry.phases()` matches `workflowStates`.
- **C3 complete**: `renderPhaseMarkdown` produces output containing expected CLI commands and section headings. Semantic comparison test passes.
- **C4 complete**: `command-bodies.ts` uses the registry + renderer for structurable sections. Generated slash-command guides are semantically equivalent to pre-refactor output.
- **C5 complete**: `phase-router/types.ts` has no local `PhaseContract` definition. All router tests pass. `deriveAction` validates `requiredInputs`/`producedOutputs` presence.
