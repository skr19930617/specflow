## Context

specflow's workflow engine currently has no shared event contract. The `phase-router` (landed in #132) emits gated surface events through a `SurfaceEventSink` interface, but the `SurfaceEvent` type in `src/lib/phase-router/types.ts` is a minimal placeholder (run_id, phase, event_kind, emitted_at) with a comment explicitly deferring to #100.

The server PoC is moving to a separate repo that needs to consume and produce workflow events. Without a canonical event contract, external runtimes would have to reverse-engineer the event shape from the phase-router's internals.

Existing codebase state:
- **No actor/surface types exist in code.** The `actor-surface-model` spec defines the taxonomy, but no TypeScript types have been implemented yet.
- **`src/contracts/`** contains the contract-driven distribution bundle (commands, prompts, orchestrators, workflow, templates).
- **`src/core/types.ts`** defines the `Result<T, E>` pattern and core runtime error contract.
- **`src/lib/phase-router/types.ts`** owns the placeholder `SurfaceEvent` and `SurfaceEventSink` interfaces.

## Goals / Non-Goals

**Goals:**
- Define canonical TypeScript types for the bidirectional surface event envelope.
- Define JSON Schema files for each concrete event type, suitable for language-agnostic consumers.
- Re-export actor and surface identity types so consumers use a single import path.
- Make JSON Schema files distributable via the existing `contract-driven-distribution` bundle.
- Replace the phase-router's placeholder `SurfaceEvent` with the canonical type.

**Non-Goals:**
- Implement transport bindings (HTTP webhooks, WebSocket adapters, message queues).
- Build an event bus or pub/sub infrastructure.
- Implement runtime validation middleware (consumers validate on their side).
- Rewire existing CLI commands to emit/consume events (deferred to follow-up).
- Generate TypeScript types from JSON Schema or vice versa at build time (manual sync for now; generation can be added later).

## Decisions

### D1: New `src/contracts/surface-events.ts` as the canonical module

Place all event envelope types in a new contract module `src/contracts/surface-events.ts`. This follows the established pattern where each contract domain has its own file under `src/contracts/`.

**Why not `src/lib/`?** Contract types are declaration-only (no runtime logic). The `src/contracts/` directory is already the canonical location for distributable contract definitions. Placing event types here aligns with `workflow.ts`, `commands.ts`, etc.

**Why not `src/types/`?** `src/types/` holds internal type infrastructure (e.g., `contracts.ts` for bundle types). Surface event types are a public contract surface, not internal plumbing.

### D2: Actor/surface identity types defined inline in the event contract module

The `actor-surface-model` spec defines the taxonomy, but no TypeScript types exist yet. Rather than creating a separate `src/types/actor-surface.ts` module (which would create a dependency for a single consumer), define the actor and surface identity types directly in `src/contracts/surface-events.ts` and export them.

When a future change implements the full actor-surface permission engine, these types can be extracted to a shared module and re-exported from the event contract for backward compatibility.

**Alternative considered:** Create `src/types/actor-surface.ts` now. Rejected because it creates a module with only two small union types and no runtime code — premature extraction.

### D3: JSON Schema files under `assets/global/schemas/`

Place JSON Schema files at `assets/global/schemas/surface-events/`. The `assets/global/` directory already holds prompts and workflow files that the distribution bundle copies. Adding a `schemas/` subdirectory follows the same pattern.

The distribution bundle (`src/contracts/install.ts`) will get a new `InstallCopyContract` entry to copy `global/schemas` to `$HOME/.config/specflow/global/schemas/`.

**Alternative considered:** Embed JSON Schema as string literals in TypeScript. Rejected because external (non-TypeScript) consumers need raw `.json` files, and embedded strings are harder to validate with standard JSON Schema tooling.

### D4: Envelope uses string literal unions, not numeric enums

All discriminant fields (`event_kind`, `event_type`, `direction`) use string literal unions. This matches the existing codebase conventions (e.g., `CoreRuntimeErrorKind`, `PhaseNextAction`) and produces self-documenting JSON payloads.

### D5: Phase-router's SurfaceEvent is replaced with a re-export

The placeholder `SurfaceEvent` in `src/lib/phase-router/types.ts` will be replaced with an import from `src/contracts/surface-events.ts`. The `SurfaceEventSink` interface signature remains compatible — it accepts the expanded type that is a superset of the old shape.

The router currently emits 4 fields (run_id, phase, event_kind, emitted_at). After this change, the router will construct a full `SurfaceEventEnvelope` with all required fields. The router already has access to run_id and phase from its store read; additional fields (actor, surface, correlation) will come from the orchestrator context passed to the router.

**Context threading:** The phase-router's `createPhaseRouter` (or its emit helper) will accept a new `SurfaceEventContext` parameter containing `actor: ActorIdentity`, `surface: SurfaceIdentity`, and `correlation: CorrelationContext`. This interface is defined in `src/lib/phase-router/types.ts` (not in `src/contracts/surface-events.ts`) because it is internal runtime plumbing for threading orchestrator state into the router, not a distributable contract surface consumed by external runtimes. The orchestrator that invokes the router is responsible for constructing this context object and passing it at each router invocation. The `event_id` field will be generated using `crypto.randomUUID()` (Node.js built-in, no additional dependency). This avoids store augmentation — the context is threaded as a function parameter, not stored in the XState machine context.

### D6: schema_version starts at "1.0", follows additive-only evolution

`schema_version` is a string field in the envelope, starting at `"1.0"`. Version policy:
- Adding optional fields: no version bump.
- Adding a new event_type: minor bump (e.g., "1.1").
- Changing required fields or removing fields: major bump (e.g., "2.0").

This is documented in the spec and JSON Schema description, not enforced at runtime.

### D7: Correlation sequence is optional and caller-assigned

The `sequence` field in the correlation object is optional. The caller (orchestrator or surface adapter) is responsible for assigning monotonically increasing sequence numbers if ordering matters. The event contract does not enforce or generate sequences — it only defines the field shape.

## Risks / Trade-offs

**[Risk] TypeScript types and JSON Schema can drift.**
→ Mitigation: Add a build-time test that parses the JSON Schema files and validates them against sample TypeScript objects using `ajv` (added as a devDependency). This is a lightweight check, not a full schema-from-types generator.

**[Risk] Phase-router refactor is a breaking change for test fixtures.**
→ Mitigation: The `SurfaceEventSink.emit()` signature accepts the wider envelope type. Existing test fixtures that construct a minimal 4-field `SurfaceEvent` will need updating, but the change is mechanical.

**[Risk] Actor/surface types defined inline may diverge from a future shared module.**
→ Mitigation: Keep the types minimal (union + identity interface). When the permission engine lands, extract and re-export. The type shapes are spec-defined and stable.

**[Risk] External consumers may depend on payload field ordering.**
→ Mitigation: JSON Schema and TypeScript types define shape, not ordering. Document that field ordering is not guaranteed.

## Open Questions

None — all ambiguities were resolved during proposal challenge/reclarify.
