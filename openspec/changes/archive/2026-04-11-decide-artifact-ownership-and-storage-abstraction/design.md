## Context

Artifact I/O is currently performed via direct filesystem calls scattered across bins and lib modules. Every caller independently constructs paths like `resolve(root, "openspec/changes", changeId, "proposal.md")`. The `core-dependency-boundary` change identified `review-ledger.ts`, `review-runtime.ts`, and `contracts.ts` as mixed modules — core logic coupled to adapter-level I/O.

Current state:
- `src/lib/fs.ts` provides `readText`, `writeText`, `atomicWriteText` as thin wrappers around Node.js `fs`
- `src/lib/review-ledger.ts` has its own `LedgerConfig` pattern with `readLedger`/`backupAndWriteLedger` — the only module with parameterized artifact I/O
- `src/lib/review-runtime.ts` constructs `changeDir` paths inline and reads design artifacts via `readDesignArtifacts(changeDir)`
- `src/bin/specflow-run.ts` duplicates `atomicWriteText` logic locally and constructs run paths via local helpers `runsDir(root)`, `runDir(root, id)`, `runFile(root, id)`
- `src/lib/paths.ts` only provides build-time helpers (`fromRepo`, `fromDistribution`) — no runtime artifact resolution

## Goals / Non-Goals

**Goals:**
- Define `ChangeArtifactStore` and `RunArtifactStore` interfaces that core modules depend on
- Implement `LocalFsChangeArtifactStore` and `LocalFsRunArtifactStore` adapters preserving the existing directory layout
- Consolidate all artifact path resolution into the adapter layer
- Integrate review ledger I/O (including backup semantics) and run state I/O into the store interfaces
- Define an artifact-phase gate matrix that codifies current implicit artifact requirements
- Define the canonical artifact type registry as closed enums
- Document the canonical artifact table with storage domain, ownership, lifecycle, and adapter-specific layout boundaries

**Non-Goals:**
- Implementing non-filesystem adapters (remote storage, database) — this change defines the interface; adapters are future work
- Changing the existing directory layout (`openspec/changes/<id>/`, `.specflow/runs/`)
- Migrating existing changes or runs — backward compatibility is preserved
- Refactoring pure-logic modules that don't do artifact I/O (e.g., `workflow-machine.ts`, `schemas.ts`)
- Adding concurrency support — single-writer assumption is preserved

## Decisions

### D1: Two separate store interfaces, not one polymorphic store

Change artifacts and run artifacts have different lifecycles, durability, and semantics (backup for ledgers, gitignored for runs). A single `ArtifactStore<Domain>` generic would force callers to handle both domains and complicate the type signatures.

**Decision**: Define `ChangeArtifactStore` and `RunArtifactStore` as independent interfaces. Bins receive the store they need via constructor/factory parameter.

**Alternative considered**: Single `ArtifactStore` with domain discriminator — rejected because it conflates durable and ephemeral concerns, exactly the problem the proposal review flagged (P1).

### D2: Artifact types use closed unions plus runtime validation

The canonical model uses TypeScript union types for compile-time exhaustiveness, but adapters also need runtime guards because artifact types and JSON payloads cross filesystem and CLI boundaries. Shared validators may live in a helper module, but enforcement happens inside the adapter boundary on every read/write path so callers cannot bypass it. `LocalFs*` adapters reject unknown artifact types with `UnknownArtifactTypeError` before path resolution, and they validate `review-ledger` and `run-state` JSON against their schemas on read and write.

```
ChangeArtifactType = "proposal" | "design" | "tasks" | "spec-delta" | "review-ledger" | "current-phase" | "approval-summary"
RunArtifactType = "run-state"
```

**Alternative considered**: Compile-time-only unions with no runtime validation — rejected because persisted artifacts can be malformed or introduced through untyped inputs, so the adapter boundary must enforce the invariant with typed errors.

### D3: `*ArtifactRef` is only for concrete artifact identities

Instead of passing `(changeId, artifactType, qualifier?)` as separate parameters for already-identified artifacts, define domain-specific concrete refs:

```
ChangeArtifactRef =
  | { changeId, type: "proposal" | "design" | "tasks" | "current-phase" | "approval-summary" }
  | { changeId, type: "spec-delta", qualifier: string }
  | { changeId, type: "review-ledger", qualifier: "proposal" | "design" | "apply" }

RunArtifactRef = { runId, type: "run-state" }
```

This ensures qualified types always carry a qualifier and singleton types never accept one — enforced at compile time for concrete artifact identities.

Contexts that do not have a concrete identity yet use separate non-ref types:

```
ChangeArtifactQuery = { changeId, type: ChangeArtifactType }
RunArtifactQuery = { changeId?: string } // metadata filter over discovered run-state documents, not an identity

ArtifactRequirement =
  | { domain: "change", type: "proposal" | "design" | "tasks" | "current-phase" | "approval-summary" }
  | { domain: "change", type: "spec-delta", qualifierFrom: "specName" }
  | { domain: "change", type: "review-ledger", qualifier: "proposal" | "design" | "apply" }
  | { domain: "run", type: "run-state" }
```

`ChangeArtifactStore.list` takes `ChangeArtifactQuery` and returns concrete `ChangeArtifactRef[]`. `RunArtifactStore.list` takes `RunArtifactQuery` and returns concrete `RunArtifactRef[]`. The gate matrix stores `ArtifactRequirement` templates and resolves them against runtime `changeId`, `runId`, and any qualifier-bearing context before checking existence or reporting missing artifacts.

Queries and requirements are descriptors, not identities. They intentionally omit runtime values they cannot know yet. `ChangeArtifactQuery` also intentionally omits qualifiers for qualified artifact types so `list` can enumerate all matching artifacts of that type within a change before any specific qualifier has been selected. In particular, `RunArtifactQuery` filters `run-state` artifacts by embedded metadata such as `changeId`; only the resulting `RunArtifactRef` carries the concrete `(runId, type)` identity.

**Alternative considered**: Reusing `*ArtifactRef` for list inputs and static gate declarations — rejected because those contexts do not yet have a concrete qualifier or runtime identity.

### D4: Backup semantics are part of the ChangeArtifactStore contract, not adapter-specific

The current `backupAndWriteLedger` backup-before-overwrite behavior is a core requirement for review ledgers (not just a filesystem convenience). The `ChangeArtifactStore.write` method for `review-ledger` refs MUST create a backup of existing content before writing.

The backup guarantee is unconditional for ledger overwrites: callers invoke `write(ref, content)` and the store is responsible for preserving the prior version before replacing existing `review-ledger` content. The store contract does not expose a backup option or opt-out flag. Any cleanliness check that still matters for higher-level review behavior stays outside the store contract and cannot disable the backup.

**Alternative considered**: Caller-controlled backup flags such as `backupIfClean` — rejected because the proposal requires every overwrite of an existing review ledger to create a backup.

### D5: Gate matrix is a static descriptor table, not a table of concrete refs

The artifact-phase gate matrix is defined as a readonly map from `(fromPhase, event)` to `{ required: ArtifactRequirement[], produced: ArtifactRequirement[] }`. The static table stores only descriptor templates; it never embeds runtime `changeId` or `runId` values. The `specflow-run advance` command resolves these descriptors against the active `changeId`, `runId`, and any transition-specific qualifiers, then checks required artifacts via the stores before allowing the transition.

The matrix is derived from the existing ad-hoc checks in current bins and codified as a single constant. It does not introduce new restrictions.

**Decision**: Store the gate matrix in `src/lib/artifact-phase-gates.ts` as a typed constant. `specflow-run advance` imports and evaluates it.

### D6: Adapter construction uses a factory function, not DI container

Bins create store instances via a factory: `createLocalFsChangeArtifactStore(projectRoot)` and `createLocalFsRunArtifactStore(projectRoot)`. No dependency injection framework — the factory is a plain function that captures `projectRoot`.

**Alternative considered**: Proper DI container (tsyringe, inversify) — rejected as over-engineering for the current project scope. The factory is sufficient and easier to understand.

### D7: Incremental migration via adapter wrapper

Existing modules (`review-ledger.ts`, `review-runtime.ts`, `specflow-run.ts`) are refactored incrementally:
1. First, implement the store interfaces and `LocalFs*` adapters
2. Then, update callers one module at a time to accept store instances
3. The `LedgerConfig` pattern in `review-ledger.ts` is replaced by `ChangeArtifactStore.write(reviewLedgerRef, ...)`
4. The duplicated `atomicWrite` in `specflow-run.ts` is removed — the adapter handles atomicity

No big-bang migration. Each module can be updated independently.

### D8: Ownership and lifecycle table as documentation, not runtime enforcement

The canonical model includes a table in the artifact-ownership-model spec enumerating every artifact type with its storage domain, ownership, lifecycle, and qualifier semantics. The table explicitly records creator/reader/updater ownership notes for each artifact type so the spec satisfies the proposal's documentation requirement without introducing runtime ownership checks. Artifact ownership is documented in the spec but not enforced at runtime. The store interfaces are the enforcement boundary — callers can only use operations the interface exposes. Fine-grained ownership (e.g., "only review-runtime may write current-phase") would require a capability-based system that is not warranted at this scale.

### D9: Local filesystem layout is documented as an adapter concern

The local filesystem layout (`openspec/changes/<id>/`, `.specflow/runs/`) is documented in a separate adapter-specific section alongside `LocalFsChangeArtifactStore` and `LocalFsRunArtifactStore` as the reference adapter mapping, not as part of the core store contracts or gate matrix. Core modules speak in terms of artifact types, refs, queries, and requirements; only adapters speak in terms of paths.

**Alternative considered**: Embedding filesystem path rules directly into the canonical store contract — rejected because it would preserve the current coupling between core logic and the local adapter layout.

## Risks / Trade-offs

**[Interface over-abstraction for a single adapter]** The project currently has only one storage backend (local FS). The interface adds indirection without immediate multi-backend benefit.
→ **Mitigation**: The interface enables testing with in-memory stubs and cleanly separates concerns. The overhead is minimal — two interfaces, two adapters, one factory function.

**[Gate matrix may drift from actual workflow]** If new phases are added to the workflow machine without updating the gate matrix, artifact checks could be incomplete.
→ **Mitigation**: The gate matrix keys against the workflow machine's state/event pairs. A build-time or test-time check can verify completeness by comparing gate matrix keys against the state machine definition.

**[Incremental migration leaves temporary mixed state]** During migration, some modules will use the store interface while others still use direct I/O.
→ **Mitigation**: Migration order is defined in tasks. Each module is a self-contained unit. The adapter delegates to the same `atomicWriteText` primitive, so behavior is identical during the transition.

**[Backup semantics in interface may over-constrain future adapters]** Remote storage backends may have native versioning that makes explicit backup files unnecessary.
→ **Mitigation**: The interface contract says "preserve the previous ledger version before overwrite" — an adapter with native versioning can satisfy this via its versioning mechanism. The contract is intent-based, not implementation-specific.
