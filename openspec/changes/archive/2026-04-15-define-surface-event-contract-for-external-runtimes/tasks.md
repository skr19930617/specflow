## 1. Define canonical surface event TypeScript types

> Create src/contracts/surface-events.ts with actor/surface identity types and the full SurfaceEventEnvelope discriminated union.

- [ ] 1.1 Define ActorKind string literal union and ActorIdentity interface (D2)
- [ ] 1.2 Define SurfaceKind string literal union and SurfaceIdentity interface (D2)
- [ ] 1.3 Define EventDirection ('inbound' | 'outbound') string literal union (D4)
- [ ] 1.4 Define EventKind and EventType string literal unions for the discriminant fields (D4)
- [ ] 1.5 Define CorrelationContext interface with optional sequence field (D7)
- [ ] 1.6 Define SurfaceEventEnvelope interface with schema_version '1.0', all required fields, and readonly modifiers (D1, D6)
- [ ] 1.7a Define approval payload interfaces: accept_spec, accept_design, accept_apply (3 concrete event types)
- [ ] 1.7b Define reject payload interface: reject (1 concrete event type)
- [ ] 1.7c Define clarify payload interfaces: clarify_request, clarify_response (2 concrete event types)
- [ ] 1.7d Define resume payload interface: resume (1 concrete event type)
- [ ] 1.7e Define review outcome payload interfaces: design_review_approved, apply_review_approved, request_changes, block (4 concrete event types)
- [ ] 1.7f Combine all 11 concrete event type interfaces into a discriminated union type. The complete list of concrete event types is: accept_spec, accept_design, accept_apply, reject, clarify_request, clarify_response, resume, design_review_approved, apply_review_approved, request_changes, block
- [ ] 1.8 Export all public types from the module
- [ ] 1.9 Verify the module compiles with tsc and passes lint

## 2. Create JSON Schema files for surface events

> Author JSON Schema files under assets/global/schemas/surface-events/ that mirror each concrete event type for language-agnostic consumers.

> Depends on: canonical-event-types

- [ ] 2.1 Create assets/global/schemas/surface-events/ directory
- [ ] 2.2 Author envelope.schema.json defining the base SurfaceEventEnvelope with schema_version, discriminant fields, and correlation
- [ ] 2.3 Author individual .schema.json files for each concrete event type (one per event_type discriminant)
- [ ] 2.4 Author actor-identity.schema.json and surface-identity.schema.json for the identity sub-objects
- [ ] 2.5 Validate all schema files parse as valid JSON Schema draft-2020-12

## 3. Wire schema distribution via install contract

> Add an InstallCopyContract entry in src/contracts/install.ts so the distribution bundle copies global/schemas/ to the user config directory.

> Depends on: json-schema-definitions

- [ ] 3.1 Add InstallCopyContract entry for global/schemas → $HOME/.config/specflow/global/schemas in installCopies array
- [ ] 3.2 Verify the contracts bundle exports the updated installCopies and compiles cleanly

## 4. Replace phase-router placeholder SurfaceEvent with canonical import

> Remove the placeholder SurfaceEvent and SurfaceEventSink from phase-router/types.ts and replace with imports from the canonical contract module.

> Depends on: canonical-event-types

- [ ] 4.1 Import SurfaceEventEnvelope from src/contracts/surface-events.ts into phase-router/types.ts
- [ ] 4.2 Remove the placeholder SurfaceEvent interface and replace the type alias with re-export from canonical module
- [ ] 4.3 Update SurfaceEventSink to accept SurfaceEventEnvelope (or re-export canonical SurfaceEventSink if defined)
- [ ] 4.4a Define a SurfaceEventContext interface (actor: ActorIdentity, surface: SurfaceIdentity, correlation: CorrelationContext) in src/lib/phase-router/types.ts (D5). SurfaceEventContext is internal runtime plumbing for threading orchestrator state into the router, not a distributable contract surface — it belongs alongside the router's own types, not in src/contracts/.
- [ ] 4.4b Update createPhaseRouter (or its emit helper) function signature to accept SurfaceEventContext as a parameter (D5)
- [ ] 4.4c Update emit call sites to construct full SurfaceEventEnvelope using the threaded context and crypto.randomUUID() for event_id (D5)
- [ ] 4.5 Update existing phase-router test fixtures to use the expanded envelope shape
- [ ] 4.6 Run phase-router unit tests and verify all pass

## 5. Add build-time test for TypeScript/JSON Schema consistency

> Create a test that parses JSON Schema files and validates them against sample TypeScript objects to detect drift between the two representations.

> Depends on: canonical-event-types, json-schema-definitions

- [ ] 5.0 Add ajv as a devDependency (npm install --save-dev ajv)
- [ ] 5.1 Create test file that loads each JSON Schema from assets/global/schemas/surface-events/
- [ ] 5.2 Construct sample SurfaceEventEnvelope objects (one per concrete event type) using the TypeScript types
- [ ] 5.3 Validate each sample object against its corresponding JSON Schema using a schema validator (e.g., ajv)
- [ ] 5.4 Add negative test cases: objects with missing required fields must fail validation
- [ ] 5.5 Verify test passes in CI (build + test)
