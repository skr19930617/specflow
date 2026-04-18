import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createFakeGateRecordStore } from "../lib/fake-gate-record-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import type { GateRecord } from "../types/gate-records.js";
import {
	ALLOWED_RESPONSES_BY_KIND,
	allowedResponsesFor,
	DEFAULT_ELIGIBLE_ROLES_BY_KIND,
	defaultEligibleRolesFor,
	generateGateId,
	isGateRecordShape,
	isLegacyRecordShape,
	UnmigratedRecordError,
} from "../types/gate-records.js";

// ---------------------------------------------------------------------------
// generateGateId
// ---------------------------------------------------------------------------

test("generateGateId produces <kind>-<runId>-<sequence> format", () => {
	assert.equal(
		generateGateId("approval", "my-feature-1", 1),
		"approval-my-feature-1-1",
	);
	assert.equal(
		generateGateId("clarify", "my-feature-1", 3),
		"clarify-my-feature-1-3",
	);
	assert.equal(
		generateGateId("review_decision", "run-1", 2),
		"review_decision-run-1-2",
	);
});

// ---------------------------------------------------------------------------
// Policy tables
// ---------------------------------------------------------------------------

test("ALLOWED_RESPONSES_BY_KIND matches the workflow-gate-semantics spec", () => {
	assert.deepEqual(ALLOWED_RESPONSES_BY_KIND.approval, ["accept", "reject"]);
	assert.deepEqual(ALLOWED_RESPONSES_BY_KIND.clarify, ["clarify_response"]);
	assert.deepEqual(ALLOWED_RESPONSES_BY_KIND.review_decision, [
		"accept",
		"reject",
		"request_changes",
	]);
});

test("allowedResponsesFor exposes the same fixed table by function", () => {
	assert.deepEqual(allowedResponsesFor("approval"), ["accept", "reject"]);
	assert.deepEqual(allowedResponsesFor("clarify"), ["clarify_response"]);
	assert.deepEqual(allowedResponsesFor("review_decision"), [
		"accept",
		"reject",
		"request_changes",
	]);
});

test("DEFAULT_ELIGIBLE_ROLES_BY_KIND defaults every kind to human-author", () => {
	assert.deepEqual(DEFAULT_ELIGIBLE_ROLES_BY_KIND.approval, ["human-author"]);
	assert.deepEqual(DEFAULT_ELIGIBLE_ROLES_BY_KIND.clarify, ["human-author"]);
	assert.deepEqual(DEFAULT_ELIGIBLE_ROLES_BY_KIND.review_decision, [
		"human-author",
	]);
});

test("defaultEligibleRolesFor returns the policy-table entry", () => {
	assert.deepEqual(defaultEligibleRolesFor("approval"), ["human-author"]);
});

// ---------------------------------------------------------------------------
// Shape guards
// ---------------------------------------------------------------------------

test("isLegacyRecordShape detects ApprovalRecord / ClarifyRecord JSON", () => {
	assert.equal(
		isLegacyRecordShape({ record_kind: "approval", record_id: "x" }),
		true,
	);
	assert.equal(
		isLegacyRecordShape({ record_kind: "clarify", record_id: "x" }),
		true,
	);
});

test("isLegacyRecordShape returns false for GateRecord JSON", () => {
	assert.equal(
		isLegacyRecordShape({ gate_kind: "approval", gate_id: "g1" }),
		false,
	);
});

test("isLegacyRecordShape returns false for unrelated objects", () => {
	assert.equal(isLegacyRecordShape({}), false);
	assert.equal(isLegacyRecordShape(null), false);
	assert.equal(isLegacyRecordShape("string"), false);
});

test("isGateRecordShape requires gate_id, gate_kind, and required arrays", () => {
	const valid: GateRecord = makeApprovalGate("run-1", "approval-run-1-1");
	assert.equal(isGateRecordShape(valid), true);
	assert.equal(isGateRecordShape({ gate_id: "x" }), false);
});

// ---------------------------------------------------------------------------
// UnmigratedRecordError
// ---------------------------------------------------------------------------

test("UnmigratedRecordError captures the offending path", () => {
	const err = new UnmigratedRecordError("/path/to/legacy.json");
	assert.equal(err.name, "UnmigratedRecordError");
	assert.equal(err.gate_id_or_path, "/path/to/legacy.json");
	assert.match(err.message, /specflow-migrate-records/);
});

// ---------------------------------------------------------------------------
// FakeGateRecordStore
// ---------------------------------------------------------------------------

function makeApprovalGate(runId: string, gateId: string): GateRecord {
	return {
		gate_id: gateId,
		gate_kind: "approval",
		run_id: runId,
		originating_phase: "spec_ready",
		status: "pending",
		reason: "Spec acceptance required",
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

function makeClarifyGate(runId: string, gateId: string): GateRecord {
	return {
		gate_id: gateId,
		gate_kind: "clarify",
		run_id: runId,
		originating_phase: "proposal_clarify",
		status: "pending",
		reason: "Clarification needed",
		payload: {
			kind: "clarify",
			question: "What is the scope?",
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["clarify_response"],
		created_at: "2026-04-18T00:00:00Z",
		resolved_at: null,
		decision_actor: null,
		resolved_response: null,
		event_ids: [],
	};
}

test("FakeGateRecordStore.write + read roundtrips a record", () => {
	const store = createFakeGateRecordStore();
	const g = makeApprovalGate("run-1", "approval-run-1-1");
	store.write("run-1", g);
	assert.deepEqual(store.read("run-1", g.gate_id), g);
});

test("FakeGateRecordStore.read returns null for missing gate", () => {
	const store = createFakeGateRecordStore();
	assert.equal(store.read("run-1", "missing"), null);
});

test("FakeGateRecordStore.write replaces an existing record", () => {
	const store = createFakeGateRecordStore();
	const g = makeApprovalGate("run-1", "approval-run-1-1");
	store.write("run-1", g);
	const updated: GateRecord = {
		...g,
		status: "resolved",
		resolved_at: "2026-04-18T01:00:00Z",
		resolved_response: "accept",
	};
	store.write("run-1", updated);
	assert.equal(store.read("run-1", g.gate_id)?.status, "resolved");
});

test("FakeGateRecordStore.list returns all records for a run", () => {
	const store = createFakeGateRecordStore();
	store.write("run-1", makeApprovalGate("run-1", "approval-run-1-1"));
	store.write("run-1", makeClarifyGate("run-1", "clarify-run-1-1"));
	store.write("run-1", makeClarifyGate("run-1", "clarify-run-1-2"));
	const listed = store.list("run-1");
	assert.equal(listed.length, 3);
});

test("FakeGateRecordStore.list isolates runs", () => {
	const store = createFakeGateRecordStore();
	store.write("run-1", makeApprovalGate("run-1", "approval-run-1-1"));
	store.write("run-2", makeApprovalGate("run-2", "approval-run-2-1"));
	assert.equal(store.list("run-1").length, 1);
	assert.equal(store.list("run-2").length, 1);
});

test("FakeGateRecordStore has no delete API", () => {
	const store = createFakeGateRecordStore();
	// The type itself forbids `delete`; at runtime we confirm the property is absent.
	assert.equal(
		Object.hasOwn(store, "delete"),
		false,
		"GateRecordStore must not expose a delete operation",
	);
});

// ---------------------------------------------------------------------------
// LocalFsGateRecordStore
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
	const dir = mkdtempSync(resolve(tmpdir(), "specflow-gate-test-"));
	return dir;
}

test("LocalFsGateRecordStore.write + read uses records/<gateId>.json", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		const g = makeApprovalGate("my-feature-1", "approval-my-feature-1-1");
		store.write("my-feature-1", g);
		const round = store.read("my-feature-1", g.gate_id);
		assert.deepEqual(round, g);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.read returns null for non-existent gate", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		assert.equal(store.read("my-feature-1", "missing"), null);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.list returns empty for missing run directory", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		assert.deepEqual(store.list("never-existed"), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.list returns all .json records in order", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		store.write("r", makeApprovalGate("r", "approval-r-1"));
		store.write("r", makeClarifyGate("r", "clarify-r-1"));
		store.write("r", makeClarifyGate("r", "clarify-r-2"));
		const listed = store.list("r");
		assert.equal(listed.length, 3);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.read throws UnmigratedRecordError on legacy file", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			resolve(dir, "approval-r-1.json"),
			JSON.stringify({
				record_id: "approval-r-1",
				record_kind: "approval",
				run_id: "r",
			}),
		);
		const store = createLocalFsGateRecordStore(root);
		assert.throws(
			() => store.read("r", "approval-r-1"),
			(err: unknown) => err instanceof UnmigratedRecordError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.list throws UnmigratedRecordError if any file is legacy-shaped", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		const store = createLocalFsGateRecordStore(root);
		// write one valid GateRecord
		store.write("r", makeApprovalGate("r", "approval-r-1"));
		// write one legacy shape
		writeFileSync(
			resolve(dir, "approval-r-2.json"),
			JSON.stringify({
				record_id: "approval-r-2",
				record_kind: "approval",
				run_id: "r",
			}),
		);
		assert.throws(
			() => store.list("r"),
			(err: unknown) => err instanceof UnmigratedRecordError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.list skips dot-prefixed files (journal/sentinel)", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		const store = createLocalFsGateRecordStore(root);
		store.write("r", makeApprovalGate("r", "approval-r-1"));
		// Simulate .migrated sentinel and .supersede-intent.json
		writeFileSync(resolve(dir, ".migrated"), "ok");
		writeFileSync(
			resolve(dir, ".supersede-intent.json"),
			JSON.stringify({ old: null, new: null }),
		);
		const listed = store.list("r");
		assert.equal(listed.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore.write uses atomic rename (no .tmp remnants)", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		store.write("r", makeApprovalGate("r", "approval-r-1"));
		// After a successful write, there should be exactly one .json file and no stray .tmp files.
		const dir = resolve(root, ".specflow/runs/r/records");
		const entries = readdirSync(dir).filter((f: string) => f.endsWith(".tmp"));
		assert.equal(entries.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("LocalFsGateRecordStore has no delete API", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		assert.equal(
			Object.hasOwn(store, "delete"),
			false,
			"GateRecordStore must not expose a delete operation",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
