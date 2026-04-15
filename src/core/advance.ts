// Core runtime: apply a state-machine event to an existing run.

import type { ActorIdentity } from "../contracts/surface-events.js";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import type { InteractionRecordStore } from "../lib/interaction-record-store.js";
import {
	deriveAllowedEvents,
	isTerminalPhase,
} from "../lib/workflow-machine.js";
import type {
	RunHistoryEntry,
	RunState,
	RunStatus,
} from "../types/contracts.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";
import { generateRecordId } from "../types/interaction-records.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { AdvanceInput, CoreRuntimeError, Result } from "./types.js";
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

export interface AdvanceDeps {
	readonly runs: RunArtifactStore;
	readonly workflow: WorkflowDefinition;
	/** Optional — when provided, interaction records are created for approval/clarify transitions. */
	readonly records?: InteractionRecordStore;
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

/**
 * Compute the next record sequence by scanning existing record IDs for max sequence.
 * Uses max-sequence scan instead of list length to avoid collisions after delete.
 */
function nextRecordSequence(
	records: InteractionRecordStore,
	runId: string,
): number {
	const existing = records.list(runId);
	if (existing.length === 0) return 1;
	let maxSeq = 0;
	for (const rec of existing) {
		const lastDash = rec.record_id.lastIndexOf("-");
		const suffix = lastDash >= 0 ? rec.record_id.slice(lastDash + 1) : "0";
		const num = Number.parseInt(suffix, 10);
		if (!Number.isNaN(num) && num > maxSeq) {
			maxSeq = num;
		}
	}
	return maxSeq + 1;
}

/**
 * Find a pending approval record for a run.
 */
function findPendingApproval(
	records: InteractionRecordStore,
	runId: string,
): ApprovalRecord | null {
	const all = records.list(runId);
	for (const rec of all) {
		if (rec.record_kind === "approval" && rec.status === "pending") {
			return rec;
		}
	}
	return null;
}

/**
 * Find a pending clarify record for a run.
 */
function findPendingClarify(
	records: InteractionRecordStore,
	runId: string,
): ClarifyRecord | null {
	const all = records.list(runId);
	for (const rec of all) {
		if (rec.record_kind === "clarify" && rec.status === "pending") {
			return rec;
		}
	}
	return null;
}

export function advanceRun(
	input: AdvanceInput,
	deps: AdvanceDeps,
): Result<RunState, CoreRuntimeError> {
	const loaded = loadRunState(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	if (runState.status === "suspended") {
		return err({
			kind: "run_suspended",
			message: `Error: Run is suspended — resume first. Only 'resume' is allowed.`,
		});
	}

	const transition = deps.workflow.transitions.find(
		(candidate) =>
			candidate.from === runState.current_phase &&
			candidate.event === input.event,
	);
	if (!transition) {
		const allowed = deriveAllowedEvents(
			runState.status as RunStatus,
			runState.current_phase,
		);
		return err({
			kind: "invalid_event",
			message: `Error: invalid transition. Event '${input.event}' is not allowed in state '${runState.current_phase}'. Allowed events: ${allowed.join(", ")}`,
			details: {
				current_phase: runState.current_phase,
				allowed_events: allowed,
			},
		});
	}

	// --- Interaction record handling ---
	let recordRef: string | undefined;
	const actor: ActorIdentity | null = input.actor ?? null;

	if (deps.records) {
		try {
			const ts = nowIso();

			// Create pending ApprovalRecord when entering an approval gate phase
			if (APPROVAL_GATE_PHASES.has(transition.to)) {
				const seq = nextRecordSequence(deps.records, input.runId);
				const recordId = generateRecordId("approval", input.runId, seq);
				const approvalRecord: ApprovalRecord = {
					record_id: recordId,
					record_kind: "approval",
					run_id: input.runId,
					phase_from: transition.to,
					phase_to: APPROVAL_GATE_TARGETS[transition.to] ?? "",
					status: "pending",
					requested_at: ts,
					decided_at: null,
					decision_actor: null,
					event_ids: input.eventId ? [input.eventId] : [],
				};
				deps.records.write(input.runId, approvalRecord);
				recordRef = recordId;
			}

			// Update ApprovalRecord when an approval decision is made
			if (APPROVAL_DECISION_EVENTS.has(input.event)) {
				const pending = findPendingApproval(deps.records, input.runId);
				if (pending) {
					const updatedEventIds = input.eventId
						? [...pending.event_ids, input.eventId]
						: [...pending.event_ids];
					const updated: ApprovalRecord = {
						...pending,
						status: "approved",
						decided_at: ts,
						decision_actor: actor,
						event_ids: updatedEventIds,
					};
					deps.records.write(input.runId, updated);
					recordRef = pending.record_id;
				}
			}

			// Update ApprovalRecord on rejection if there's a pending approval
			if (input.event === "reject") {
				const pending = findPendingApproval(deps.records, input.runId);
				if (pending) {
					const updatedEventIds = input.eventId
						? [...pending.event_ids, input.eventId]
						: [...pending.event_ids];
					const updated: ApprovalRecord = {
						...pending,
						status: "rejected",
						decided_at: ts,
						decision_actor: actor,
						event_ids: updatedEventIds,
					};
					deps.records.write(input.runId, updated);
					recordRef = pending.record_id;
				}
			}

			// Create pending ClarifyRecord when a clarify question is issued
			if (input.event === "clarify_request" || input.clarify?.question) {
				const seq = nextRecordSequence(deps.records, input.runId);
				const recordId = generateRecordId("clarify", input.runId, seq);
				const clarifyRecord: ClarifyRecord = {
					record_id: recordId,
					record_kind: "clarify",
					run_id: input.runId,
					phase: runState.current_phase,
					question: input.clarify?.question ?? "",
					...(input.clarify?.questionContext
						? { question_context: input.clarify.questionContext }
						: {}),
					answer: null,
					status: "pending",
					asked_at: ts,
					answered_at: null,
					event_ids: input.eventId ? [input.eventId] : [],
				};
				deps.records.write(input.runId, clarifyRecord);
				recordRef = recordId;
			}

			// Resolve ClarifyRecord when a clarify response is received
			if (input.event === "clarify_response" || input.clarify?.answer) {
				const pending = findPendingClarify(deps.records, input.runId);
				if (pending) {
					const updatedEventIds = input.eventId
						? [...pending.event_ids, input.eventId]
						: [...pending.event_ids];
					const updated: ClarifyRecord = {
						...pending,
						status: "resolved",
						answer: input.clarify?.answer ?? "",
						answered_at: ts,
						event_ids: updatedEventIds,
					};
					deps.records.write(input.runId, updated);
					recordRef = pending.record_id;
				}
			}
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			return err({
				kind: "record_write_failed",
				message: `Error: interaction record write failed — ${message}`,
				details: { runId: input.runId, event: input.event },
			});
		}
	}

	const newStatus: RunStatus = isTerminalPhase(transition.to)
		? "terminal"
		: (runState.status as RunStatus);

	const historyEntry: RunHistoryEntry = {
		from: runState.current_phase,
		to: transition.to,
		event: input.event,
		timestamp: nowIso(),
		...(actor ? { actor: actor.actor, actor_id: actor.actor_id } : {}),
		...(recordRef !== undefined ? { record_ref: recordRef } : {}),
	};

	const updated: RunState = {
		...runState,
		current_phase: transition.to,
		status: newStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents(newStatus, transition.to),
		history: [...runState.history, historyEntry],
	};

	try {
		writeRunState(deps.runs, input.runId, updated);
	} catch (cause) {
		// Compensate: if a record was written but state write fails, delete the orphaned record.
		if (recordRef && deps.records) {
			try {
				deps.records.delete(input.runId, recordRef);
			} catch {
				// Best-effort cleanup — ignore secondary failures.
			}
		}
		const message = cause instanceof Error ? cause.message : String(cause);
		return err({
			kind: "record_write_failed",
			message: `Error: run state write failed after record write — ${message}`,
			details: { runId: input.runId, event: input.event },
		});
	}
	return ok(updated);
}
