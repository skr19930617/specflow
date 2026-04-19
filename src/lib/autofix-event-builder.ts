// Builder helpers for auto-fix round `review_completed` observation events.
//
// These helpers encode the workflow-observation-events payload contract
// (outcome enum + autofix sub-object) in one place so that CLI and runtime
// code can emit events without reimplementing the rules. See
// openspec/specs/workflow-observation-events/spec.md requirement
// "Per-event payload schemas are fully defined by this spec" (D9).

import type {
	AutofixLoopState,
	AutofixRoundCounters,
	AutofixRoundPayload,
	AutofixTerminalOutcome,
	CausalContext,
	ObservationEvent,
	ReviewCompletedOutcome,
	ReviewCompletedPayload,
} from "../types/observation-events.js";
import {
	makeEventId,
	nextSequence,
	type ObservationEventPublisher,
} from "./observation-event-publisher.js";

/** True when a state represents a terminal auto-fix loop outcome. */
export function isTerminalAutofixState(
	state: AutofixLoopState,
): state is "terminal_success" | "terminal_failure" {
	return state === "terminal_success" || state === "terminal_failure";
}

/**
 * Resolve the `outcome` for a `review_completed` event emitted by the
 * auto-fix loop. Non-terminal states SHALL use `autofix_in_progress`
 * (reserved for progress emissions). Terminal states map to one of the
 * standard review outcomes: `approved` when the severity gate is
 * satisfied, `changes_requested` when unresolved HIGH+ remain.
 */
export function outcomeForAutofixState(
	state: AutofixLoopState,
	terminalOutcome: AutofixTerminalOutcome | null,
): ReviewCompletedOutcome {
	if (!isTerminalAutofixState(state)) {
		return "autofix_in_progress";
	}
	if (state === "terminal_success" || terminalOutcome === "loop_no_findings") {
		return "approved";
	}
	return "changes_requested";
}

/** Build the `autofix` sub-payload from its component parts. */
export function buildAutofixRoundPayload(args: {
	readonly roundIndex: number;
	readonly maxRounds: number;
	readonly loopState: AutofixLoopState;
	readonly terminalOutcome?: AutofixTerminalOutcome | null;
	readonly counters: AutofixRoundCounters;
	readonly ledgerRoundId?: string | null;
}): AutofixRoundPayload {
	const terminalOutcome = args.terminalOutcome ?? null;
	// Enforce spec invariant: terminal states MUST have a non-null outcome;
	// non-terminal states MUST have a null outcome. Callers that violate
	// this are programming errors; we coerce defensively rather than throw
	// so that a single misuse doesn't crash the loop.
	const coerced = isTerminalAutofixState(args.loopState)
		? terminalOutcome
		: null;
	return {
		round_index: args.roundIndex,
		max_rounds: args.maxRounds,
		loop_state: args.loopState,
		terminal_outcome: coerced,
		counters: args.counters,
		ledger_round_id: args.ledgerRoundId ?? null,
	};
}

/** Build a full `ReviewCompletedPayload` for an auto-fix round emission. */
export function buildAutofixReviewCompletedPayload(args: {
	readonly reviewer: string;
	readonly score?: number | null;
	readonly autofix: AutofixRoundPayload;
}): ReviewCompletedPayload {
	// Non-terminal emissions SHALL report `score = null`; terminal emissions
	// MAY carry a score. Callers pass an explicit score for terminal events.
	const score = isTerminalAutofixState(args.autofix.loop_state)
		? (args.score ?? null)
		: null;
	return {
		outcome: outcomeForAutofixState(
			args.autofix.loop_state,
			args.autofix.terminal_outcome,
		),
		reviewer: args.reviewer,
		score,
		autofix: args.autofix,
	};
}

/**
 * Build and publish a `review_completed` observation event for an auto-fix
 * round. Returns the new highest sequence so callers can thread it through
 * subsequent emissions.
 */
export function publishAutofixReviewCompleted(args: {
	readonly publisher: ObservationEventPublisher;
	readonly runId: string;
	readonly changeId: string;
	readonly highestSequence: number;
	readonly timestamp: string;
	readonly sourcePhase: string | null;
	readonly payload: ReviewCompletedPayload;
	readonly causalContext?: CausalContext;
}): number {
	const seq = nextSequence(args.highestSequence);
	const event: ObservationEvent = {
		event_id: makeEventId(args.runId, seq),
		event_kind: "review_completed",
		run_id: args.runId,
		change_id: args.changeId,
		sequence: seq,
		timestamp: args.timestamp,
		source_phase: args.sourcePhase,
		target_phase: null,
		causal_context: args.causalContext ?? null,
		gate_ref: null,
		artifact_ref: null,
		bundle_ref: null,
		payload: args.payload,
	};
	args.publisher.publish(event);
	return seq;
}
