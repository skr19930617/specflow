import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createFakeGateRecordStore } from "../lib/fake-gate-record-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import type { ReviewRoundProvenance } from "../lib/review-decision-gate.js";
import {
	buildReviewDecisionGateInput,
	findReviewDecisionGateByRoundId,
	issueReviewDecisionGate,
} from "../lib/review-decision-gate.js";
import type { ReviewFindingSnapshot } from "../types/gate-records.js";

function makeTempRepo(): string {
	return mkdtempSync(resolve(tmpdir(), "specflow-rdg-test-"));
}

function samplefindings(): ReviewFindingSnapshot[] {
	return [
		{ id: "P1", severity: "high", status: "new", title: "Find 1" },
		{ id: "P2", severity: "medium", status: "new", title: "Find 2" },
	];
}

function sampleRound(
	phase: ReviewRoundProvenance["review_phase"],
	roundId: string,
): ReviewRoundProvenance {
	return {
		run_id: "r",
		review_phase: phase,
		review_round_id: roundId,
		findings: samplefindings(),
		reviewer_actor: "ai-agent",
		reviewer_actor_id: "codex",
		approval_binding: "advisory",
	};
}

// --- payload construction ---------------------------------------------------

test("buildReviewDecisionGateInput carries full round provenance in payload", () => {
	const input = buildReviewDecisionGateInput(
		sampleRound("design_review", "rd-1"),
		"review_decision-r-1",
		"2026-04-18T00:00:00Z",
	);
	assert.equal(input.gate_kind, "review_decision");
	assert.equal(input.originating_phase, "design_review");
	assert.equal(input.payload.kind, "review_decision");
	if (input.payload.kind === "review_decision") {
		assert.equal(input.payload.review_round_id, "rd-1");
		assert.equal(input.payload.findings.length, 2);
		assert.equal(input.payload.reviewer_actor, "ai-agent");
		assert.equal(input.payload.reviewer_actor_id, "codex");
		assert.equal(input.payload.approval_binding, "advisory");
	}
});

test("buildReviewDecisionGateInput omits eligible_responder_roles so default policy (human-author) applies", () => {
	const input = buildReviewDecisionGateInput(
		sampleRound("design_review", "rd-1"),
		"review_decision-r-1",
		"2026-04-18T00:00:00Z",
	);
	assert.equal(input.eligible_responder_roles, undefined);
});

// --- issuance round-trip ----------------------------------------------------

test("issueReviewDecisionGate writes exactly one pending review_decision gate", () => {
	const store = createFakeGateRecordStore();
	const gate = issueReviewDecisionGate(sampleRound("design_review", "rd-1"), {
		store,
		projectRoot: "/tmp",
		gateId: "review_decision-r-1",
		createdAt: "2026-04-18T00:00:00Z",
	});
	assert.equal(gate.status, "pending");
	// human-author only, per default policy
	assert.deepEqual([...gate.eligible_responder_roles], ["human-author"]);
	const pending = store
		.list("r")
		.filter((g) => g.status === "pending" && g.gate_kind === "review_decision");
	assert.equal(pending.length, 1);
});

test("issueReviewDecisionGate for the same phase supersedes the previous pending gate", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsGateRecordStore(root);
		issueReviewDecisionGate(sampleRound("design_review", "rd-1"), {
			store,
			projectRoot: root,
			gateId: "review_decision-r-1",
			createdAt: "2026-04-18T00:00:00Z",
		});
		issueReviewDecisionGate(sampleRound("design_review", "rd-2"), {
			store,
			projectRoot: root,
			gateId: "review_decision-r-2",
			createdAt: "2026-04-18T00:00:01Z",
		});
		const listed = store.list("r");
		const byId = new Map(listed.map((g) => [g.gate_id, g]));
		assert.equal(byId.get("review_decision-r-1")?.status, "superseded");
		assert.equal(byId.get("review_decision-r-2")?.status, "pending");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("findReviewDecisionGateByRoundId locates the gate for a given review_round_id", () => {
	const store = createFakeGateRecordStore();
	issueReviewDecisionGate(sampleRound("apply_review", "rd-apply-7"), {
		store,
		projectRoot: "/tmp",
		gateId: "review_decision-r-10",
		createdAt: "2026-04-18T00:00:00Z",
	});
	const found = findReviewDecisionGateByRoundId(store.list("r"), "rd-apply-7");
	assert.ok(found);
	assert.equal(found?.gate_id, "review_decision-r-10");
});

test("proposal_challenge and design_review and apply_review each accept one gate per round", () => {
	const store = createFakeGateRecordStore();
	issueReviewDecisionGate(sampleRound("proposal_challenge", "rd-p1"), {
		store,
		projectRoot: "/tmp",
		gateId: "review_decision-r-1",
		createdAt: "2026-04-18T00:00:00Z",
	});
	issueReviewDecisionGate(sampleRound("design_review", "rd-d1"), {
		store,
		projectRoot: "/tmp",
		gateId: "review_decision-r-2",
		createdAt: "2026-04-18T00:00:01Z",
	});
	issueReviewDecisionGate(sampleRound("apply_review", "rd-a1"), {
		store,
		projectRoot: "/tmp",
		gateId: "review_decision-r-3",
		createdAt: "2026-04-18T00:00:02Z",
	});
	const pending = store
		.list("r")
		.filter((g) => g.gate_kind === "review_decision" && g.status === "pending");
	assert.equal(pending.length, 3);
	assert.deepEqual(
		new Set(pending.map((g) => g.originating_phase)),
		new Set(["proposal_challenge", "design_review", "apply_review"]),
	);
});

test("eligible_responder_roles is ['human-author'] for every review_decision gate", () => {
	const store = createFakeGateRecordStore();
	for (const phase of [
		"proposal_challenge",
		"design_review",
		"apply_review",
	] as const) {
		issueReviewDecisionGate(sampleRound(phase, `rd-${phase}`), {
			store,
			projectRoot: "/tmp",
			gateId: `review_decision-${phase}-1`,
			createdAt: "2026-04-18T00:00:00Z",
		});
	}
	for (const gate of store.list("r")) {
		if (gate.gate_kind !== "review_decision") continue;
		assert.deepEqual([...gate.eligible_responder_roles], ["human-author"]);
	}
});
