# Contract-First Node Architecture

## Overview

The active runtime now has three layers:

1. `src/contracts/` — TypeScript source of truth for workflow, commands, prompts, orchestrators, templates, and installer assets
2. `src/build.ts` — generator that renders `dist/package/global/`, copies `template/` into `dist/package/template/`, and writes `dist/manifest.json`, `dist/contracts.json`, and `dist/install-plan.json`
3. `bin/*` + `dist/bin/*` — Node entrypoints for active CLIs

The previous Bash implementation is archived at git tag `legacy-v1-final`. Active build/runtime paths no longer read assets or wrappers from any in-tree legacy snapshot.

## Workflow Truth

- The authoritative workflow definition is the XState machine in `src/lib/workflow-machine.ts`
- `src/contracts/workflow.ts` adapts that machine into the workflow contract consumed by the rest of the build
- Build renders `dist/package/global/workflow/state-machine.json` and rewrites the bounded README workflow diagram block from the same source
- `specflow-run` consumes the rendered JSON at runtime
- OpenSpec specs under `openspec/specs/` are expected to match the rendered workflow and are verified by drift tests

## Generated Assets

- `dist/package/global/commands/*.md` are generated entirely from TypeScript command contracts, including frontmatter, body sections, and run-state hooks
- `dist/package/global/prompts/*.md` and `dist/package/global/claude-settings.json` are rendered from repo-owned source assets under `assets/`
- `dist/package/template/` is the packaged bootstrap template copied from `template/`
- `dist/manifest.json` and `dist/install-plan.json` are the machine-readable deployment contracts
- `dist/contracts.json` contains the contract bundle without archived legacy source references

## Runtime Strategy

- Native Node implementations now back `specflow-run`, `specflow-install`, `specflow-fetch-issue`, `specflow-filter-diff`, `specflow-review-apply`, `specflow-review-design`, `specflow-review-proposal`, `specflow-design-artifacts`, `specflow-init`, `specflow-analyze`, and `specflow-create-sub-issues`
- Shared runtime libraries in `src/lib/` own subprocess execution, ledger mutations, diff parsing, prompt assembly, schema validation, and review result schemas
- Orchestrator contracts declare stdin/stdout/stderr schema ids, and runtime JSON payloads are validated before emission

## Installation

- `install.sh` remains a Bash bootstrap
- The primary install path is `npm install -g --force https://github.com/skr19930617/specflow/releases/latest/download/specflow-node.tgz`
- The release tarball ships prebuilt `bin/` and `dist/` artifacts, and `scripts/postinstall.mjs` invokes `dist/bin/specflow-install.js` automatically during global installs
- `install.sh` is now a thin wrapper over the same latest-release tarball flow
- `specflow-install` reads `dist/install-plan.json` and `dist/manifest.json` to decide what to copy, link, and merge
- No command list or install path inventory is hardcoded inside the installer logic

## Release Distribution

- `.github/workflows/release.yml` publishes a GitHub Release after successful `CI` runs on `main`
- The release job builds the distribution bundle, runs `npm pack`, renames the tarball to `specflow-node.tgz`, and uploads it as the stable latest asset
- README installation commands target `releases/latest/download/specflow-node.tgz`, so the install URL does not change across releases

## Repository Scope

### This repo owns

> **Target state vs. current support:** The ownership descriptions below reflect the target state — what all runtimes will eventually implement. Currently, only the state machine schema is supported for external runtimes. Full workflow execution (including persistence and review orchestration) is not yet supported for external runtimes until the persistence field split and review transport contract are defined. See the [Core Dependency Boundary](#core-dependency-boundary) section and the [Dependency Decision Heuristic](#dependency-decision-heuristic) for the dependency placement rules that govern borderline components.

- **Workflow core** — the authoritative workflow definition and supporting logic that all runtimes must implement:
  - State machine definition (`src/lib/workflow-machine.ts` and rendered `state-machine.json`)
  - Run-state management (persisted run-state JSON lifecycle)
  - Review orchestration (proposal, design, and apply review protocols)
- **Bundled local reference implementation** — the **canonical reference implementation** of the workflow core contract: a complete, file-system-based execution environment shipped with this repository.
  - **Constituent adapters and surfaces:**
    - `specflow-*` CLI tools (specflow-run, specflow-analyze, specflow-review-proposal, etc.)
    - Slash command guides (generated from command contracts)
    - Templates and installer assets
  - **Framing properties** (these three properties together define what "reference implementation" means in this repo and are the testable acceptance criteria for any docs that re-state this positioning):
    1. **Conformance target.** The bundled local mode is the canonical conformance target for the workflow core contract. Any other runtime claiming to implement the contract is expected to behave the same as this implementation for the contract surfaces it covers.
    2. **Replaceability.** The bundled local mode is replaceable. Any external runtime (e.g., a DB-backed runtime, a server-backed runtime) that conforms to the workflow core contract can substitute it without changes to the core.
    3. **Contract mapping.** Each bundled adapter maps to a specific workflow core contract surface:

       | Bundled adapter | Source location | Workflow core contract surface implemented |
       |-----------------|-----------------|---------------------------------------------|
       | CLI entrypoints | `src/bin/specflow-*.ts` | Bundled-adapter surface only — exposes the workflow core (state machine schema and run-state JSON structure) to the local execution environment via `specflow-run` and related entrypoints. The CLI surface itself is not a core contract surface (consistent with the "Excluded from core contract" listing in the inventory below). |
       | File-backed RunStore | `.specflow/runs/<run_id>/run.json` (file layout) backed by `src/lib/fs.ts`, `src/lib/paths.ts` | Persistence of the run-state JSON structure. The persistence mechanism (filesystem layout, atomic write semantics) is bundled-adapter surface; the run-state JSON shape itself is core contract surface. |
       | Git-backed ArtifactStore | `openspec/changes/<CHANGE_ID>/` artifacts backed by `src/lib/git.ts` | Persistence and review-orchestration interaction for change artifacts (proposal, design, tasks, specs deltas). Bundled-adapter surface — the review protocol payloads exchanged with reviewers are core contract surface; the on-disk + git layout is not. |

### This repo does not own

- **DB-backed runtime** — persistence layers using PostgreSQL or other databases for run-state, ledger, or artifact storage
- **Server PoC** — HTTP API server implementations that expose specflow workflows over the network
- **External runtime adapters** — third-party integrations or alternative execution environments beyond the bundled local implementation

### Boundary Decision Rules

Use the following heuristic to classify borderline components:

> If the component is **runtime-agnostic** (works regardless of storage or transport backend), it belongs in this repo. If it **requires a specific storage or transport backend**, it belongs in the external runtime repo.

**Examples:**

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Shared interface definitions (state machine schema, review protocol types) | **Belongs here** | Runtime-agnostic contract definitions that all implementations must conform to |
| DB migration scripts (PostgreSQL schema, seed data) | **Does not belong** | Specific to the DB-backed runtime's storage backend |
| Contract conformance test suite | **Belongs here** | Validates that any runtime (local or external) correctly implements the workflow core contract |
| Runtime-selection glue (e.g., adapter registry, backend discovery) | **Does not belong** | Ties the system to a specific deployment topology beyond the local reference |
| OpenSpec schema definitions and validation rules | **Belongs here** | Runtime-agnostic specification infrastructure |

### Workflow Core Contract Surface (Inventory)

> **Non-normative inventory.** This section lists the contract surfaces that external runtimes must conform to. It is not the authoritative specification for any of these contracts. Normative contract specification, versioning, and change ownership are deferred to a separate follow-up proposal. Until that proposal lands, the source-location column points to the current normative source where one is identified, while implementation-specific details are called out separately in the support notes.

The workflow core contract comprises:

| Contract Surface | Current Source Location | Description | External Runtime Support |
|-----------------|----------------------|-------------|--------------------------|
| State machine schema | `src/lib/workflow-machine.ts` → `dist/.../state-machine.json` | Phase transitions, allowed events, and terminal states | **Supported** |
| Run-state JSON structure | `src/types/contracts.ts` (`RunState`) | Persisted run-state shape including phase, history, agents, and metadata | **Not yet supported** — `RunState` mixes core and local-adapter fields; field-level split deferred. `specflow-run` remains the current local implementation of this contract surface. |
| Review protocol interface | `specflow-review-*` orchestrators | Review request/response schema, ledger structure, finding format | **Not yet supported** — canonical transport contract deferred |

**Excluded from core contract (bundled-adapter surface):** The following are implementation details of the bundled local reference, not part of the workflow core contract surface. External runtimes conform to the workflow core contract only — they are not required to replicate any of these adapter surfaces.

- **CLI entrypoints** (`src/bin/specflow-*.ts`) — command names, argument signatures, exit codes, and output format. Bundled-adapter surface, **not** core contract surface.
- **File-backed RunStore** (`.specflow/runs/<run_id>/run.json` file layout, atomic-write semantics, on-disk persistence backed by `src/lib/fs.ts`) — the persistence *mechanism* is bundled-adapter surface; the run-state JSON *shape* is core contract surface and lives in the row above.
- **Git-backed ArtifactStore** (`openspec/changes/<CHANGE_ID>/` directory layout, file naming, and git-history coupling backed by `src/lib/git.ts`) — the *storage* of change artifacts is bundled-adapter surface, **not** core contract surface. The review protocol payloads exchanged between core and reviewers remain core contract surface, separately listed above.

## Actor / Surface Model

The actor/surface abstraction model defines who interacts with the workflow (actors) and through which interface (surfaces). This is a horizontal cross-cutting concern that complements the core/adapter dependency boundary defined below.

The canonical specification is `openspec/specs/actor-surface-model/spec.md`.
Normative actor taxonomy, surface taxonomy, capability matrix, clarify
constraints, gated decision semantics, delegation rules, and surface-neutral
governing rules live in that spec; this section provides architectural context
only.

### Actor Taxonomy

The system recognizes three actor kinds:

| Actor Kind | Description | Gated Decisions |
|------------|-------------|-----------------|
| `human` | Human operator | Full access: propose, clarify, approve, reject, review, advance |
| `ai-agent` | AI agent (e.g., Claude, Codex) | Propose, clarify, review, non-gated advance; approve only with delegation; cannot reject |
| `automation` | CI/cron/webhook triggers | Propose, non-gated advance only; no interactive or gated operations |

Each actor instance is identified by both `actor` (kind) and `actor_id` (stable identity). The value `unknown` is a backward-compatibility sentinel for legacy history entries — it is not a member of the taxonomy.

### Surface Taxonomy

Surfaces mediate between actors and the workflow. Representative surfaces include `local-cli`, `remote-api`, `agent-native`, and `batch`. The governing rule: **actor determines permissions, surface determines presentation**. Surfaces never alter workflow semantics.

### Relationship to Core/Adapter Boundary

The actor/surface model and the core/adapter dependency boundary serve different purposes:

- **Core/adapter boundary** (below): governs module-level import rules based on deployment topology (runtime-agnostic vs. backend-specific)
- **Actor/surface model**: governs workflow-level permission and identity rules based on who initiates operations and through which interface

Both boundaries reinforce the same principle: core workflow logic is independent of external concerns. Core modules must not depend on actor-specific or surface-specific logic, just as they must not depend on adapter-specific I/O.

Slash commands are classified as **surface-layer constructs**. They belong to the adapter layer and map to core workflow events — the core state machine does not reference slash command names.

### Compatibility with agent-context-template

The existing surface separation in `openspec/specs/agent-context-template/spec.md` (surface-neutral core profile schema vs. surface-specific adapters like the Claude.md renderer) is encompassed by this model. The agent-context-template spec's surface adapter pattern is a valid instance of the surface taxonomy. No change to the agent-context-template spec is required; future term unification is deferred to a separate proposal.

## Core Dependency Boundary

This section defines the internal module classification and dependency rules for workflow core. These rules govern which modules may import which within this repository. They are an **internal architectural boundary**, not an external API guarantee — see [Classification vs. Support Status](#classification-vs-support-status) below.

### Module Inventory

Every module in `src/lib/` is classified as exactly one of **core**, **adapter**, or **mixed** (a known violation). This inventory is **authoritative**.

| Module | Classification | Description |
|--------|---------------|-------------|
| `workflow-machine.ts` | Core | XState state machine definition |
| `schemas.ts` | Core | JSON schema validation logic |
| `json.ts` | Core | Pure JSON parsing utilities |
| `git.ts` | Adapter | Git CLI wrapper |
| `fs.ts` | Adapter | Filesystem operations (ensureDir, writeText, copyPath) |
| `paths.ts` | Adapter | Repository-relative path resolution |
| `process.ts` | Adapter | Command execution and process control |
| `glob.ts` | Adapter | Glob pattern matching |
| `template-files.ts` | Adapter | Template file operations |
| `project-gitignore.ts` | Adapter | Project .gitignore management |
| `review-ledger.ts` | Mixed | Ledger state machine logic + file I/O |
| `review-runtime.ts` | Mixed | Review orchestration + subprocess/FS coupling |
| `contracts.ts` | Mixed | Contract validation + filesystem access |
| `proposal-source.ts` | Mixed | Proposal source processing + filesystem access |

### Core Allowed Dependencies

Core modules may import **only** the following (exhaustive allowlist):

- **Other core modules** within `src/lib/`
- **Core-adjacent modules**: `src/types/contracts.ts` — this module contains type definitions and runtime const objects (e.g., `AssetType`) with no Node.js or adapter imports. Both value and type imports from this module are allowed in core. Note: some types in this module (e.g., `RunState`) currently mix core-contract and local-adapter concerns — these are treated as transitional. The field-level split is deferred to a separate follow-up proposal.
- **ECMAScript globals and built-in objects**: `JSON`, `Map`, `Set`, `Array`, `Promise`, `Error`, `RegExp`, `Date`, `URL`, `TextEncoder`/`TextDecoder`, `structuredClone`, etc.
- **Third-party allowlist** (complete): `xstate` — no other third-party packages are permitted in core without updating this list

**Type-only imports** follow the same source restrictions as value imports. Type-only imports from adapter modules, `src/bin/*`, `src/contracts/*`, or DB-specific packages are forbidden — they would leak adapter semantics into core's type surface.

`src/contracts/` modules (which contain build-time asset definitions and may import filesystem utilities) are **not** core-adjacent and remain outside the core boundary allowlist.

### Core Forbidden Dependencies

Core modules must **not** import any of the following:

- **All Node.js built-in modules**: `fs`, `path`, `os`, `child_process`, `net`, `http`, `crypto`, `stream`, `buffer`, `util`, `url` (including `node:` prefixed imports), and any other Node-specific APIs
- **`src/bin/*`** entry-point modules
- **Adapter or mixed modules** within `src/lib/`
- **Slash command surface** (command names, argument shapes)
- **DB vendor specifics** (SQL drivers, ORM imports)

### Boundary Status Model

This section describes the **target state**. Known violations in mixed modules are tracked in the [Known Boundary Violations](#known-boundary-violations) table below. Existing violations are expected until follow-up refactoring proposals land — they are not treated as present-day errors, but as transitional exceptions to be resolved.

**New boundary violations must not be introduced.** Any new module or import that violates the core dependency rules must be refactored before merging.

### Known Boundary Violations

| Module | Violation | Tracking Reference |
|--------|-----------|-------------------|
| `review-ledger.ts` | Imports `fs.ts` (atomicWriteText) and Node.js `fs`/`path` for file I/O | TBD — to be filed before next release |
| `review-runtime.ts` | Imports `fs.ts`, `git.ts`, `process.ts`, Node.js `fs`/`path`/`os` for subprocess and file operations | TBD — to be filed before next release |
| `contracts.ts` | Imports `paths.ts` and Node.js `node:fs` (`existsSync`, `readdirSync`, `statSync`) for contract validation against filesystem | TBD — to be filed before next release |
| `proposal-source.ts` | Imports Node.js `node:fs` (`readFileSync`) for reading proposal source files from disk | TBD — to be filed before next release |

Every tracking reference must use the exact `<repo>#<issue-number>` format when a follow-up issue exists, or `TBD — to be filed before next release` as a placeholder when the issue has not yet been created.

### Mixed-Module Interim Rules

Mixed modules are treated as **adapter-side code** for boundary enforcement purposes:

1. **Core must not import mixed modules** — new core modules may only import other core modules
2. **Adapter modules and `src/bin/*` may freely import mixed modules**
3. **External runtimes must not depend on mixed module APIs** — these are unsupported transitional code that will be refactored into separate core and adapter parts in follow-up proposals
4. **Mixed modules may import both core and adapter modules** — this is the violation being tracked, not a permission to extend

### Default Classification Rule

Any new module added to `src/lib/` is classified as **adapter** unless it satisfies the core dependency rules above and is explicitly added to the core list in the Module Inventory. This prevents accidental expansion of the core surface.

### Inventory Maintenance Rule

The Module Inventory in this document is the authoritative classification. Any PR that adds, removes, or renames a module in `src/lib/` must update the inventory as part of that PR. If the inventory does not list a module, it is treated as adapter by default. Drift between the inventory and the actual `src/lib/` contents is a documentation bug that should be fixed but does not block runtime behavior.

### Dependency Decision Heuristic

Use the following heuristic alongside the [Repository Scope](#repository-scope) ownership rules when deciding whether a dependency belongs in core or an adapter:

> If the dependency is **runtime-agnostic** (works regardless of storage, transport, or execution backend) and uses only allowlisted imports, it belongs in core. If it **requires a specific backend** (filesystem, subprocess, network, database), it belongs in an adapter.

**Borderline Examples:**

| Component | Decision | Rationale |
|-----------|----------|-----------|
| State machine transition validator | **Core** | Pure logic operating on schema data, no I/O |
| Review finding matcher (by ID/title) | **Core** | String comparison logic, no storage dependency |
| Ledger file writer (atomic write + backup) | **Adapter** | Requires `fs` for file operations |
| Review subprocess invoker (codex CLI) | **Adapter** | Requires `child_process` for subprocess control |
| Schema validation against manifest | **Depends** | If validation uses only in-memory data → core; if it reads files → adapter |

When the heuristic does not clearly resolve placement, refer to the Repository Scope ownership rules: if the component is runtime-agnostic and belongs to workflow core concerns, place it in core; if it requires a specific deployment topology or storage backend, place it in the adapter layer.

### Classification vs. Support Status

The core/adapter/mixed module classification is an **internal architectural boundary** that governs which modules may import which within this repository. It is **not** an external API guarantee. Being classified as "core" does not mean a module's exports are stable or supported for direct import by external runtimes.

External runtimes should depend only on the documented contract surfaces (rendered artifacts like `state-machine.json`), not on internal module APIs, regardless of their classification.

### Adapter Contract Categories

Adapter contract categories define the seams where core delegates to runtime-specific implementations:

**Deferred-required** (every runtime will eventually need to implement, but the canonical contract is not yet fully defined):

- **Persistence** — reading/writing run-state JSON. The current `RunState` type in `src/types/contracts.ts` contains both core-contract fields (`current_phase`, `history`, `agents`, `status`) and local-adapter-specific fields (`repo_path`, `worktree_path`, `last_summary_path`). The field-level split between core and local-adapter fields is deferred to a separate follow-up proposal. Until that split is defined, external runtimes cannot reliably determine which fields they must persist.
- **Review transport** — sending review requests and receiving review responses. The current local adapter uses subprocess-based codex invocation, but this is an implementation detail. The canonical review transport contract (request/response payload schema, lifecycle protocol) is deferred to a follow-up proposal. External runtimes must not depend on the current subprocess-based mechanism.

**Local-runtime-only** (external runtimes use alternative mechanisms):

- **Process lifecycle** — spawning and monitoring external tool processes (e.g., codex CLI, git commands)
- **Path resolution** — resolving project-relative paths to absolute filesystem locations
- **Directory layout** — OpenSpec directory traversal (`openspec/changes/*`, `openspec/specs/*`)
- **CLI surface** — slash command names, argument parsing, and output formatting

Formal TypeScript adapter interfaces and automated enforcement (lint rules, import restrictions) are deferred to follow-up proposals.

### Local Adapter Responsibility

The bundled local reference implementation owns:

- Git/FS access (`git.ts`, `fs.ts`, `paths.ts`)
- OpenSpec directory traversal
- CLI argument parsing (`src/bin/*`)
- Process orchestration (`process.ts`)
- File-based run-state persistence

### External Runtime Adapter Responsibility

External runtimes own their own storage, transport, and CLI surface while conforming to core contracts only. **Currently supported scope**: external runtimes may consume the state machine schema for phase transition logic. Full workflow execution (including persistence and review orchestration) is not yet supported until the persistence field split and review transport contract are defined in follow-up proposals.
