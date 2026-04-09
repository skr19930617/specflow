# Contract-First Node Architecture

## Overview

The active runtime now has three layers:

1. `src/contracts/` — TypeScript source of truth for workflow, commands, prompts, orchestrators, templates, and installer assets
2. `src/build.ts` — generator that renders `global/`, `template/`, `dist/manifest.json`, `dist/contracts.json`, and `dist/install-plan.json`
3. `bin/*` + `dist/bin/*` — Node entrypoints for active CLIs

The previous Bash implementation is frozen under `legacy/v1/` for parity checks and controlled fallback during the migration.

## Workflow Truth

- The authoritative workflow definition is `src/contracts/workflow.ts`
- Build renders `global/workflow/state-machine.json`
- `specflow-run` consumes the rendered JSON at runtime
- OpenSpec specs under `openspec/specs/` are expected to match the rendered workflow and are verified by drift tests

## Generated Assets

- `global/commands/*.md` are generated from command contracts plus the frozen legacy markdown bodies
- `global/prompts/*.md` are copied from the frozen legacy snapshot during build
- `template/` and `global/claude-settings.json` are regenerated during build
- `dist/manifest.json` and `dist/install-plan.json` are the machine-readable deployment contracts

## Runtime Strategy

- `bin/specflow-run` and `bin/specflow-install` are native Node implementations
- Remaining `bin/*` entrypoints are Node commands that delegate to `legacy/v1/bin/*` while parity and replacement work continues
- This keeps the active surface Node-based while preserving behavior during the staged migration

## Installation

- `install.sh` remains a Bash bootstrap
- The bootstrap builds the repository and invokes `bin/specflow-install`
- `specflow-install` reads `dist/install-plan.json` and `dist/manifest.json` to decide what to copy, link, and merge
- No command list or install path inventory is hardcoded inside the installer logic
