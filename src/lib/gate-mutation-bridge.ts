// Bridge: translate legacy RecordMutation[] (ApprovalRecord/ClarifyRecord)
// into GateRecord writes so the runtime emits both shapes during the transition
// period described by workflow-gate-semantics.
//
// This is a short-lived compatibility helper. Once the transition to
// GateRecord is complete across the whole pipeline, the legacy path can be
// deleted and this bridge along with it.

import type { RecordMutation } from "../core/types.js";
import type {
	ApprovalGatePayload,
	ClarifyGatePayload,
	GateRecord,
} from "../types/gate-records.js";
import type {
	ApprovalRecord,
	ApprovalStatus,
	ClarifyRecord,
	InteractionRecord,
} from "../types/interaction-records.js";
import type { GateRecordStore } from "./gate-record-store.js";

/**
 * Apply every mutation against the GateRecordStore by translating legacy
 * record shapes to GateRecord shapes byte-for-byte (gate_id === record_id).
 *
 * Delete mutations are translated to a `superseded` status write so the gate
 * remains in history (GateRecordStore has no delete API). If the gate is
 * already resolved or superseded, the delete is a no-op.
 *
 * Each mutation is applied independently so that one failed write does not
 * suppress the rest of the batch. Callers receive an array of per-mutation
 * errors (empty on full success).
 */
export function mirrorMutationsToGateStore(
	store: GateRecordStore,
	runId: string,
	mutations: readonly RecordMutation[],
): readonly MirrorMutationError[] {
	const errors: MirrorMutationError[] = [];
	for (const mutation of mutations) {
		try {
			if (mutation.kind === "delete") {
				applyDeleteAsSupersedeWrite(store, runId, mutation.recordId);
			} else {
				const gate = translateToGateRecord(mutation.record);
				store.write(runId, gate);
			}
		} catch (cause) {
			errors.push({
				kind: mutation.kind,
				recordId:
					mutation.kind === "delete"
						? mutation.recordId
						: mutation.record.record_id,
				error: cause instanceof Error ? cause : new Error(String(cause)),
			});
		}
	}
	return errors;
}

export interface MirrorMutationError {
	readonly kind: string;
	readonly recordId: string;
	readonly error: Error;
}

/**
 * Translate a legacy delete mutation into a `superseded` status write.
 * If the gate is already resolved or superseded, the delete is a no-op.
 * If the gate does not exist, this is also a no-op (idempotent).
 */
function applyDeleteAsSupersedeWrite(
	store: GateRecordStore,
	runId: string,
	recordId: string,
): void {
	const existing = store.read(runId, recordId);
	if (!existing) return;
	if (existing.status !== "pending") return;
	const superseded: GateRecord = {
		...existing,
		status: "superseded",
		resolved_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
		resolved_response: null,
	};
	store.write(runId, superseded);
}

export function translateToGateRecord(record: InteractionRecord): GateRecord {
	if (record.record_kind === "approval") {
		return translateApproval(record);
	}
	return translateClarify(record);
}

function translateApproval(rec: ApprovalRecord): GateRecord {
	const status: GateRecord["status"] =
		rec.status === "pending" ? "pending" : "resolved";
	const resolvedResponse: string | null =
		rec.status === "approved"
			? "accept"
			: rec.status === "rejected"
				? "reject"
				: null;
	return {
		gate_id: rec.record_id,
		gate_kind: "approval",
		run_id: rec.run_id,
		originating_phase: rec.phase_from,
		status,
		reason: `Approval required to move from ${rec.phase_from} to ${rec.phase_to}`,
		payload: {
			kind: "approval",
			phase_from: rec.phase_from,
			phase_to: rec.phase_to,
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["accept", "reject"],
		created_at: rec.requested_at,
		resolved_at: rec.decided_at,
		decision_actor: rec.decision_actor,
		resolved_response: resolvedResponse,
		event_ids: [...rec.event_ids],
	};
}

function translateClarify(rec: ClarifyRecord): GateRecord {
	const status: GateRecord["status"] =
		rec.status === "pending" ? "pending" : "resolved";
	return {
		gate_id: rec.record_id,
		gate_kind: "clarify",
		run_id: rec.run_id,
		originating_phase: rec.phase,
		status,
		reason: "Clarification requested",
		payload: {
			kind: "clarify",
			question: rec.question,
			question_context: rec.question_context,
			answer: rec.answer ?? undefined,
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["clarify_response"],
		created_at: rec.asked_at,
		resolved_at: rec.answered_at,
		decision_actor: null,
		resolved_response: rec.status === "resolved" ? "clarify_response" : null,
		event_ids: [...rec.event_ids],
	};
}

// ---------------------------------------------------------------------------
// Reverse bridge: GateRecord → InteractionRecord
// ---------------------------------------------------------------------------

/**
 * Translate gate records back to InteractionRecord shapes for backward-compatible
 * reads by the core runtime. `review_decision` gates have no legacy equivalent
 * and are excluded from the result.
 */
export function gateRecordsToInteractionRecords(
	gates: readonly GateRecord[],
): readonly InteractionRecord[] {
	const results: InteractionRecord[] = [];
	for (const gate of gates) {
		const record = gateToInteractionRecord(gate);
		if (record !== null) {
			results.push(record);
		}
	}
	return results;
}

function gateToInteractionRecord(gate: GateRecord): InteractionRecord | null {
	if (gate.gate_kind === "approval") {
		return gateToApprovalRecord(gate);
	}
	if (gate.gate_kind === "clarify") {
		return gateToClarifyRecord(gate);
	}
	// review_decision has no legacy InteractionRecord equivalent
	return null;
}

function gateToApprovalRecord(gate: GateRecord): ApprovalRecord {
	const payload = gate.payload as ApprovalGatePayload;
	let status: ApprovalStatus;
	if (gate.status === "pending") {
		status = "pending";
	} else if (gate.resolved_response === "accept") {
		status = "approved";
	} else {
		// resolved+reject and superseded both map to "rejected" (terminal)
		status = "rejected";
	}
	return {
		record_id: gate.gate_id,
		record_kind: "approval",
		run_id: gate.run_id,
		phase_from: payload.phase_from,
		phase_to: payload.phase_to,
		status,
		requested_at: gate.created_at,
		decided_at: gate.resolved_at,
		decision_actor: gate.decision_actor,
		event_ids: [...gate.event_ids],
	};
}

function gateToClarifyRecord(gate: GateRecord): ClarifyRecord {
	const payload = gate.payload as ClarifyGatePayload;
	return {
		record_id: gate.gate_id,
		record_kind: "clarify",
		run_id: gate.run_id,
		phase: gate.originating_phase,
		question: payload.question,
		...(payload.question_context
			? { question_context: payload.question_context }
			: {}),
		answer: payload.answer ?? null,
		status: gate.status === "pending" ? "pending" : "resolved",
		asked_at: gate.created_at,
		answered_at: gate.resolved_at,
		event_ids: [...gate.event_ids],
	};
}
