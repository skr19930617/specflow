# Contract-First Node Architecture

## Overview

The active runtime now has three layers:

1. `src/contracts/` — TypeScript source of truth for workflow, commands, prompts, orchestrators, templates, and installer assets
2. `src/build.ts` — generator that renders `global/`, `template/`, `dist/manifest.json`, `dist/contracts.json`, and `dist/install-plan.json`
3. `bin/*` + `dist/bin/*` — Node entrypoints for active CLIs

The previous Bash implementation is frozen under `legacy/v1/` for parity checks and archival reference only. Active build/runtime paths no longer read assets or wrappers from `legacy/v1/`.

## Workflow Truth

- The authoritative workflow definition is `src/contracts/workflow.ts`
- Build renders `global/workflow/state-machine.json`
- `specflow-run` consumes the rendered JSON at runtime
- OpenSpec specs under `openspec/specs/` are expected to match the rendered workflow and are verified by drift tests

## Generated Assets

- `global/commands/*.md` are generated entirely from TypeScript command contracts, including frontmatter, body sections, and run-state hooks
- `global/prompts/*.md`, `template/`, and `global/claude-settings.json` are rendered from repo-owned source assets under `assets/`
- `dist/manifest.json` and `dist/install-plan.json` are the machine-readable deployment contracts
- `dist/contracts.json` contains the contract bundle without `legacy/v1` source references

## Runtime Strategy

- Native Node implementations now back `specflow-run`, `specflow-install`, `specflow-fetch-issue`, `specflow-filter-diff`, `specflow-review-apply`, `specflow-review-design`, `specflow-design-artifacts`, `specflow-init`, `specflow-analyze`, and `specflow-create-sub-issues`
- Shared runtime libraries in `src/lib/` own subprocess execution, ledger mutations, diff parsing, prompt assembly, schema validation, and review result schemas
- Orchestrator contracts declare stdin/stdout/stderr schema ids, and runtime JSON payloads are validated before emission

## Installation

- `install.sh` remains a Bash bootstrap
- The bootstrap builds the repository and invokes `bin/specflow-install`
- `specflow-install` reads `dist/install-plan.json` and `dist/manifest.json` to decide what to copy, link, and merge
- No command list or install path inventory is hardcoded inside the installer logic
