// PhaseRouter public types.
//
// PhaseContract is owned by a separate change (#129). Until that lands,
// this module defines the minimal shape that the router consumes.
//
// Surface event types are now imported from the canonical contract module
// (src/contracts/surface-events.ts), which satisfies #100.

import type {
	ActorIdentity,
	CorrelationContext,
	EventType,
	SurfaceEventEnvelope,
	SurfaceIdentity,
} from "../../contracts/surface-events.js";

// Re-export canonical types so existing consumers that import from
// phase-router/types still work.
export type { SurfaceEventEnvelope as SurfaceEvent } from "../../contracts/surface-events.js";

/** The four kinds of action the router can direct the orchestrator to take. */
export type PhaseNextAction =
	| "invoke_agent"
	| "await_user"
	| "advance"
	| "terminal";

/**
 * Structured metadata attached to a single workflow phase.
 * A `PhaseContract` is the router's only authoritative source for how a
 * phase should route — the router never maintains a parallel mapping.
 */
export interface PhaseContract {
	readonly phase: string;
	readonly next_action: PhaseNextAction;
	readonly gated: boolean;
	readonly terminal: boolean;
	/** Agent name — required iff next_action === "invoke_agent". */
	readonly agent?: string;
	/** Name of the event to fire — required iff next_action === "advance". */
	readonly advance_event?: string;
	/** Surface event kind — required iff gated === true. */
	readonly gated_event_kind?: string;
	/** Concrete event type for the gated envelope — required iff gated === true. */
	readonly gated_event_type?: EventType;
	/** Phase the workflow transitions to upon approval — used in envelope payload. */
	readonly next_phase?: string;
	/** Terminal reason — required iff terminal === true. */
	readonly terminal_reason?: string;
}

/**
 * Registry of PhaseContracts keyed by phase name.
 * Kept interface-only so production registries and test fixtures can both
 * implement it.
 */
export interface PhaseContractRegistry {
	get(phase: string): PhaseContract | undefined;
	phases(): readonly string[];
}

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
	emit(event: SurfaceEventEnvelope): void;
}
