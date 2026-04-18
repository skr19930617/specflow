import assert from "node:assert/strict";
import test from "node:test";
import type { RecordMutation } from "../core/types.js";
import { createFakeGateRecordStore } from "../lib/fake-gate-record-store.js";
import {
	gateRecordsToInteractionRecords,
	mirrorMutationsToGateStore,
	translateToGateRecord,
} from "../lib/gate-mutation-bridge.js";
import type { GateRecord } from "../types/gate-records.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";

function approvalRec(status: ApprovalRecord["status"]): ApprovalRecord {
	return {
		record_id: "approval-r-1",
		record_kind: "approval",
		run_id: "r",
		phase_from: "spec_ready",
		phase_to: "design_draft",
		status,
		requested_at: "2026-04-01T00:00:00Z",
		decided_at: status === "pending" ? null : "2026-04-01T01:00:00Z",
		decision_actor:
			status === "pending" ? null : { actor: "human", actor_id: "yuki" },
		event_ids: ["evt-1"],
	};
}

function clarifyRec(status: ClarifyRecord["status"]): ClarifyRecord {
	return {
		record_id: "clarify-r-1",
		record_kind: "clarify",
		run_id: "r",
		phase: "proposal_clarify",
		question: "q?",
		answer: status === "resolved" ? "a." : null,
		status,
		asked_at: "2026-04-02T00:00:00Z",
		answered_at: status === "resolved" ? "2026-04-02T01:00:00Z" : null,
		event_ids: ["evt-2"],
	};
}

test("translateToGateRecord maps pending ApprovalRecord to pending GateRecord", () => {
	const g = translateToGateRecord(approvalRec("pending"));
	assert.equal(g.gate_kind, "approval");
	assert.equal(g.status, "pending");
	assert.equal(g.gate_id, "approval-r-1");
	assert.equal(g.payload.kind, "approval");
});

test("translateToGateRecord maps approved ApprovalRecord to resolved GateRecord with resolved_response=accept", () => {
	const g = translateToGateRecord(approvalRec("approved"));
	assert.equal(g.status, "resolved");
	assert.equal(g.resolved_response, "accept");
	assert.equal(g.decision_actor?.actor_id, "yuki");
});

test("translateToGateRecord maps rejected ApprovalRecord to resolved GateRecord with resolved_response=reject", () => {
	const g = translateToGateRecord(approvalRec("rejected"));
	assert.equal(g.status, "resolved");
	assert.equal(g.resolved_response, "reject");
});

test("translateToGateRecord maps clarify records with answer carried in payload", () => {
	const g = translateToGateRecord(clarifyRec("resolved"));
	assert.equal(g.gate_kind, "clarify");
	assert.equal(g.status, "resolved");
	if (g.payload.kind === "clarify") {
		assert.equal(g.payload.answer, "a.");
	} else {
		assert.fail("payload kind mismatch");
	}
});

test("mirrorMutationsToGateStore writes equivalent GateRecord per create mutation", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRec("pending") },
		{ kind: "update", record: approvalRec("approved") },
	];
	const errors = mirrorMutationsToGateStore(store, "r", mutations);
	assert.equal(errors.length, 0);
	const listed = store.list("r");
	// Both mutations target the same gate_id; the second write replaces the first.
	assert.equal(listed.length, 1);
	assert.equal(listed[0].status, "resolved");
	assert.equal(listed[0].resolved_response, "accept");
});

test("mirrorMutationsToGateStore translates delete of pending gate to superseded status", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRec("pending") },
		{ kind: "delete", recordId: "approval-r-1" },
	];
	const errors = mirrorMutationsToGateStore(store, "r", mutations);
	assert.equal(errors.length, 0);
	const listed = store.list("r");
	// delete is translated to superseded; the gate record remains for audit.
	assert.equal(listed.length, 1);
	assert.equal(listed[0].status, "superseded");
	assert.equal(listed[0].resolved_response, null);
});

test("mirrorMutationsToGateStore delete of already-resolved gate is a no-op", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRec("approved") },
		{ kind: "delete", recordId: "approval-r-1" },
	];
	const errors = mirrorMutationsToGateStore(store, "r", mutations);
	assert.equal(errors.length, 0);
	const listed = store.list("r");
	assert.equal(listed.length, 1);
	// Already resolved — delete does not change status.
	assert.equal(listed[0].status, "resolved");
});

test("mirrorMutationsToGateStore returns per-mutation errors without aborting batch", () => {
	// Use a store that throws on a specific gate_id write.
	const inner = createFakeGateRecordStore();
	const failingStore: import("../lib/gate-record-store.js").GateRecordStore = {
		write(runId: string, record: GateRecord): void {
			if (record.gate_id === "clarify-r-1") {
				throw new Error("disk full");
			}
			inner.write(runId, record);
		},
		read: inner.read.bind(inner),
		list: inner.list.bind(inner),
	};
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRec("pending") },
		{ kind: "create", record: clarifyRec("pending") },
	];
	const errors = mirrorMutationsToGateStore(failingStore, "r", mutations);
	// First mutation succeeds, second fails.
	assert.equal(errors.length, 1);
	assert.equal(errors[0].recordId, "clarify-r-1");
	// The first mutation's record should still be present.
	assert.equal(inner.list("r").length, 1);
	assert.equal(inner.list("r")[0].gate_id, "approval-r-1");
});

// ---------------------------------------------------------------------------
// Reverse bridge: GateRecord → InteractionRecord
// ---------------------------------------------------------------------------

function makeApprovalGate(
	status: GateRecord["status"],
	response: string | null = null,
): GateRecord {
	return {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		status,
		reason: "Approval required",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["accept", "reject"],
		created_at: "2026-04-01T00:00:00Z",
		resolved_at: status === "pending" ? null : "2026-04-01T01:00:00Z",
		decision_actor:
			status === "pending" ? null : { actor: "human", actor_id: "yuki" },
		resolved_response: response,
		event_ids: ["evt-1"],
	};
}

function makeClarifyGate(
	status: GateRecord["status"],
	answer?: string,
): GateRecord {
	return {
		gate_id: "clarify-r-1",
		gate_kind: "clarify",
		run_id: "r",
		originating_phase: "proposal_clarify",
		status,
		reason: "Clarification requested",
		payload: {
			kind: "clarify",
			question: "q?",
			...(answer !== undefined ? { answer } : {}),
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["clarify_response"],
		created_at: "2026-04-02T00:00:00Z",
		resolved_at: status === "pending" ? null : "2026-04-02T01:00:00Z",
		decision_actor: null,
		resolved_response: status === "resolved" ? "clarify_response" : null,
		event_ids: ["evt-2"],
	};
}

test("gateRecordsToInteractionRecords translates pending approval gate to pending ApprovalRecord", () => {
	const records = gateRecordsToInteractionRecords([
		makeApprovalGate("pending"),
	]);
	assert.equal(records.length, 1);
	const rec = records[0];
	assert.equal(rec.record_kind, "approval");
	assert.equal(rec.record_id, "approval-r-1");
	if (rec.record_kind === "approval") {
		assert.equal(rec.status, "pending");
		assert.equal(rec.phase_from, "spec_ready");
		assert.equal(rec.phase_to, "design_draft");
	}
});

test("gateRecordsToInteractionRecords translates resolved+accept gate to approved ApprovalRecord", () => {
	const records = gateRecordsToInteractionRecords([
		makeApprovalGate("resolved", "accept"),
	]);
	assert.equal(records.length, 1);
	if (records[0].record_kind === "approval") {
		assert.equal(records[0].status, "approved");
	}
});

test("gateRecordsToInteractionRecords translates resolved+reject gate to rejected ApprovalRecord", () => {
	const records = gateRecordsToInteractionRecords([
		makeApprovalGate("resolved", "reject"),
	]);
	if (records[0].record_kind === "approval") {
		assert.equal(records[0].status, "rejected");
	}
});

test("gateRecordsToInteractionRecords translates superseded gate to rejected ApprovalRecord", () => {
	const records = gateRecordsToInteractionRecords([
		makeApprovalGate("superseded"),
	]);
	if (records[0].record_kind === "approval") {
		assert.equal(records[0].status, "rejected");
	}
});

test("gateRecordsToInteractionRecords translates clarify gate with answer", () => {
	const records = gateRecordsToInteractionRecords([
		makeClarifyGate("resolved", "Because."),
	]);
	assert.equal(records.length, 1);
	if (records[0].record_kind === "clarify") {
		assert.equal(records[0].status, "resolved");
		assert.equal(records[0].answer, "Because.");
		assert.equal(records[0].question, "q?");
	}
});

test("gateRecordsToInteractionRecords excludes review_decision gates", () => {
	const reviewGate: GateRecord = {
		gate_id: "review_decision-r-1",
		gate_kind: "review_decision",
		run_id: "r",
		originating_phase: "design_review",
		status: "pending",
		reason: "round 1",
		payload: {
			kind: "review_decision",
			review_round_id: "rd-1",
			findings: [],
			reviewer_actor: "ai-agent",
			reviewer_actor_id: "codex",
			approval_binding: "advisory",
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["accept", "reject", "request_changes"],
		created_at: "2026-04-18T00:00:00Z",
		resolved_at: null,
		decision_actor: null,
		resolved_response: null,
		event_ids: [],
	};
	const records = gateRecordsToInteractionRecords([
		makeApprovalGate("pending"),
		reviewGate,
		makeClarifyGate("pending"),
	]);
	// review_decision has no legacy equivalent; should be excluded.
	assert.equal(records.length, 2);
	assert.ok(
		records.every((r) => r.record_kind !== ("review_decision" as string)),
	);
});
