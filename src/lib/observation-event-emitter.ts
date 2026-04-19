// Observation event emitter — interprets state transitions and record
// mutations into the ordered event sequence required by
// workflow-observation-events / workflow-run-state / workflow-gate-semantics.
//
// Emission ordering rules (from the specs):
//   1. Gate terminal events (gate_resolved / gate_rejected) precede any phase
//      events they cause.
//   2. phase_completed for the source phase (unless source is "start").
//   3. phase_entered for the target phase.
//   4. Gate open events (gate_opened) follow the phase_entered that caused
//      them, because the gate is a consequence of reaching the new phase.
//   5. run_terminal follows the phase events when the target phase is a
//      terminal state.
//   6. run_suspended / run_resumed are emitted on lifecycle status changes
//      without phase transitions.

import type {
	ApprovalRecord,
	InteractionRecord,
} from "../types/interaction-records.js";
import type {
	CausalContext,
	GateKindForObservation,
	ObservationEvent,
	ObservationEventKind,
} from "../types/observation-events.js";
import {
	makeEventId,
	nextSequence,
	type ObservationEventPublisher,
} from "./observation-event-publisher.js";
import { isTerminalPhase } from "./workflow-machine.js";

/** Minimal run-state shape the emitter needs — keeps the module standalone. */
export interface EmitRunState {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly source?: {
		readonly provider?: string | null;
		readonly reference?: string | null;
		readonly title?: string | null;
	} | null;
}

/** RecordMutation shape re-declared here to avoid a core-layer dependency. */
export type EmitRecordMutation =
	| { readonly kind: "create"; readonly record: InteractionRecord }
	| { readonly kind: "update"; readonly record: InteractionRecord }
	| { readonly kind: "delete"; readonly recordId: string };

/**
 * Pre-resolved gate info. Passed when a gate was resolved by the gate
 * runtime (e.g. `resolveGateForEvent`) *before* `advanceRun()`, so the
 * advance's `recordMutations` no longer contain the terminal update.
 */
export interface ResolvedGateInfo {
	readonly gateId: string;
	readonly gateKind: GateKindForObservation;
	readonly response: string;
	readonly actorLabel: string;
}

function toGateKind(record_kind: string): GateKindForObservation | null {
	if (record_kind === "approval") return "approval";
	if (record_kind === "clarify") return "clarify";
	if (record_kind === "review_decision") return "review_decision";
	return null;
}

/**
 * Map a gate response token to the observation event terminal kind and
 * resolution value. Works for all three gate kinds (approval, clarify,
 * review_decision).
 */
function responseToTerminal(response: string):
	| {
			kind: "resolved";
			resolution: "approved" | "answered" | "changes_requested";
	  }
	| { kind: "rejected"; reason: string | null } {
	if (response === "reject") {
		return { kind: "rejected", reason: null };
	}
	const map: Record<string, "approved" | "answered" | "changes_requested"> = {
		accept: "approved",
		clarify_response: "answered",
		request_changes: "changes_requested",
	};
	return { kind: "resolved", resolution: map[response] ?? "approved" };
}

function resolveGateResolution(record: InteractionRecord):
	| {
			kind: "resolved";
			resolution: "approved" | "answered" | "changes_requested";
	  }
	| { kind: "rejected"; reason: string | null }
	| null {
	if (record.record_kind === "approval") {
		const approval = record as ApprovalRecord;
		if (approval.status === "approved")
			return { kind: "resolved", resolution: "approved" };
		if (approval.status === "rejected")
			return { kind: "rejected", reason: null };
		return null;
	}
	if (record.record_kind === "clarify" && record.status === "resolved") {
		return { kind: "resolved", resolution: "answered" };
	}
	// review_decision gates are normally resolved by resolveGateForEvent
	// before advanceRun (via the ResolvedGateInfo path), but handle them
	// here defensively in case a mutation surfaces through advanceRun.
	// The cast is needed because InteractionRecord's union doesn't include
	// review_decision — at runtime the record_kind may still be present.
	const kind = record.record_kind as string;
	if (kind === "review_decision") {
		const status = String(
			(record as unknown as { status?: string }).status ?? "",
		);
		const response = String(
			(record as unknown as { resolved_response?: string }).resolved_response ??
				"",
		);
		if (status === "resolved") {
			if (response === "request_changes")
				return { kind: "resolved", resolution: "changes_requested" };
			return { kind: "resolved", resolution: "approved" };
		}
		if (status === "rejected") return { kind: "rejected", reason: null };
		return null;
	}
	return null;
}

function actorLabel(record: InteractionRecord): string {
	const candidate = (record as { readonly decision_actor?: { actor?: string } })
		.decision_actor;
	return candidate?.actor ?? "unknown";
}

/**
 * Build a single envelope+payload event. Callers are responsible for passing
 * a sequence they've already reserved.
 */
function buildEvent(args: {
	readonly kind: ObservationEventKind;
	readonly runId: string;
	readonly changeId: string;
	readonly sequence: number;
	readonly timestamp: string;
	readonly sourcePhase: string | null;
	readonly targetPhase: string | null;
	readonly causal: CausalContext;
	readonly gateRef: string | null;
	readonly artifactRef: string | null;
	readonly bundleRef: string | null;
	readonly payload: ObservationEvent["payload"];
}): ObservationEvent {
	return {
		event_id: makeEventId(args.runId, args.sequence),
		event_kind: args.kind,
		run_id: args.runId,
		change_id: args.changeId,
		sequence: args.sequence,
		timestamp: args.timestamp,
		source_phase: args.sourcePhase,
		target_phase: args.targetPhase,
		causal_context: args.causal,
		gate_ref: args.gateRef,
		artifact_ref: args.artifactRef,
		bundle_ref: args.bundleRef,
		payload: args.payload,
	} as ObservationEvent;
}

/** Emit `run_started` as sequence 1 for a brand-new run. */
export function emitRunStarted(
	publisher: ObservationEventPublisher,
	state: EmitRunState,
	timestamp: string,
): void {
	const changeId = state.change_name ?? "";
	const event = buildEvent({
		kind: "run_started",
		runId: state.run_id,
		changeId,
		sequence: 1,
		timestamp,
		sourcePhase: null,
		targetPhase: state.current_phase,
		causal: null,
		gateRef: null,
		artifactRef: null,
		bundleRef: null,
		payload: {
			source: {
				provider: state.source?.provider ?? null,
				reference: state.source?.reference ?? null,
			},
			title: state.source?.title ?? null,
		},
	});
	publisher.publish(event);
}

/**
 * Emit the events caused by an `advance` transition, in the order required
 * by the spec: gate terminal → phase_completed → phase_entered → gate_opened
 * → run_terminal.
 *
 * `resolvedGate` carries info about a gate that was resolved by the gate
 * runtime *before* `advanceRun()` ran, so its terminal event is NOT visible
 * in `mutations`. When present, the emitter emits `gate_resolved` or
 * `gate_rejected` first, and threads the `gate_ref` through all downstream
 * phase/lifecycle events it caused.
 */
export function emitAdvanceEvents(args: {
	readonly publisher: ObservationEventPublisher;
	readonly priorState: EmitRunState;
	readonly newState: EmitRunState;
	readonly event: string;
	readonly mutations: readonly EmitRecordMutation[];
	readonly timestamp: string;
	readonly highestSequence: number;
	readonly resolvedGate?: ResolvedGateInfo | null;
}): void {
	const {
		publisher,
		priorState,
		newState,
		event,
		mutations,
		timestamp,
		highestSequence,
		resolvedGate,
	} = args;
	const changeId = newState.change_name ?? priorState.change_name ?? "";
	let seq = highestSequence;
	let lastEventId: string | null = null;

	// Track the gate_ref that caused downstream phase/lifecycle events.
	// Set when a gate terminal event is emitted.
	let causedByGateRef: string | null = null;

	const publishNext = (
		builder: (sequence: number, causal: CausalContext) => ObservationEvent,
	) => {
		seq = nextSequence(seq);
		const causal: CausalContext = lastEventId
			? { kind: "observation_event", ref: lastEventId }
			: { kind: "user_event", ref: event };
		const built = builder(seq, causal);
		publisher.publish(built);
		lastEventId = built.event_id;
	};

	// 0. Pre-resolved gate (resolved by gate runtime before advanceRun).
	if (resolvedGate) {
		const terminal = responseToTerminal(resolvedGate.response);
		causedByGateRef = resolvedGate.gateId;
		if (terminal.kind === "resolved") {
			publishNext((sequence, causal) =>
				buildEvent({
					kind: "gate_resolved",
					runId: newState.run_id,
					changeId,
					sequence,
					timestamp,
					sourcePhase: priorState.current_phase,
					targetPhase: newState.current_phase,
					causal,
					gateRef: resolvedGate.gateId,
					artifactRef: null,
					bundleRef: null,
					payload: {
						resolution: terminal.resolution,
						by_actor: resolvedGate.actorLabel,
					},
				}),
			);
		} else {
			publishNext((sequence, causal) =>
				buildEvent({
					kind: "gate_rejected",
					runId: newState.run_id,
					changeId,
					sequence,
					timestamp,
					sourcePhase: priorState.current_phase,
					targetPhase: newState.current_phase,
					causal,
					gateRef: resolvedGate.gateId,
					artifactRef: null,
					bundleRef: null,
					payload: {
						resolution: "rejected",
						by_actor: resolvedGate.actorLabel,
						reason: terminal.reason,
					},
				}),
			);
		}
	}

	// 1. Gate terminal mutations (from advanceRun's recordMutations).
	for (const mutation of mutations) {
		if (mutation.kind !== "update") continue;
		const gateKind = toGateKind(mutation.record.record_kind);
		if (!gateKind) continue;
		const resolution = resolveGateResolution(mutation.record);
		if (!resolution) continue;
		const gateRef = mutation.record.record_id;
		causedByGateRef = gateRef;
		const by = actorLabel(mutation.record);
		if (resolution.kind === "resolved") {
			publishNext((sequence, causal) =>
				buildEvent({
					kind: "gate_resolved",
					runId: newState.run_id,
					changeId,
					sequence,
					timestamp,
					sourcePhase: priorState.current_phase,
					targetPhase: newState.current_phase,
					causal,
					gateRef,
					artifactRef: null,
					bundleRef: null,
					payload: { resolution: resolution.resolution, by_actor: by },
				}),
			);
		} else {
			publishNext((sequence, causal) =>
				buildEvent({
					kind: "gate_rejected",
					runId: newState.run_id,
					changeId,
					sequence,
					timestamp,
					sourcePhase: priorState.current_phase,
					targetPhase: newState.current_phase,
					causal,
					gateRef,
					artifactRef: null,
					bundleRef: null,
					payload: {
						resolution: "rejected",
						by_actor: by,
						reason: resolution.reason,
					},
				}),
			);
		}
	}

	// 2. phase_completed for the source phase, unless source is "start".
	// When caused by a gate, carry the gate_ref per spec requirement.
	const phaseChanged = priorState.current_phase !== newState.current_phase;
	if (phaseChanged && priorState.current_phase !== "start") {
		publishNext((sequence, causal) =>
			buildEvent({
				kind: "phase_completed",
				runId: newState.run_id,
				changeId,
				sequence,
				timestamp,
				sourcePhase: priorState.current_phase,
				targetPhase: newState.current_phase,
				causal,
				gateRef: causedByGateRef,
				artifactRef: null,
				bundleRef: null,
				payload: { outcome: "advanced" },
			}),
		);
	}

	// 3. phase_entered for the new phase when the phase changed.
	if (phaseChanged) {
		publishNext((sequence, causal) =>
			buildEvent({
				kind: "phase_entered",
				runId: newState.run_id,
				changeId,
				sequence,
				timestamp,
				sourcePhase: priorState.current_phase,
				targetPhase: newState.current_phase,
				causal,
				gateRef: causedByGateRef,
				artifactRef: null,
				bundleRef: null,
				payload: { triggered_event: event },
			}),
		);
	}

	// 4. Gate open mutations after the phase_entered that caused them.
	for (const mutation of mutations) {
		if (mutation.kind !== "create") continue;
		const gateKind = toGateKind(mutation.record.record_kind);
		if (!gateKind) continue;
		const gateRef = mutation.record.record_id;
		publishNext((sequence, causal) =>
			buildEvent({
				kind: "gate_opened",
				runId: newState.run_id,
				changeId,
				sequence,
				timestamp,
				sourcePhase: priorState.current_phase,
				targetPhase: newState.current_phase,
				causal,
				gateRef,
				artifactRef: null,
				bundleRef: null,
				payload: { gate_kind: gateKind },
			}),
		);
	}

	// 5. run_terminal for terminal targets.
	if (phaseChanged && isTerminalPhase(newState.current_phase)) {
		const terminalStatus = newState.current_phase as
			| "approved"
			| "decomposed"
			| "rejected";
		publishNext((sequence, causal) =>
			buildEvent({
				kind: "run_terminal",
				runId: newState.run_id,
				changeId,
				sequence,
				timestamp,
				sourcePhase: priorState.current_phase,
				targetPhase: newState.current_phase,
				causal,
				gateRef: causedByGateRef,
				artifactRef: null,
				bundleRef: null,
				payload: { status: terminalStatus, reason: null },
			}),
		);
	}
}

/**
 * Emit `gate_opened` for a gate issued outside the advance path (e.g.
 * review_decision gates issued by review CLIs).
 */
export function emitGateOpened(args: {
	readonly publisher: ObservationEventPublisher;
	readonly runId: string;
	readonly changeId: string;
	readonly gateId: string;
	readonly gateKind: GateKindForObservation;
	readonly originatingPhase: string;
	readonly timestamp: string;
	readonly highestSequence: number;
	readonly causalRef?: CausalContext;
}): void {
	const seq = nextSequence(args.highestSequence);
	// Default causal_context is null — review gates are issued by CLI
	// commands with no prior observation event as a direct cause. Callers
	// may provide a specific causal reference when one exists.
	const causal: CausalContext = args.causalRef ?? null;
	const event = buildEvent({
		kind: "gate_opened",
		runId: args.runId,
		changeId: args.changeId,
		sequence: seq,
		timestamp: args.timestamp,
		sourcePhase: args.originatingPhase,
		targetPhase: null,
		causal,
		gateRef: args.gateId,
		artifactRef: null,
		bundleRef: null,
		payload: { gate_kind: args.gateKind },
	});
	args.publisher.publish(event);
}

/** Emit `run_suspended` when the run transitions from active to suspended. */
export function emitRunSuspended(
	publisher: ObservationEventPublisher,
	state: EmitRunState,
	timestamp: string,
	highestSequence: number,
	reason = "user_initiated",
): void {
	const seq = nextSequence(highestSequence);
	const event = buildEvent({
		kind: "run_suspended",
		runId: state.run_id,
		changeId: state.change_name ?? "",
		sequence: seq,
		timestamp,
		sourcePhase: state.current_phase,
		targetPhase: null,
		causal: { kind: "user_event", ref: "suspend" },
		gateRef: null,
		artifactRef: null,
		bundleRef: null,
		payload: { reason },
	});
	publisher.publish(event);
}

/** Emit `run_resumed` when the run transitions from suspended to active. */
export function emitRunResumed(
	publisher: ObservationEventPublisher,
	state: EmitRunState,
	timestamp: string,
	highestSequence: number,
): void {
	const seq = nextSequence(highestSequence);
	const event = buildEvent({
		kind: "run_resumed",
		runId: state.run_id,
		changeId: state.change_name ?? "",
		sequence: seq,
		timestamp,
		sourcePhase: null,
		targetPhase: state.current_phase,
		causal: { kind: "user_event", ref: "resume" },
		gateRef: null,
		artifactRef: null,
		bundleRef: null,
		payload: {},
	});
	publisher.publish(event);
}
