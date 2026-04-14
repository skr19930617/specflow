// PhaseRouter public types.
//
// PhaseContract and the surface event schema are owned by separate changes
// (#129 and #100 respectively). Until those land, this module defines the
// minimal shape that the router consumes. When #129/#100 merge, the
// follow-up change will replace these declarations with imports from the
// canonical locations without breaking the router surface.

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
 * A surface event emitted by the router at gated decisions.
 * Schema is kept compatible with #100's Surface event contract.
 */
export interface SurfaceEvent {
	readonly run_id: string;
	readonly phase: string;
	readonly event_kind: string;
	readonly emitted_at: string;
}

/**
 * Sink the router emits gated events through. Implementations include the
 * production event bus and in-memory recorders used by tests.
 */
export interface SurfaceEventSink {
	emit(event: SurfaceEvent): void;
}
