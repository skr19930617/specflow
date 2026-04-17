// PhaseRouter public types.
//
// PhaseContract and related types are now defined in the canonical contract
// module (src/contracts/phase-contract.ts) per #129. This module re-exports
// them for backward compatibility.
//
// Surface event types are imported from the canonical contract module
// (src/contracts/surface-events.ts), which satisfies #100.

import type {
	ActorIdentity,
	CorrelationContext,
	SurfaceIdentity,
} from "../../contracts/surface-events.js";

// Re-export canonical types from the phase-contract module.
// Re-export structured phase descriptor types from the canonical module.
export type {
	GateCondition,
	GateConditionKind,
	PhaseContract,
	PhaseContractRegistry,
	PhaseIODescriptor,
	PhaseNextAction,
} from "../../contracts/phase-contract.js";
// Re-export canonical surface event types.
export type { SurfaceEventEnvelope as SurfaceEvent } from "../../contracts/surface-events.js";

/**
 * Discriminated union of actions the router returns to the orchestrator.
 * `advance` carries the event name only — the router never mutates the
 * store itself.
 */
export type PhaseAction =
	| { readonly kind: "invoke_agent"; readonly agent: string }
	| { readonly kind: "await_user"; readonly event_kind: string }
	| { readonly kind: "advance"; readonly event: string }
	| { readonly kind: "terminal"; readonly reason: string };

/**
 * Orchestrator-provided context for constructing full SurfaceEventEnvelopes.
 *
 * This is internal runtime plumbing for threading orchestrator state into
 * the router. It is deliberately NOT exported from the phase-router barrel
 * (index.ts) because it is not part of the distributable contract surface
 * consumed by external runtimes — that surface lives in
 * src/contracts/surface-events.ts. Orchestrator code that needs this type
 * should import it directly from this module.
 */
export interface SurfaceEventContext {
	readonly actor: ActorIdentity;
	readonly surface: SurfaceIdentity;
	readonly correlation: CorrelationContext;
}

/**
 * Sink the router emits gated events through. Implementations include the
 * production event bus and in-memory recorders used by tests.
 */
export interface SurfaceEventSink {
	emit(
		event: import("../../contracts/surface-events.js").SurfaceEventEnvelope,
	): void;
}
