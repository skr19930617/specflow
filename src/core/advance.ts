// Core runtime: apply a state-machine event to an existing run. Pure —
// no I/O. The wiring layer supplies the current state and prior record
// list; this module returns the updated state plus any record mutations
// the transition entails.

import type { ActorIdentity } from "../contracts/surface-events.js";
import {
	deriveAllowedEvents,
	isTerminalPhase,
} from "../lib/workflow-machine.js";
import type { RunHistoryEntry, RunStatus } from "../types/contracts.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
	InteractionRecord,
} from "../types/interaction-records.js";
import { generateRecordId } from "../types/interaction-records.js";
import type {
	CoreRuntimeError,
	RecordMutation,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
import { err, ok } from "./types.js";

export interface WorkflowDefinition {
	readonly version: string;
	readonly states: readonly string[];
	readonly events: readonly string[];
	readonly transitions: readonly {
		readonly from: string;
		readonly event: string;
		readonly to: string;
	}[];
}

export interface AdvanceInput<TAdapter> {
	readonly state: RunStateOf<TAdapter>;
	readonly event: string;
	readonly nowIso: string;
	/** All interaction records currently associated with the run. */
	readonly priorRecords: readonly InteractionRecord[];
	/** Optional actor identity for provenance tracking. */
	readonly actor?: ActorIdentity;
	/** Optional event_id to associate with interaction records. */
	readonly eventId?: string;
	/** Optional clarify data for creating/resolving ClarifyRecords. */
	readonly clarify?: {
		readonly question?: string;
		readonly questionContext?: string;
		readonly answer?: string;
	};
}

export interface AdvanceDeps {
	readonly workflow: WorkflowDefinition;
}

// Phases that represent approval gates (entering these creates a pending ApprovalRecord).
const APPROVAL_GATE_PHASES = new Set([
	"spec_ready",
	"design_ready",
	"apply_ready",
]);

// Phase-to-target mapping for approval gates.
const APPROVAL_GATE_TARGETS: Readonly<Record<string, string>> = {
	spec_ready: "design_draft",
	design_ready: "apply_draft",
	apply_ready: "approved",
};

// Events that represent approval decisions.
const APPROVAL_DECISION_EVENTS = new Set([
	"accept_spec",
	"accept_design",
	"accept_apply",
]);

function nextRecordSequence(records: readonly InteractionRecord[]): number {
	if (records.length === 0) return 1;
	let maxSeq = 0;
	for (const rec of records) {
		const lastDash = rec.record_id.lastIndexOf("-");
		const suffix = lastDash >= 0 ? rec.record_id.slice(lastDash + 1) : "0";
		const num = Number.parseInt(suffix, 10);
		if (!Number.isNaN(num) && num > maxSeq) {
			maxSeq = num;
		}
	}
	return maxSeq + 1;
}

function findPendingApproval(
	records: readonly InteractionRecord[],
): ApprovalRecord | null {
	for (const rec of records) {
		if (rec.record_kind === "approval" && rec.status === "pending") {
			return rec;
		}
	}
	return null;
}

function findPendingClarify(
	records: readonly InteractionRecord[],
): ClarifyRecord | null {
	for (const rec of records) {
		if (rec.record_kind === "clarify" && rec.status === "pending") {
			return rec;
		}
	}
	return null;
}

export function advanceRun<TAdapter extends object>(
	input: AdvanceInput<TAdapter>,
	deps: AdvanceDeps,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { state, event, nowIso, priorRecords } = input;

	if (state.status === "suspended") {
		return err({
			kind: "run_suspended",
			message: `Error: Run is suspended — resume first. Only 'resume' is allowed.`,
		});
	}

	const transition = deps.workflow.transitions.find(
		(candidate) =>
			candidate.from === state.current_phase && candidate.event === event,
	);
	if (!transition) {
		const allowed = deriveAllowedEvents(
			state.status as RunStatus,
			state.current_phase,
		);
		return err({
			kind: "invalid_event",
			message: `Error: invalid transition. Event '${event}' is not allowed in state '${state.current_phase}'. Allowed events: ${allowed.join(", ")}`,
			details: {
				current_phase: state.current_phase,
				allowed_events: allowed,
			},
		});
	}

	// --- Compute record mutations ---
	const recordMutations: RecordMutation[] = [];
	let recordRef: string | undefined;
	const actor: ActorIdentity | null = input.actor ?? null;

	// Create pending ApprovalRecord when entering an approval gate phase
	if (APPROVAL_GATE_PHASES.has(transition.to)) {
		const seq = nextRecordSequence(priorRecords);
		const recordId = generateRecordId("approval", state.run_id, seq);
		const approvalRecord: ApprovalRecord = {
			record_id: recordId,
			record_kind: "approval",
			run_id: state.run_id,
			phase_from: transition.to,
			phase_to: APPROVAL_GATE_TARGETS[transition.to] ?? "",
			status: "pending",
			requested_at: nowIso,
			decided_at: null,
			decision_actor: null,
			event_ids: input.eventId ? [input.eventId] : [],
		};
		recordMutations.push({ kind: "create", record: approvalRecord });
		recordRef = recordId;
	}

	// Update ApprovalRecord when an approval decision is made
	if (APPROVAL_DECISION_EVENTS.has(event)) {
		const pending = findPendingApproval(priorRecords);
		if (pending) {
			const updatedEventIds = input.eventId
				? [...pending.event_ids, input.eventId]
				: [...pending.event_ids];
			const updated: ApprovalRecord = {
				...pending,
				status: "approved",
				decided_at: nowIso,
				decision_actor: actor,
				event_ids: updatedEventIds,
			};
			recordMutations.push({ kind: "update", record: updated });
			recordRef = pending.record_id;
		}
	}

	// Update ApprovalRecord on rejection if there's a pending approval
	if (event === "reject") {
		const pending = findPendingApproval(priorRecords);
		if (pending) {
			const updatedEventIds = input.eventId
				? [...pending.event_ids, input.eventId]
				: [...pending.event_ids];
			const updated: ApprovalRecord = {
				...pending,
				status: "rejected",
				decided_at: nowIso,
				decision_actor: actor,
				event_ids: updatedEventIds,
			};
			recordMutations.push({ kind: "update", record: updated });
			recordRef = pending.record_id;
		}
	}

	// Create pending ClarifyRecord when a clarify question is issued
	if (event === "clarify_request" || input.clarify?.question) {
		const seq = nextRecordSequence(priorRecords);
		const recordId = generateRecordId("clarify", state.run_id, seq);
		const clarifyRecord: ClarifyRecord = {
			record_id: recordId,
			record_kind: "clarify",
			run_id: state.run_id,
			phase: state.current_phase,
			question: input.clarify?.question ?? "",
			...(input.clarify?.questionContext
				? { question_context: input.clarify.questionContext }
				: {}),
			answer: null,
			status: "pending",
			asked_at: nowIso,
			answered_at: null,
			event_ids: input.eventId ? [input.eventId] : [],
		};
		recordMutations.push({ kind: "create", record: clarifyRecord });
		recordRef = recordId;
	}

	// Resolve ClarifyRecord when a clarify response is received
	if (event === "clarify_response" || input.clarify?.answer) {
		const pending = findPendingClarify(priorRecords);
		if (pending) {
			const updatedEventIds = input.eventId
				? [...pending.event_ids, input.eventId]
				: [...pending.event_ids];
			const updated: ClarifyRecord = {
				...pending,
				status: "resolved",
				answer: input.clarify?.answer ?? "",
				answered_at: nowIso,
				event_ids: updatedEventIds,
			};
			recordMutations.push({ kind: "update", record: updated });
			recordRef = pending.record_id;
		}
	}

	const newStatus: RunStatus = isTerminalPhase(transition.to)
		? "terminal"
		: (state.status as RunStatus);

	const historyEntry: RunHistoryEntry = {
		from: state.current_phase,
		to: transition.to,
		event,
		timestamp: nowIso,
		...(actor ? { actor: actor.actor, actor_id: actor.actor_id } : {}),
		...(recordRef !== undefined ? { record_ref: recordRef } : {}),
	};

	const updated: RunStateOf<TAdapter> = {
		...state,
		current_phase: transition.to,
		status: newStatus,
		updated_at: nowIso,
		allowed_events: deriveAllowedEvents(newStatus, transition.to),
		history: [...state.history, historyEntry],
	};

	return ok({ state: updated, recordMutations });
}
