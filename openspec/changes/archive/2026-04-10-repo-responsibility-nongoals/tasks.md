## 1. Add "Repository Scope" section to docs/architecture.md

- [x] 1.1 Add "## Repository Scope" heading at the end of `docs/architecture.md`, after the existing "Release Distribution" section
- [x] 1.2 Add "### This repo owns" subsection listing workflow core (state machine definition, run-state management, review orchestration) and bundled local reference implementation (specflow-* CLI tools, slash command guides, templates), stating the local implementation is replaceable
- [x] 1.3 Add "### This repo does not own" subsection listing DB-backed runtime, server PoC, and external runtime adapters as out of scope

## 2. Add boundary decision rules

- [x] 2.1 Add "### Boundary Decision Rules" subsection with a decision heuristic (runtime-agnostic → this repo; backend-specific → external repo)
- [x] 2.2 Add at least three concrete examples: shared interface definitions (belongs), DB migration scripts (does not belong), contract conformance test suite (belongs)

## 3. Add workflow core contract surface inventory

- [x] 3.1 Add "### Workflow Core Contract Surface (Inventory)" subsection listing state machine schema, run-state JSON structure, and review protocol interface
- [x] 3.2 Explicitly exclude CLI entry-point contracts from the inventory with rationale
- [x] 3.3 Add non-normative disclaimer stating this is an inventory only, and that normative specification, versioning, and change ownership are deferred to a follow-up proposal

## 4. Verify

- [x] 4.1 Verify all existing sections of `docs/architecture.md` remain unmodified
- [x] 4.2 Verify the new section satisfies all 7 spec requirements and their scenarios
