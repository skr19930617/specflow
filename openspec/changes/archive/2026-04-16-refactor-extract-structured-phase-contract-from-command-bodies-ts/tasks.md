## 1. Define PhaseContract types and sub-types ✓

> Create the canonical PhaseContract type, sub-types, and PhaseContractRegistry interface in src/contracts/phase-contract.ts

- [x] 1.1 Define ArtifactRef, CliStep, AgentTaskSpec, GatedDecisionSpec, and PhaseNextAction sub-types
- [x] 1.2 Define the unified PhaseContract interface merging routing and execution fields
- [x] 1.3 Define PhaseContractRegistry interface with get() and phases() methods
- [x] 1.4 Implement createPhaseContractRegistry factory function
- [x] 1.5 Add unit tests verifying type shape, registry construction, and frozen readonly semantics

## 2. Populate PhaseContract registry for all 18 phases ✓

> Build the production PhaseContractRegistry with a PhaseContract entry for every workflow state, extracting structured data from command-bodies.ts

> Depends on: phase-contract-types

- [x] 2.1 Audit command-bodies.ts to identify structurable fields (CLI commands, artifact refs, gates) per phase
- [x] 2.2 Extract routing fields from existing phase-router test fixtures for each phase
- [x] 2.3 Define PhaseContract entries for all 18 workflow phases as const data
- [x] 2.4 Wire entries into createPhaseContractRegistry and export the production registry
- [x] 2.5 Add cross-check test asserting registry.phases() matches workflowStates from workflow-machine.ts

## 3. Implement PhaseContract to Markdown renderer ✓

> Create renderPhaseMarkdown pure function that generates Markdown from structured PhaseContract fields

> Depends on: phase-contract-types

- [x] 3.1 Implement renderPhaseMarkdown function rendering CLI commands as fenced code blocks
- [x] 3.2 Render artifact refs as bullet lists grouped by input/output role
- [x] 3.3 Render gated decisions as option blocks with advance events
- [x] 3.4 Render agent task specs as structured sections
- [x] 3.5 Add semantic comparison tests validating output against current command-bodies.ts structured sections

## 4. Migrate phase-router imports to canonical module ✓

> Update all phase-router files to import PhaseContract from src/contracts/phase-contract.ts and add execution field validation

> Depends on: phase-contract-types

- [x] 4.1 Convert phase-router/types.ts to re-export PhaseContract, PhaseContractRegistry, PhaseNextAction from src/contracts/phase-contract.ts
- [x] 4.2 Remove local PhaseContract type definition from phase-router/types.ts
- [x] 4.3 Update import paths in router.ts and other phase-router modules
- [x] 4.4 Add requiredInputs/producedOutputs presence validation in assertConsistent method
- [x] 4.5 Update phase-router/index.ts re-exports
- [x] 4.6 Verify all existing phase-router tests pass without modification

## 5. Refactor command-bodies.ts to use registry and renderer ✓

> Replace structurable sections in command-bodies.ts with PhaseContract registry lookups and renderPhaseMarkdown calls while preserving prose templates

> Depends on: phase-contract-registry, phase-markdown-renderer

- [x] 5.1 Import PhaseContract registry and renderPhaseMarkdown into command-bodies.ts
- [x] 5.2 Replace structurable sections with registry lookup + renderer calls for each applicable phase
- [x] 5.3 Preserve prose template strings for non-structurable content
- [x] 5.4 Add semantic equivalence tests comparing pre-refactor and post-refactor generated guides
- [x] 5.5 Run full build pipeline to verify slash-command guide generation is unchanged
