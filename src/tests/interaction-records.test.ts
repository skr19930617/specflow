import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryInteractionRecordStore } from "../lib/in-memory-interaction-record-store.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";
import { generateRecordId } from "../types/interaction-records.js";

// ---------------------------------------------------------------------------
// generateRecordId
// ---------------------------------------------------------------------------

test("generateRecordId produces <kind>-<runId>-<sequence> format", () => {
	assert.equal(
		generateRecordId("approval", "my-feature-1", 1),
		"approval-my-feature-1-1",
	);
	assert.equal(
		generateRecordId("clarify", "my-feature-1", 3),
		"clarify-my-feature-1-3",
	);
});

test("generateRecordId handles different sequence numbers", () => {
	assert.equal(generateRecordId("approval", "run-1", 10), "approval-run-1-10");
	assert.equal(generateRecordId("clarify", "run-1", 1), "clarify-run-1-1");
});

// ---------------------------------------------------------------------------
// InMemoryInteractionRecordStore
// ---------------------------------------------------------------------------

function makeApprovalRecord(runId: string, recordId: string): ApprovalRecord {
	return {
		record_id: recordId,
		record_kind: "approval",
		run_id: runId,
		phase_from: "spec_ready",
		phase_to: "design_draft",
		status: "pending",
		requested_at: "2026-01-01T00:00:00Z",
		decided_at: null,
		decision_actor: null,
		event_ids: [],
	};
}

function makeClarifyRecord(runId: string, recordId: string): ClarifyRecord {
	return {
		record_id: recordId,
		record_kind: "clarify",
		run_id: runId,
		phase: "proposal_clarify",
		question: "What is the scope?",
		answer: null,
		status: "pending",
		asked_at: "2026-01-01T00:00:00Z",
		answered_at: null,
		event_ids: [],
	};
}

test("InMemory: write and read a record", () => {
	const store = createInMemoryInteractionRecordStore();
	const record = makeApprovalRecord("run-1", "approval-run-1-1");
	store.write("run-1", record);
	const read = store.read("run-1", "approval-run-1-1");
	assert.deepEqual(read, record);
});

test("InMemory: read returns null for non-existent record", () => {
	const store = createInMemoryInteractionRecordStore();
	assert.equal(store.read("run-1", "nonexistent"), null);
});

test("InMemory: list returns all records for a run", () => {
	const store = createInMemoryInteractionRecordStore();
	const a = makeApprovalRecord("run-1", "approval-run-1-1");
	const c = makeClarifyRecord("run-1", "clarify-run-1-2");
	store.write("run-1", a);
	store.write("run-1", c);
	const all = store.list("run-1");
	assert.equal(all.length, 2);
});

test("InMemory: list returns empty array for run with no records", () => {
	const store = createInMemoryInteractionRecordStore();
	assert.deepEqual(store.list("run-1"), []);
});

test("InMemory: list does not return records from other runs", () => {
	const store = createInMemoryInteractionRecordStore();
	store.write("run-1", makeApprovalRecord("run-1", "approval-run-1-1"));
	store.write("run-2", makeApprovalRecord("run-2", "approval-run-2-1"));
	assert.equal(store.list("run-1").length, 1);
	assert.equal(store.list("run-2").length, 1);
});

test("InMemory: write updates an existing record", () => {
	const store = createInMemoryInteractionRecordStore();
	const original = makeApprovalRecord("run-1", "approval-run-1-1");
	store.write("run-1", original);
	const updated: ApprovalRecord = {
		...original,
		status: "approved",
		decided_at: "2026-01-01T01:00:00Z",
	};
	store.write("run-1", updated);
	const read = store.read("run-1", "approval-run-1-1");
	assert.equal(read?.status, "approved");
	assert.equal(read?.decided_at, "2026-01-01T01:00:00Z");
	assert.equal(store.list("run-1").length, 1);
});

test("InMemory: delete removes a record", () => {
	const store = createInMemoryInteractionRecordStore();
	store.write("run-1", makeApprovalRecord("run-1", "approval-run-1-1"));
	store.delete("run-1", "approval-run-1-1");
	assert.equal(store.read("run-1", "approval-run-1-1"), null);
	assert.equal(store.list("run-1").length, 0);
});

test("InMemory: delete on non-existent record is a no-op", () => {
	const store = createInMemoryInteractionRecordStore();
	store.delete("run-1", "nonexistent"); // should not throw
});
