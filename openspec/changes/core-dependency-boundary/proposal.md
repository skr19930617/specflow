## Why

Git CLI calls, filesystem path assumptions, OpenSpec directory layout knowledge, and slash command surface details are currently accessible to — and in some cases leaking into — workflow core modules (`src/lib/workflow-machine.ts`, review orchestration, run-state management). This makes it impractical to reuse the workflow core from a separate server or external runtime repository, because those runtimes would need to carry Git/FS/CLI baggage they cannot satisfy.

Defining an explicit dependency boundary for core eliminates ambiguity about what core may import, guides future contributors away from accidental coupling, and provides a contract that external runtimes can rely on.

## What Changes

- Add a "Core Dependency Boundary" section to `docs/architecture.md` that defines:
  - **Core surface definition**: the boundary is an explicit module classification within `src/lib/`. Every module in `src/lib/` is classified as exactly one of: **core**, **adapter**, or **mixed** (a known violation). The following inventory is **authoritative** — it lists every `src/lib/` module as of this proposal:
    - **Core modules**: `workflow-machine.ts`, `schemas.ts`, `json.ts`
    - **Adapter modules**: `git.ts`, `fs.ts`, `paths.ts`, `process.ts`, `glob.ts`, `template-files.ts`, `project-gitignore.ts`
    - **Mixed modules (known violations)**: `review-ledger.ts`, `review-runtime.ts`, `contracts.ts`, `proposal-source.ts` — these contain core business logic but currently import adapter modules
    - **Default classification rule**: any new module added to `src/lib/` is classified as **adapter** unless it satisfies the core dependency rules and is explicitly added to the core list in the documentation. This prevents accidental expansion of the core surface
    - **Inventory maintenance rule**: the module inventory in `docs/architecture.md` is the authoritative classification. Any PR that adds, removes, or renames a module in `src/lib/` must update the inventory as part of that PR. If the inventory does not list a module, it is treated as adapter by default. Drift between the inventory and the actual `src/lib/` contents is a documentation bug that should be fixed but does not block runtime behavior
    - **Mixed-module interim rules**: mixed modules are treated as **adapter-side code** for boundary enforcement purposes. Specifically: (1) new core modules must not import mixed modules — they must only import other core modules; (2) adapter modules and `src/bin/*` entry-points may freely import mixed modules; (3) external runtimes must not depend on mixed module APIs — these are unsupported transitional code that will be refactored into separate core and adapter parts in follow-up proposals; (4) mixed modules may import both core and adapter modules (this is the violation being tracked, not a permission to extend)
  - **Core allowed dependencies** (exhaustive allowlist):
    - Other core modules within `src/lib/`
    - **Core-adjacent modules**: `src/types/contracts.ts` — this module contains type definitions and runtime const objects (e.g., `AssetType`) with no Node.js or adapter imports; both value and type imports from this module are allowed in core. Note: some types in this module (e.g., `RunState`) currently mix core-contract and local-adapter concerns — these are treated as transitional and the field-level split is deferred to a separate follow-up proposal, not to this change. `src/contracts/` modules (which contain build-time asset definitions and may import filesystem utilities) are **not** core-adjacent and remain outside the core boundary
    - ECMAScript globals and built-in objects (`JSON`, `Map`, `Set`, `Array`, `Promise`, `Error`, `RegExp`, `Date`, `URL`, `TextEncoder`/`TextDecoder`, `structuredClone`, etc.)
    - Third-party allowlist (complete): `xstate` — no other third-party packages are permitted in core without updating this list
    - Type-only imports follow the same rules as value imports: allowed only from core modules, core-adjacent type modules, and allowlisted third-party libraries — type-only imports from adapter modules, `src/bin/*`, `src/contracts/*`, or DB-specific packages are forbidden
  - **Core forbidden dependencies** (all Node.js built-in modules and everything not on the allowlist):
    - All Node.js built-in modules: `fs`, `path`, `os`, `child_process`, `net`, `http`, `crypto`, `stream`, `buffer`, `util`, `url` (the `node:` prefixed imports), and any other Node-specific APIs
    - `src/bin/*` entry-point modules
    - Slash command surface (command names, argument shapes)
    - DB vendor specifics (SQL drivers, ORM imports)
    - Any `src/lib/` module classified as adapter or mixed
  - **Boundary status model**: the document describes the **target state**. Known violations in mixed modules are recorded in a "Known Boundary Violations" table with module name, violation description, and tracking reference to follow-up refactoring work. Tracking references use the format `<repo>#<issue-number>` when a GitHub issue exists, or `TBD — to be filed before next release` as a placeholder when the follow-up issue has not yet been created. Violations are expected until refactoring proposals land — they are not treated as errors, but new violations must not be introduced
- Define **local adapter responsibility**: the bundled local reference implementation owns Git/FS access (`git.ts`, `fs.ts`, `paths.ts`), OpenSpec directory traversal, CLI argument parsing (`src/bin/*`), process orchestration (`process.ts`), and file-based run-state persistence
- Define **external runtime adapter responsibility**: external runtimes own their own storage, transport, and CLI surface while conforming to core contracts only
- Add an explicit **"Classification vs. Support Status"** statement: the core/adapter/mixed module classification is an **internal architectural boundary** that governs which modules may import which within this repository. It is **not** an external API guarantee — being classified as "core" does not mean a module's exports are stable or supported for direct import by external runtimes. External runtimes should depend only on the documented contract surfaces (rendered artifacts like `state-machine.json`), not on internal module APIs, regardless of their classification
- Define **adapter contract categories** that core exposes for adapters to implement, classified by requirement level:
  - **Deferred-required** (every runtime will eventually need to implement, but canonical contract is not yet fully defined):
    - **Persistence**: reading/writing run-state JSON. The current `RunState` type contains both core-contract fields (phase, history, agents, status) and local-adapter-specific fields (`repo_path`, `worktree_path`, `last_summary_path`). The field-level split between core and local-adapter fields is deferred entirely to a separate follow-up proposal (not this change). Until that split is defined, persistence is recognized as a required adapter seam but external runtimes cannot reliably determine which fields they must persist
    - **Review transport**: sending review requests and receiving review responses. The current local adapter uses subprocess-based codex invocation, but this is an implementation detail. The canonical review transport contract (request/response payload schema, lifecycle protocol) is deferred to a follow-up proposal. Until that proposal lands, review transport is documented as a recognized adapter seam without a stable external contract
  - **Local-runtime-only** (external runtimes use alternative mechanisms):
    - **Process lifecycle**: spawning and monitoring external tool processes (e.g., codex CLI, git commands)
    - **Path resolution**: resolving project-relative paths to absolute filesystem locations
    - **Directory layout**: OpenSpec directory traversal (`openspec/changes/*`, `openspec/specs/*`)
    - **CLI surface**: slash command names, argument parsing, and output formatting
  - Note: defining the formal TypeScript interfaces for these categories is explicitly out of scope — this proposal establishes the categories and their requirement levels only; interface definitions are deferred to a follow-up proposal
- Provide a dependency decision heuristic with concrete examples for borderline cases

## Capabilities

### New Capabilities

- `core-dependency-boundary`: Defines the canonical core surface (which modules are core), what core is allowed and forbidden to depend on, how known violations are tracked, adapter contract categories, and adapter responsibilities for local and external runtimes

### Modified Capabilities

- `repo-responsibility`: Extends the existing Repository Scope section with explicit core dependency rules, linking the boundary decision heuristic to the new dependency boundary definitions

## Impact

- `docs/architecture.md` gains a new "Core Dependency Boundary" section below the existing "Repository Scope" section
- No code changes — this proposal is documentation-only, establishing the boundary contract that future refactoring and enforcement proposals will reference
- Mixed modules (`review-ledger.ts`, `review-runtime.ts`, `contracts.ts`, `proposal-source.ts`) are documented as known violations with the expectation of follow-up refactoring
- External runtime authors gain a conceptual dependency boundary and adapter contract categories. **Supported external-runtime scope**: external runtimes may consume the state machine schema for phase transition logic. Full workflow execution (including persistence and review orchestration) is **not yet supported** for external runtimes until the persistence field split and review transport contract are defined
- This proposal amends the existing "Workflow Core Contract Surface" section in `docs/architecture.md` to distinguish between **target-state ownership** (what all runtimes will eventually implement, as described in the existing "Repository Scope") and **currently supported external-runtime contracts** (what external runtimes can reliably depend on today). The existing non-normative inventory label is preserved but annotated with support status per surface:
  - **State machine**: `state-machine.json` schema — **supported for external runtimes** (phase transitions, allowed events, terminal states)
  - **Persistence**: run-state JSON shape — **not yet supported for external runtimes**. The `RunState` type in `src/types/contracts.ts` is the normative source, but it currently mixes core-contract fields with local-adapter path fields. A separate follow-up proposal will split `RunState` into core and local-adapter field sets, after which persistence will become a supported external-runtime contract
  - **Review transport**: review request/response protocol — **not yet supported for external runtimes**. Currently embedded in the local adapter's subprocess protocol. The canonical contract is deferred to a follow-up proposal. The existing "Repository Scope" statement that all runtimes implement review orchestration describes the target state, not the current supported scope
  - Formal TypeScript adapter interfaces are deferred to a follow-up proposal
- Formal adapter interfaces and automated enforcement (lint rules, import restrictions) are explicitly deferred to follow-up proposals
