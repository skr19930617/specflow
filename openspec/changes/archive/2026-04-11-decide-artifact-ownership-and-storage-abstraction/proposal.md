## Why

Artifact I/O is currently scattered across every bin and lib module with no abstraction boundary. Each caller independently constructs paths like `resolve(root, "openspec/changes", changeId, "proposal.md")`, and the core logic is tightly coupled to the local filesystem layout. The `core-dependency-boundary` change already identified this as a known violation — mixed modules (`review-ledger.ts`, `review-runtime.ts`, `contracts.ts`) contain core logic but import adapter-level I/O. Defining the artifact ownership model and storage abstraction boundary is a prerequisite for cleanly separating core from adapter concerns and enabling future external runtimes.

Source: https://github.com/skr19930617/specflow/issues/93

## What Changes

- Define a canonical artifact model with two explicit storage domains:
  - **Change artifacts** (durable, committed): proposal, design, tasks, spec deltas, review ledgers, current-phase, approval-summary — live under `openspec/changes/<id>/`, portable across runtimes
  - **Run artifacts** (ephemeral, gitignored): run state (`run.json`, which includes the embedded history array) — live under `.specflow/runs/`, local-only lifecycle, not portable. Run history is a field within the run-state document, not a separate artifact
- Introduce an `ArtifactStore` interface as the abstraction boundary with domain-specific semantics:
  - `ChangeArtifactStore`: read/write/list/exists for durable change artifacts, with atomic write guarantee and backup-before-overwrite for ledgers
  - `RunArtifactStore`: read/write/list/exists for ephemeral run state, with atomic write guarantee but no backup requirement
  - Core modules depend on these interfaces, never on filesystem paths or I/O primitives directly
- Provide `LocalFsChangeArtifactStore` and `LocalFsRunArtifactStore` adapters as the default implementations, backed by the existing directory layout
- Formalize the artifact-phase gate matrix:
  - Each phase transition declares its required input artifacts and produced output artifacts
  - Transition failure behavior: if a required artifact is missing, the transition fails with a typed error identifying the missing artifact — no silent fallback
  - Existing changes/runs created before this change must remain valid; the gate matrix preserves current implicit behavior, not intentionally change it
- Define backend-agnostic invariants that any adapter must satisfy:
  - **Artifact identity**: two domain-specific composite keys:
    - **Change-domain**: `(changeId, artifactType, qualifier?)` — uniquely addresses every change artifact:
      - Singleton artifacts (no qualifier): `proposal`, `design`, `tasks`, `current-phase`, `approval-summary` — e.g., `(my-change, proposal)`
      - Qualified artifacts: `spec-delta` requires a spec name qualifier — e.g., `(my-change, spec-delta, run-identity-model)`; `review-ledger` requires a review kind qualifier — e.g., `(my-change, review-ledger, proposal)`, `(my-change, review-ledger, design)`, `(my-change, review-ledger, apply)`
    - **Run-domain**: `(runId, artifactType)` — uniquely addresses every run artifact:
      - `run-state` is the sole run-domain artifact type — one document per run, containing state, metadata, and embedded history
  - **Enumerated artifact types**: the set of valid `artifactType` values is a closed enum defined in the canonical model; adapters must reject unknown types
  - **Payload expectations**: markdown artifacts are UTF-8 text; ledgers and run state are JSON validated against their respective schemas
  - **Atomic update**: all writes must be atomic (write-then-rename or equivalent) — no partial reads
  - **No concurrency guarantee**: single-writer assumed; adapters are not required to handle concurrent writes
- Establish that the local filesystem layout (`openspec/changes/<id>/`, `.specflow/runs/`) is an adapter concern, not a core contract

## Capabilities

### New Capabilities
- `artifact-ownership-model`: Defines the canonical artifact type registry with two storage domains (change vs run), `ChangeArtifactStore` and `RunArtifactStore` interface contracts, ownership rules (which module creates/reads/updates each artifact), backend-agnostic invariants (identity, payload, atomicity, concurrency model), `LocalFs*` adapters as reference implementations, and the artifact-phase gate matrix

### Modified Capabilities
- `workflow-run-state`: Phase transitions currently have implicit artifact requirements enforced ad-hoc in each bin; this change formalizes the artifact-phase relationship as an explicit gate matrix within the run state spec. Run state I/O moves behind the `RunArtifactStore` interface. Existing runs remain valid — the gate matrix codifies current behavior, not new restrictions

## Acceptance Criteria

1. All artifact types (proposal, design, tasks, spec deltas, review ledgers, current-phase, approval-summary, run state) are enumerated in the canonical model with their storage domain, ownership, and lifecycle
2. `ChangeArtifactStore` and `RunArtifactStore` interfaces are defined with read/write/list/exists operations
3. Backend-agnostic invariants are specified: change-domain identity key `(changeId, artifactType, qualifier?)` and run-domain identity key `(runId, artifactType)` uniquely address every artifact, closed artifact type enum per domain, payload expectations, atomic update, and concurrency model
4. `LocalFsChangeArtifactStore` and `LocalFsRunArtifactStore` adapters implement the interfaces using the existing directory layout
5. The artifact-phase gate matrix is defined — each phase transition lists required and produced artifacts
6. Transition failure on missing artifact returns a typed error (not silent fallback)
7. Existing changes and runs created before this change remain valid without migration
8. Local filesystem layout is documented as adapter-specific, not core contract

## Impact

- `src/lib/` — new `ChangeArtifactStore` and `RunArtifactStore` interface modules and `LocalFs*` adapters; refactor of `review-runtime.ts`, `review-ledger.ts`, `run-identity.ts` to depend on the abstractions
- `src/bin/` — all bins that construct artifact paths (`specflow-run.ts`, `specflow-prepare-change.ts`, `specflow-review-design.ts`, etc.) receive store instances instead of constructing paths directly
- `src/lib/fs.ts` — low-level primitives (`readText`, `writeText`, `atomicWriteText`) remain but are internal to `LocalFs*` adapters
- `src/lib/paths.ts` — extended from build-time only to include runtime artifact path resolution as part of the local adapters
- No breaking changes to CLI interfaces or OpenSpec directory layout

