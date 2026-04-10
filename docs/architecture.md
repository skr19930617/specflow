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

- **Workflow core** — the authoritative workflow definition and supporting logic that all runtimes must implement:
  - State machine definition (`src/lib/workflow-machine.ts` and rendered `state-machine.json`)
  - Run-state management (persisted run-state JSON lifecycle)
  - Review orchestration (proposal, design, and apply review protocols)
- **Bundled local reference implementation** — a complete, file-system-based execution environment shipped with this repository:
  - `specflow-*` CLI tools (specflow-run, specflow-analyze, specflow-review-proposal, etc.)
  - Slash command guides (generated from command contracts)
  - Templates and installer assets
  - This implementation is bundled but replaceable: any external runtime that conforms to the workflow core contract can substitute it

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

> **Non-normative inventory.** This section lists the contract surfaces that external runtimes must conform to. It is not the authoritative specification for any of these contracts. Normative contract specification, versioning, and change ownership are deferred to a separate follow-up proposal.

The workflow core contract comprises:

| Contract Surface | Current Source Location | Description |
|-----------------|----------------------|-------------|
| State machine schema | `src/lib/workflow-machine.ts` → `dist/.../state-machine.json` | Phase transitions, allowed events, and terminal states |
| Run-state JSON structure | `specflow-run` runtime | Persisted run-state shape including phase, history, agents, and metadata |
| Review protocol interface | `specflow-review-*` orchestrators | Review request/response schema, ledger structure, finding format |

**Excluded from core contract:** CLI entry-point contracts (command names, argument signatures, output format) are implementation details of the bundled local reference. External runtimes conform to the workflow core contract only — they are not required to replicate the CLI surface.
