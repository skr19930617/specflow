// Pure-function tests for advanceRun's record-mutation computation.
// Core is pure: it computes a `recordMutations` list alongside the new
// state. These tests chain state through multiple advances and assert
// the mutation list.

import assert from "node:assert/strict";
import test from "node:test";
import { advanceRun } from "../core/run-core.js";
import type {
	LocalRunState,
	RunHistoryEntry,
	RunState,
} from "../types/contracts.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
	InteractionRecord,
} from "../types/interaction-records.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

const NOW = "2026-01-01T00:00:00Z";

function seed(): RunState {
	return {
		run_id: "seed-1",
		change_name: "seed",
		current_phase: "start",
		status: "active",
		allowed_events: [],
		source: null,
		agents: { main: "claude", review: "codex" },
		created_at: NOW,
		updated_at: NOW,
		history: [],
		previous_run_id: null,
		project_id: "test/repo",
		repo_name: "test/repo",
		repo_path: "/tmp/test",
		branch_name: "main",
		worktree_path: "/tmp/test",
		last_summary_path: null,
	};
}

/**
 * Drive a chain of events through pure advance, applying record mutations
 * into a growing in-memory record list on each step.
 */
function driveEvents(
	startState: RunState,
	events: readonly {
		event: string;
		clarify?: { question?: string; answer?: string };
	}[],
): { state: RunState; records: InteractionRecord[] } {
	let state: RunState = startState;
	let records: InteractionRecord[] = [];
	for (const step of events) {
		const result = advanceRun<LocalRunState>(
			{
				state,
				event: step.event,
				nowIso: NOW,
				priorRecords: records,
				clarify: step.clarify,
			},
			{ workflow: testWorkflowDefinition },
		);
		if (!result.ok) {
			throw new Error(
				`advance failed on '${step.event}': ${result.error.message}`,
			);
		}
		state = result.value.state;
		for (const mutation of result.value.recordMutations) {
			if (mutation.kind === "delete") {
				records = records.filter((r) => r.record_id !== mutation.recordId);
			} else {
				const idx = records.findIndex(
					(r) => r.record_id === mutation.record.record_id,
				);
				if (idx >= 0) {
					records = records.slice();
					records[idx] = mutation.record;
				} else {
					records = [...records, mutation.record];
				}
			}
		}
	}
	return { state, records };
}

const TO_SPEC_READY = [
	{ event: "propose" },
	{ event: "check_scope" },
	{ event: "continue_proposal" },
	{ event: "challenge_proposal" },
	{ event: "reclarify" },
	{ event: "accept_proposal" },
	{ event: "validate_spec" },
	{ event: "spec_validated" },
] as const;

test("entering spec_ready creates a pending ApprovalRecord", () => {
	const { records } = driveEvents(seed(), TO_SPEC_READY);
	assert.equal(records.length, 1);
	const rec = records[0];
	if (rec?.record_kind !== "approval") {
		throw new Error("expected approval record");
	}
	assert.equal(rec.status, "pending");
	assert.equal(rec.phase_from, "spec_ready");
	assert.equal(rec.phase_to, "design_draft");
	assert.equal(rec.decided_at, null);
	assert.equal(rec.decision_actor, null);
});

test("accept_spec updates pending ApprovalRecord to approved", () => {
	const { records } = driveEvents(seed(), [
		...TO_SPEC_READY,
		{ event: "accept_spec" },
	]);
	const approvals = records.filter(
		(r): r is ApprovalRecord => r.record_kind === "approval",
	);
	assert.equal(approvals.length, 1);
	const rec = approvals[0];
	assert.equal(rec.status, "approved");
	assert.notEqual(rec.decided_at, null);
});

test("history entry has record_ref when entering an approval gate", () => {
	const { state } = driveEvents(seed(), TO_SPEC_READY);
	const last = state.history[state.history.length - 1] as RunHistoryEntry;
	assert.ok(last.record_ref, "record_ref should be present");
	assert.match(last.record_ref ?? "", /^approval-/);
});

test("history entry has record_ref when accepting spec", () => {
	const { state } = driveEvents(seed(), [
		...TO_SPEC_READY,
		{ event: "accept_spec" },
	]);
	const last = state.history[state.history.length - 1] as RunHistoryEntry;
	assert.ok(last.record_ref, "record_ref should be present on accept_spec");
});

test("history entry has no record_ref for non-record transitions", () => {
	const { state } = driveEvents(seed(), [{ event: "propose" }]);
	const last = state.history[state.history.length - 1] as RunHistoryEntry;
	assert.equal(last.record_ref, undefined);
});

test("reject updates pending ApprovalRecord to rejected", () => {
	const { records } = driveEvents(seed(), [
		...TO_SPEC_READY,
		{ event: "reject" },
	]);
	const approvals = records.filter(
		(r): r is ApprovalRecord => r.record_kind === "approval",
	);
	assert.equal(approvals.length, 1);
	assert.equal(approvals[0].status, "rejected");
	assert.notEqual(approvals[0].decided_at, null);
});

test("clarify question creates a pending ClarifyRecord", () => {
	const { records } = driveEvents(seed(), [
		{ event: "propose" },
		{ event: "check_scope" },
		{ event: "continue_proposal" },
		{
			event: "challenge_proposal",
			clarify: { question: "What is the scope?" },
		},
	]);
	const clarifies = records.filter(
		(r): r is ClarifyRecord => r.record_kind === "clarify",
	);
	assert.equal(clarifies.length, 1);
	const rec = clarifies[0];
	assert.equal(rec.status, "pending");
	assert.equal(rec.question, "What is the scope?");
	assert.equal(rec.answer, null);
});

test("clarify response resolves a pending ClarifyRecord", () => {
	const { records } = driveEvents(seed(), [
		{ event: "propose" },
		{ event: "check_scope" },
		{ event: "continue_proposal" },
		{ event: "challenge_proposal", clarify: { question: "What?" } },
		{ event: "reclarify", clarify: { answer: "Full scope" } },
	]);
	const clarifies = records.filter(
		(r): r is ClarifyRecord => r.record_kind === "clarify",
	);
	assert.equal(clarifies.length, 1);
	assert.equal(clarifies[0].status, "resolved");
	assert.equal(clarifies[0].answer, "Full scope");
	assert.notEqual(clarifies[0].answered_at, null);
});

test("history entry has record_ref for clarify transitions", () => {
	const { state } = driveEvents(seed(), [
		{ event: "propose" },
		{ event: "check_scope" },
		{ event: "continue_proposal" },
		{ event: "challenge_proposal", clarify: { question: "What?" } },
	]);
	const last = state.history[state.history.length - 1] as RunHistoryEntry;
	assert.ok(last.record_ref, "record_ref should be present for clarify");
	assert.match(last.record_ref ?? "", /^clarify-/);
});
