## Context

specflow's RunState (`src/types/contracts.ts:245-264`) is a monolithic interface — all fields live at the top level, making it impossible for server adapters to add custom fields without modifying the shared type. PhaseContract (`src/lib/phase-router/types.ts:33-50`) describes phase behavior (next_action, gated, terminal) but lacks structured input/output or gate condition descriptors, so phase gates cannot be verified programmatically. Change ID → Run ID resolution requires callers to manually call `findLatestRun` + filter by status.

This is Phase 1 of 3 for the deterministic server orchestrator (#127). Phase 2 (server adapter) and Phase 3 (orchestration loop) depend on the type foundations established here.

Constraints:
- `workflow-machine.ts` is not modified
- All new code is additive — no breaking changes to existing consumers
- PhaseContractRegistry is an interface (DI), not a pre-registered module; there is no central registry file yet (#129)

## Goals / Non-Goals

**Goals:**
- Separate RunState into `RunStateCoreFields` + generic `TAdapter` so adapters can extend it type-safely
- Extend PhaseContract with declarative `input`, `output`, and `gate_conditions` fields
- Provide `resolveRunId(store, changeId)` returning a Result type for Change ID → Run ID auto-resolution
- Maintain full backward compatibility — existing code compiles and tests pass without changes

**Non-Goals:**
- Runtime validation of PhaseContract input/output (deferred to Phase 2)
- Gate condition evaluation logic (deferred to Phase 2)
- Central PhaseContractRegistry module (#129 — separate change)
- Rewiring any CLI command or phase-router code path onto new types
- Modifying `workflow-machine.ts` or its state graph

## Concerns

### C1: RunState Core/Adapter Field Split
**Problem:** Server adapters (e.g., DB-backed store, HTTP session manager) need adapter-specific fields on RunState but cannot add them without modifying the shared `RunState` interface.

**Approach:** Extract all current RunState fields into a `RunStateCoreFields` interface. Define `RunState<TAdapter extends Record<string, unknown> = Record<string, never>>` as `RunStateCoreFields & TAdapter`. The default type parameter preserves backward compatibility — `RunState` (no explicit arg) equals `RunState<Record<string, never>>`, structurally identical to today's RunState.

### C2: PhaseContract Structured Extension
**Problem:** Phase contracts describe behavior flags (gated, terminal) but not what data flows in/out of a phase or what conditions must hold at a gate.

**Approach:** Add three optional fields to the existing PhaseContract interface: `input?: PhaseIODescriptor`, `output?: PhaseIODescriptor`, `gate_conditions?: readonly GateCondition[]`. All fields are optional so existing contract definitions remain valid.

### C3: resolveRunId Auto-Resolution
**Problem:** Callers must manually call `findLatestRun` then filter by status to locate the active run for a change.

**Approach:** Add `resolveRunId(store, changeId)` to `run-store-ops.ts` that encapsulates this logic and returns a `Result<string, ResolveRunIdError>`.

## State / Lifecycle

No new runtime state or lifecycle changes are introduced. All additions are type-level:

- `RunStateCoreFields` — compile-time interface, no runtime representation
- `RunState<TAdapter>` — generic type alias, erased at runtime; JSON serialization unchanged
- `PhaseIODescriptor` and `GateCondition` — compile-time type descriptors only in Phase 1
- `resolveRunId` reads existing run state via `RunArtifactStore` — no new persistence

The existing RunState lifecycle (created at `start`, mutated by `advance`, terminal at `approved`/`rejected`/`decomposed`) is unchanged.

## Contracts / Interfaces

### New Types in `src/types/contracts.ts`

```typescript
// Core fields extracted from current RunState
interface RunStateCoreFields {
  readonly run_id: string;
  readonly change_name: string | null;
  readonly current_phase: string;
  readonly status: RunStatus | string;
  readonly allowed_events: readonly string[];
  readonly source: SourceMetadata | null;
  readonly project_id: string;
  readonly repo_name: string;
  readonly repo_path: string;
  readonly branch_name: string;
  readonly worktree_path: string;
  readonly agents: RunAgents;
  readonly last_summary_path: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly history: readonly RunHistoryEntry[];
  readonly run_kind?: RunKind;
  readonly previous_run_id?: string | null;
}

// Generic RunState — backward compatible default
type RunState<TAdapter extends Record<string, unknown> = Record<string, never>> =
  RunStateCoreFields & TAdapter;
```

### Extended Fields in `src/lib/phase-router/types.ts`

```typescript
interface PhaseIODescriptor {
  readonly artifacts: readonly string[];
}

interface GateCondition {
  readonly kind: 'artifact_exists' | 'approval_required' | 'validation_passed';
  readonly target?: string;
}

// Existing PhaseContract gains optional fields:
interface PhaseContract {
  // ... existing fields unchanged ...
  readonly input?: PhaseIODescriptor;
  readonly output?: PhaseIODescriptor;
  readonly gate_conditions?: readonly GateCondition[];
}
```

### New Function in `src/lib/run-store-ops.ts`

```typescript
type ResolveRunIdErrorKind = 'no_active_run' | 'change_not_found' | 'multiple_active_runs';

interface ResolveRunIdError {
  readonly kind: ResolveRunIdErrorKind;
  readonly message: string;
}

function resolveRunId(
  store: RunArtifactStore,
  changeId: string
): Result<string, ResolveRunIdError>;
```

### Dependencies on Other Modules

| Consumer | Depends on | Nature |
|----------|-----------|--------|
| `run-store-ops.resolveRunId` | `RunArtifactStore`, `RunState` | Reads existing run state |
| `PhaseRouter` (unchanged) | `PhaseContract` (extended) | Optional fields; no code change needed |
| `core/advance.ts` | `RunState` | Uses `RunStateCoreFields` subset; no change |
| `core/types.ts` Result | `resolveRunId` return type | Same Result pattern already in use |

## Persistence / Ownership

No persistence changes. RunState JSON serialization is unchanged because:
- `RunStateCoreFields` is a subset extraction — same fields, same JSON
- `RunState<Record<string, never>>` intersected with empty record produces the same shape
- PhaseContract extensions are optional fields — omitting them produces identical JSON
- `GateCondition` and `PhaseIODescriptor` are data-only (no functions) and naturally serializable

Artifact ownership remains under `openspec/changes/<change_id>/`. Run state remains under `.specflow/runs/<run_id>/run.json`.

## Integration Points

### Phase 2 (Server Adapter) — Primary Consumer
- Server adapter will define a concrete `TAdapter` type (e.g., `{ sessionId: string; dbConnectionId: string }`) and use `RunState<ServerAdapterFields>`
- Server adapter will implement `GateCondition` evaluation functions that interpret declarative descriptors against run state
- PhaseContractRegistry (#129) will populate `input`, `output`, and `gate_conditions` from contract definitions

### Existing CLI Commands — No Change
- `specflow-run` reads/writes `RunState` via `RunArtifactStore`; JSON shape is unchanged
- `specflow-prepare-change` calls `findLatestRun`; may optionally adopt `resolveRunId` later
- No existing imports break because `RunState` default parameter matches current shape

### Test Infrastructure
- Existing conformance tests use `RunState` without type parameter — they continue to compile as `RunState<Record<string, never>>`
- New tests for `resolveRunId` use in-memory `RunArtifactStore` (same pattern as existing `run-store-ops` tests)

## Decisions

### D1: Generic intersection vs. wrapper object for adapter fields
**Decision:** `RunState<TAdapter> = RunStateCoreFields & TAdapter` (intersection)
**Alternative considered:** `RunState<TAdapter> = RunStateCoreFields & { adapter: TAdapter }` (nested object)
**Rationale:** Intersection keeps adapter fields at the top level, matching how existing code accesses RunState fields. A nested `adapter` object would require `state.adapter.sessionId` instead of `state.sessionId`, adding indirection without benefit. JSON serialization stays flat. TypeScript catches shadowing conflicts at compile time via intersection incompatibility.

### D2: Extend existing PhaseContract vs. create StructuredPhaseContract
**Decision:** Extend existing `PhaseContract` with optional fields
**Alternative considered:** New `StructuredPhaseContract` interface alongside existing
**Rationale:** A parallel type would require phase-router to handle two contract types or force a migration. Optional fields on the existing interface are backward compatible — existing code compiles without changes, and the phase-router naturally ignores fields it doesn't access.

### D3: Result type vs. throw for resolveRunId
**Decision:** Return `Result<string, ResolveRunIdError>` following the existing `CoreRuntimeError` pattern
**Alternative considered:** Throw typed exceptions (consistent with current `run-store-ops` functions that throw)
**Rationale:** The core runtime has established Result as the standard pattern for functions called from CLI wiring. `resolveRunId` fits this pattern since it may be invoked from CLI entry points. The existing `run-store-ops` functions (`readRunState`, etc.) throw because they are low-level helpers; `resolveRunId` is a higher-level operation that should return structured errors.

### D4: GateCondition as declarative descriptor vs. predicate function
**Decision:** Declarative descriptor `{ kind, target? }`
**Alternative considered:** Predicate function `(runState) => boolean`
**Rationale:** Declarative descriptors are serializable (can be stored in JSON contract definitions), inspectable (tooling can enumerate gate requirements), and testable (no function identity comparisons). Evaluation logic in Phase 2 can pattern-match on `kind`.

## Risks / Trade-offs

### R1: TypeScript generic complexity for downstream consumers
**Risk:** `RunState<TAdapter>` adds cognitive overhead for code that doesn't need adapter awareness.
**Mitigation:** Default parameter `Record<string, never>` means unparameterized `RunState` works identically to today. `RunStateCoreFields` is independently importable for code that wants to be explicit about core-only access.

### R2: Intersection shadowing not caught at the contract level
**Risk:** An adapter type that defines a field named `run_id: number` would create a `never` type at the intersection, producing confusing errors.
**Mitigation:** TypeScript reports type-level conflicts at the assignment site. Document the constraint that adapter field names must not collide with `RunStateCoreFields` keys. Phase 2 can add a compile-time utility type `AssertNoOverlap<TAdapter>` if needed.

### R3: PhaseContract optional fields may be silently omitted
**Risk:** When phase contracts are constructed manually (no registry yet), developers may forget to add `input`/`output`/`gate_conditions`.
**Mitigation:** This is acceptable in Phase 1 since gate evaluation is deferred. Phase 2 + the PhaseContractRegistry (#129) will enforce completeness through the registry builder API.

## Ordering / Dependency Notes

### Foundational (must be done first)
1. **RunStateCoreFields + RunState\<TAdapter\>** — all other changes reference these types
2. **PhaseIODescriptor + GateCondition types** — no dependency on RunState changes

### Independent (can be done in parallel after foundational types)
3. **PhaseContract extension** — adds optional fields using types from #2
4. **resolveRunId** — depends on RunState type from #1 and existing `run-store-ops` functions
5. **ResolveRunIdError types** — defined alongside `resolveRunId`

### Test layer (after implementation)
6. **RunState generic type tests** — compile-time assignability checks
7. **resolveRunId unit tests** — using in-memory RunArtifactStore
8. **Existing conformance test verification** — ensure no regressions

## Completion Conditions

| Concern | Done When | Reviewable Independently |
|---------|-----------|--------------------------|
| C1: RunState split | `RunStateCoreFields` exported; `RunState<TAdapter>` compiles with default and custom adapters; existing code compiles without changes | Yes — pure type change |
| C2: PhaseContract extension | `PhaseContract` has optional `input`, `output`, `gate_conditions` fields; existing phase-router tests pass without modification | Yes — additive optional fields |
| C3: resolveRunId | Function exported from `run-store-ops`; all 5 scenarios (active, suspended, no_active_run, change_not_found, multiple_active_runs) have passing tests | Yes — new function, no existing code modified |
| Overall | `npm run typecheck` passes; existing test suite passes; no `workflow-machine.ts` modifications | — |

## Open Questions

None — all ambiguities were resolved during proposal challenge/reclarify.
