import assert from "node:assert/strict";
import test from "node:test";
import { recordIdFor, recordIdForGate } from "../lib/record-id-alias.js";
import type { GateRecord } from "../types/gate-records.js";
import type { ApprovalRecord } from "../types/interaction-records.js";

function gate(): GateRecord {
	return {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		status: "pending",
		reason: "x",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["accept", "reject"],
		created_at: "2026-04-18T00:00:00Z",
		resolved_at: null,
		decision_actor: null,
		resolved_response: null,
		event_ids: [],
	};
}

function legacy(): ApprovalRecord {
	return {
		record_id: "approval-r-1",
		record_kind: "approval",
		run_id: "r",
		phase_from: "spec_ready",
		phase_to: "design_draft",
		status: "pending",
		requested_at: "2026-04-18T00:00:00Z",
		decided_at: null,
		decision_actor: null,
		event_ids: [],
	};
}

test("recordIdForGate returns gate.gate_id byte-for-byte", () => {
	assert.equal(recordIdForGate(gate()), "approval-r-1");
});

test("recordIdFor returns gate_id for gate records", () => {
	assert.equal(recordIdFor(gate()), "approval-r-1");
});

test("recordIdFor returns record_id for legacy records unchanged", () => {
	assert.equal(recordIdFor(legacy()), "approval-r-1");
});

test("recordIdFor keeps gate_id === record_id post-migration (same bytes)", () => {
	assert.equal(recordIdFor(gate()), recordIdFor(legacy()));
});
