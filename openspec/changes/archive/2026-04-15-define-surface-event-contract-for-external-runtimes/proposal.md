## Why

The server PoC is moving to a separate repo, but that repo needs a well-defined event contract to communicate workflow decisions (approval, rejection, clarification, resume) back to specflow. Today, the `phase-router` spec already references a "Surface event contract (#100)" for gated event emission, but no such contract exists yet. Without it, external runtimes and future surfaces (web UI, server API, CI bots) cannot interoperate with specflow's workflow in a surface-neutral way.

- Source: https://github.com/skr19930617/specflow/issues/100

## What Changes

- Define a **bidirectional surface event contract** — covering both outbound notifications (specflow → surface, e.g., "gated decision awaiting approval") and inbound commands (surface → specflow, e.g., "user approved"). The contract is transport-agnostic; HTTP/WebSocket/file-based transport is an implementation concern outside this contract.
- Define a **surface event envelope** with a `schema_version` field for forward compatibility. External runtimes can branch on `schema_version` to handle version mismatches gracefully.
- Define **actor identity** and **surface identity** fields within the envelope, re-exported from `actor-surface-model` so consumers need only a single import.
- Define **payload** and **correlation** fields for event traceability (run_id, change_id, sequence).
- Define a **hierarchical event type system**: 4 abstract categories (approval, reject, clarify, resume) with concrete specializations for gated decisions (accept_spec, accept_design, accept_apply), review outcomes (design_review_approved, apply_review_approved, request_changes, block), and their inbound command counterparts. Each concrete event type has a **fixed payload schema** with required and optional fields, enabling strict validation by external runtimes.
- Document the slash-command-to-event mapping as a reference table in spec text (not a runtime artifact). Surface adapters implement the mapping.
- Provide the contract as both **TypeScript type definitions** (with re-exports of actor-surface-model types) and **JSON Schema** within this repo.

## Capabilities

### New Capabilities
- `surface-event-contract`: Defines the bidirectional, transport-agnostic, versioned event envelope, identity fields, correlation model, hierarchical event type system, and concrete event schemas that external runtimes and future surfaces reference to interoperate with specflow workflows.

### Modified Capabilities
- None — `phase-router` already declares conformance to this contract (#100) but requires no spec-level change; it only needs the contract to exist.

## Impact

- `src/contracts/` — new event envelope types, concrete event schemas, and JSON Schema files will be added. Actor/surface types are re-exported from `actor-surface-model`.
- `phase-router` — gated event emission will conform to the new contract (implementation only, no spec change).
- External runtime repos — can import TypeScript types (single import) or reference JSON Schema for server-side workflow orchestration.
- `actor-surface-model` — no spec change; the event contract re-exports its actor/surface taxonomy types.
- Build pipeline — JSON Schema files will be included in the distribution bundle via `contract-driven-distribution`.
