import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createFakeGateRecordStore } from "../lib/fake-gate-record-store.js";
import {
	GateRuntimeError,
	issueGate,
	listRunsWithPendingIntent,
	recoverPendingIntent,
	resolveGate,
} from "../lib/gate-runtime.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import type { GateRecord } from "../types/gate-records.js";
import { generateGateId } from "../types/gate-records.js";

function makeTempRepo(): string {
	return mkdtempSync(resolve(tmpdir(), "specflow-gate-rt-test-"));
}

// --- issueGate: basic paths -------------------------------------------------

test("issueGate creates a pending approval gate with default roles and allowed_responses", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp/doesntmatter", {
		gate_id: generateGateId("approval", "r", 1),
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		reason: "spec acceptance",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		created_at: "2026-04-18T00:00:00Z",
	});
	assert.equal(g.status, "pending");
	assert.deepEqual([...g.eligible_responder_roles], ["human-author"]);
	assert.deepEqual([...g.allowed_responses], ["accept", "reject"]);
});

test("issueGate for clarify allows multiple concurrent pending gates in same phase (no supersede)", () => {
	const store = createFakeGateRecordStore();
	issueGate(store, "/tmp", {
		gate_id: "clarify-r-1",
		gate_kind: "clarify",
		run_id: "r",
		originating_phase: "proposal_clarify",
		reason: "q1",
		payload: { kind: "clarify", question: "q1" },
		created_at: "2026-04-18T00:00:00Z",
	});
	issueGate(store, "/tmp", {
		gate_id: "clarify-r-2",
		gate_kind: "clarify",
		run_id: "r",
		originating_phase: "proposal_clarify",
		reason: "q2",
		payload: { kind: "clarify", question: "q2" },
		created_at: "2026-04-18T00:00:01Z",
	});
	const pending = store
		.list("r")
		.filter((g) => g.gate_kind === "clarify" && g.status === "pending");
	assert.equal(pending.length, 2);
});

// --- issueGate: supersede for approval/review_decision ----------------------

test("issueGate supersedes the prior pending approval gate in same phase", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		const first = issueGate(store, root, {
			gate_id: "approval-r-1",
			gate_kind: "approval",
			run_id: "r",
			originating_phase: "spec_ready",
			reason: "r1",
			payload: {
				kind: "approval",
				phase_from: "spec_ready",
				phase_to: "design_draft",
			},
			created_at: "2026-04-18T00:00:00Z",
		});
		const second = issueGate(store, root, {
			gate_id: "approval-r-2",
			gate_kind: "approval",
			run_id: "r",
			originating_phase: "spec_ready",
			reason: "r2",
			payload: {
				kind: "approval",
				phase_from: "spec_ready",
				phase_to: "design_draft",
			},
			created_at: "2026-04-18T00:00:01Z",
		});
		const all = store.list("r");
		const byId = new Map(all.map((g) => [g.gate_id, g]));
		assert.equal(byId.get(first.gate_id)?.status, "superseded");
		assert.equal(byId.get(second.gate_id)?.status, "pending");
		// lock released
		assert.equal(
			existsSync(resolve(root, ".specflow/runs/r/records/.gate-lock")),
			false,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("issueGate supersedes the prior pending review_decision gate in same phase", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		const first = issueGate(store, root, {
			gate_id: "review_decision-r-1",
			gate_kind: "review_decision",
			run_id: "r",
			originating_phase: "design_review",
			reason: "round 1",
			payload: {
				kind: "review_decision",
				review_round_id: "rd-1",
				findings: [],
				reviewer_actor: "ai-agent",
				reviewer_actor_id: "codex",
				approval_binding: "advisory",
			},
			created_at: "2026-04-18T00:00:00Z",
		});
		const second = issueGate(store, root, {
			gate_id: "review_decision-r-2",
			gate_kind: "review_decision",
			run_id: "r",
			originating_phase: "design_review",
			reason: "round 2",
			payload: {
				kind: "review_decision",
				review_round_id: "rd-2",
				findings: [],
				reviewer_actor: "ai-agent",
				reviewer_actor_id: "codex",
				approval_binding: "advisory",
			},
			created_at: "2026-04-18T00:00:01Z",
		});
		const all = store.list("r");
		const byId = new Map(all.map((g) => [g.gate_id, g]));
		assert.equal(byId.get(first.gate_id)?.status, "superseded");
		assert.equal(byId.get(second.gate_id)?.status, "pending");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- resolveGate: success + validation --------------------------------------

test("resolveGate resolves an approval gate with accept", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp", {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		reason: "x",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		created_at: "2026-04-18T00:00:00Z",
	});
	const resolved = resolveGate(store, {
		run_id: "r",
		gate_id: g.gate_id,
		response: "accept",
		actor: { actor: "human", actor_id: "yuki" },
		actor_role: "human-author",
		resolved_at: "2026-04-18T01:00:00Z",
	});
	assert.equal(resolved.status, "resolved");
	assert.equal(resolved.resolved_response, "accept");
	assert.equal(resolved.decision_actor?.actor_id, "yuki");
});

test("resolveGate stores clarify answer in payload", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp", {
		gate_id: "clarify-r-1",
		gate_kind: "clarify",
		run_id: "r",
		originating_phase: "proposal_clarify",
		reason: "q",
		payload: { kind: "clarify", question: "What?" },
		created_at: "2026-04-18T00:00:00Z",
	});
	const resolved = resolveGate(store, {
		run_id: "r",
		gate_id: g.gate_id,
		response: "clarify_response",
		actor: { actor: "human", actor_id: "yuki" },
		actor_role: "human-author",
		resolved_at: "2026-04-18T01:00:00Z",
		answer: "Because.",
	});
	assert.equal(resolved.status, "resolved");
	assert.equal(resolved.payload.kind, "clarify");
	if (resolved.payload.kind === "clarify") {
		assert.equal(resolved.payload.answer, "Because.");
	}
});

test("resolveGate rejects an invalid response and leaves gate pending", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp", {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		reason: "x",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		created_at: "2026-04-18T00:00:00Z",
	});
	assert.throws(
		() =>
			resolveGate(store, {
				run_id: "r",
				gate_id: g.gate_id,
				response: "request_changes",
				actor: { actor: "human", actor_id: "yuki" },
				actor_role: "human-author",
				resolved_at: "2026-04-18T01:00:00Z",
			}),
		(err: unknown) =>
			err instanceof GateRuntimeError && err.kind === "invalid_response",
	);
	const after = store.read("r", g.gate_id);
	assert.equal(after?.status, "pending");
});

test("resolveGate rejects a response from an ineligible role", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp", {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		reason: "x",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		created_at: "2026-04-18T00:00:00Z",
	});
	assert.throws(
		() =>
			resolveGate(store, {
				run_id: "r",
				gate_id: g.gate_id,
				response: "accept",
				actor: { actor: "ai-agent", actor_id: "codex" },
				actor_role: "ai-agent",
				resolved_at: "2026-04-18T01:00:00Z",
			}),
		(err: unknown) =>
			err instanceof GateRuntimeError && err.kind === "role_not_eligible",
	);
});

test("resolveGate rejects a response to a non-pending gate", () => {
	const store = createFakeGateRecordStore();
	const g = issueGate(store, "/tmp", {
		gate_id: "approval-r-1",
		gate_kind: "approval",
		run_id: "r",
		originating_phase: "spec_ready",
		reason: "x",
		payload: {
			kind: "approval",
			phase_from: "spec_ready",
			phase_to: "design_draft",
		},
		created_at: "2026-04-18T00:00:00Z",
	});
	// resolve once
	resolveGate(store, {
		run_id: "r",
		gate_id: g.gate_id,
		response: "accept",
		actor: { actor: "human", actor_id: "yuki" },
		actor_role: "human-author",
		resolved_at: "2026-04-18T01:00:00Z",
	});
	// second resolution should fail
	assert.throws(
		() =>
			resolveGate(store, {
				run_id: "r",
				gate_id: g.gate_id,
				response: "reject",
				actor: { actor: "human", actor_id: "yuki" },
				actor_role: "human-author",
				resolved_at: "2026-04-18T02:00:00Z",
			}),
		(err: unknown) =>
			err instanceof GateRuntimeError && err.kind === "gate_not_pending",
	);
});

// --- Intent journal recovery ------------------------------------------------

test("recoverPendingIntent replays a leftover supersede intent", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		// Pretend a prior issueGate crashed after writing only the intent journal.
		// Seed the run so the records directory exists.
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		const newRecord: GateRecord = {
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
		const intent = {
			version: 1,
			kind: "supersede",
			old_gate: null,
			new_gate: newRecord,
		};
		writeFileSync(
			resolve(dir, ".supersede-intent.json"),
			JSON.stringify(intent),
		);

		assert.deepEqual(listRunsWithPendingIntent(root), ["r"]);
		recoverPendingIntent(store, root, "r");
		// new_gate should be materialized and intent cleared
		const read = store.read("r", "approval-r-1");
		assert.equal(read?.status, "pending");
		assert.equal(existsSync(resolve(dir, ".supersede-intent.json")), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- Lock staleness ---------------------------------------------------------

test("issueGate breaks a stale lock and continues", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		// Pre-create a stale .gate-lock (timestamp way in the past)
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, ".gate-lock"), `99999:0`);
		const g = issueGate(store, root, {
			gate_id: "approval-r-1",
			gate_kind: "approval",
			run_id: "r",
			originating_phase: "spec_ready",
			reason: "x",
			payload: {
				kind: "approval",
				phase_from: "spec_ready",
				phase_to: "design_draft",
			},
			created_at: "2026-04-18T00:00:00Z",
		});
		assert.equal(g.status, "pending");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
