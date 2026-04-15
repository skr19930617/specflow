import assert from "node:assert/strict";
import test from "node:test";
import { advanceRun, startChangeRun } from "../core/run-core.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { createInMemoryInteractionRecordStore } from "../lib/in-memory-interaction-record-store.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

function bootstrap(changeId: string) {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	const records = createInMemoryInteractionRecordStore();
	changes.seed(
		changeRef(changeId, ChangeArtifactType.Proposal),
		"# Proposal\n",
	);
	const started = startChangeRun(
		{
			changeId,
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	if (!started.ok) {
		throw new Error(`bootstrap failed: ${started.error.message}`);
	}
	return { runs, records, runId: started.value.run_id };
}

/** Advance through the workflow to a specific phase by applying events in order. */
function advanceTo(
	runId: string,
	runs: ReturnType<typeof createInMemoryRunArtifactStore>,
	records: ReturnType<typeof createInMemoryInteractionRecordStore>,
	events: readonly string[],
) {
	for (const event of events) {
		const result = advanceRun(
			{ runId, event },
			{ runs, workflow: testWorkflowDefinition, records },
		);
		if (!result.ok) {
			throw new Error(
				`advance failed on event '${event}': ${result.error.message}`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Approval record creation on gate entry
// ---------------------------------------------------------------------------

test("entering spec_ready creates a pending ApprovalRecord", () => {
	const { runs, records, runId } = bootstrap("rec-approval");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
	]);
	// Now in spec_ready
	const allRecords = records.list(runId);
	assert.equal(allRecords.length, 1);
	const rec = allRecords[0];
	assert.equal(rec?.record_kind, "approval");
	if (rec?.record_kind !== "approval") return;
	assert.equal(rec.status, "pending");
	assert.equal(rec.phase_from, "spec_ready");
	assert.equal(rec.phase_to, "design_draft");
	assert.equal(rec.decided_at, null);
	assert.equal(rec.decision_actor, null);
});

test("accept_spec updates pending ApprovalRecord to approved", () => {
	const { runs, records, runId } = bootstrap("rec-approval-accept");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
		"accept_spec",
	]);
	const allRecords = records.list(runId);
	const approvalRecords = allRecords.filter(
		(r) => r.record_kind === "approval",
	);
	assert.equal(approvalRecords.length, 1);
	const rec = approvalRecords[0];
	if (rec?.record_kind !== "approval") return;
	assert.equal(rec.status, "approved");
	assert.notEqual(rec.decided_at, null);
});

// ---------------------------------------------------------------------------
// record_ref in history entries
// ---------------------------------------------------------------------------

test("history entry has record_ref when entering an approval gate", () => {
	const { runs, records, runId } = bootstrap("rec-ref");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
	]);
	// Read the run state to check the last history entry
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(runs.read(ref));
	const lastEntry = state.history[state.history.length - 1];
	assert.ok(lastEntry.record_ref, "record_ref should be present");
	assert.match(lastEntry.record_ref, /^approval-/);
});

test("history entry has record_ref when accepting spec", () => {
	const { runs, records, runId } = bootstrap("rec-ref-accept");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
		"accept_spec",
	]);
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(runs.read(ref));
	const lastEntry = state.history[state.history.length - 1];
	assert.ok(
		lastEntry.record_ref,
		"record_ref should be present on accept_spec",
	);
});

test("history entry has no record_ref for non-record transitions", () => {
	const { runs, records, runId } = bootstrap("rec-no-ref");
	advanceTo(runId, runs, records, ["propose"]);
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(runs.read(ref));
	const lastEntry = state.history[state.history.length - 1];
	assert.equal(lastEntry.record_ref, undefined);
});

// ---------------------------------------------------------------------------
// Backward compatibility: records undefined
// ---------------------------------------------------------------------------

test("advance succeeds without records (backward compat)", () => {
	const { runs, runId } = bootstrap("rec-compat");
	const result = advanceRun(
		{ runId, event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.current_phase, "proposal_draft");
});

test("entering spec_ready without records does not create records", () => {
	const { runs, runId } = bootstrap("rec-compat-gate");
	// No records injected
	const events = [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
	];
	for (const event of events) {
		const result = advanceRun(
			{ runId, event },
			{ runs, workflow: testWorkflowDefinition },
		);
		if (!result.ok) {
			throw new Error(
				`advance failed on event '${event}': ${result.error.message}`,
			);
		}
	}
	// Verify no record_ref in history
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(runs.read(ref));
	const lastEntry = state.history[state.history.length - 1];
	assert.equal(lastEntry.record_ref, undefined);
});

// ---------------------------------------------------------------------------
// Record write failure causes transition failure
// ---------------------------------------------------------------------------

test("record write failure causes transition failure", () => {
	const { runs, runId } = bootstrap("rec-fail");
	const records = createInMemoryInteractionRecordStore();
	// Advance to just before spec_ready (spec_validate)
	const preEvents = [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
	];
	for (const event of preEvents) {
		const result = advanceRun(
			{ runId, event },
			{ runs, workflow: testWorkflowDefinition, records },
		);
		if (!result.ok)
			throw new Error(`pre-advance failed: ${result.error.message}`);
	}

	// Now create a store that always throws on write
	const failingStore: ReturnType<typeof createInMemoryInteractionRecordStore> =
		{
			write: () => {
				throw new Error("Simulated write failure");
			},
			read: records.read,
			list: records.list,
			delete: records.delete,
		};

	// spec_validated → spec_ready triggers approval record creation, which should fail
	const result = advanceRun(
		{ runId, event: "spec_validated" },
		{ runs, workflow: testWorkflowDefinition, records: failingStore },
	);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.kind, "record_write_failed");
		assert.match(result.error.message, /Simulated write failure/);
	}
});

// ---------------------------------------------------------------------------
// Reject updates pending approval record
// ---------------------------------------------------------------------------

test("reject updates pending ApprovalRecord to rejected", () => {
	const { runs, records, runId } = bootstrap("rec-reject");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
		"challenge_proposal",
		"reclarify",
		"accept_proposal",
		"validate_spec",
		"spec_validated",
		"reject",
	]);
	const allRecords = records.list(runId);
	const approvalRecords = allRecords.filter(
		(r) => r.record_kind === "approval",
	);
	assert.equal(approvalRecords.length, 1);
	const rec = approvalRecords[0];
	if (rec?.record_kind !== "approval") return;
	assert.equal(rec.status, "rejected");
	assert.notEqual(rec.decided_at, null);
});

// ---------------------------------------------------------------------------
// ClarifyRecord creation and resolution
// ---------------------------------------------------------------------------

test("clarify question creates a pending ClarifyRecord", () => {
	const { runs, records, runId } = bootstrap("rec-clarify-q");
	// Advance to proposal_clarify
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
	]);
	// Issue a clarify question via the clarify input
	const result = advanceRun(
		{
			runId,
			event: "challenge_proposal",
			clarify: { question: "What is the scope?" },
		},
		{ runs, workflow: testWorkflowDefinition, records },
	);
	assert.equal(result.ok, true);
	const clarifyRecords = records
		.list(runId)
		.filter((r) => r.record_kind === "clarify");
	assert.equal(clarifyRecords.length, 1);
	const rec = clarifyRecords[0];
	if (rec?.record_kind !== "clarify") return;
	assert.equal(rec.status, "pending");
	assert.equal(rec.question, "What is the scope?");
	assert.equal(rec.answer, null);
	assert.equal(rec.phase, "proposal_clarify");
});

test("clarify response resolves a pending ClarifyRecord", () => {
	const { runs, records, runId } = bootstrap("rec-clarify-a");
	// Advance to proposal_clarify, issue a question, then answer
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
	]);
	// Issue clarify question
	advanceRun(
		{
			runId,
			event: "challenge_proposal",
			clarify: { question: "What scope?" },
		},
		{ runs, workflow: testWorkflowDefinition, records },
	);
	// Answer clarify
	advanceRun(
		{
			runId,
			event: "reclarify",
			clarify: { answer: "Full scope" },
		},
		{ runs, workflow: testWorkflowDefinition, records },
	);
	const clarifyRecords = records
		.list(runId)
		.filter((r) => r.record_kind === "clarify");
	assert.equal(clarifyRecords.length, 1);
	const rec = clarifyRecords[0];
	if (rec?.record_kind !== "clarify") return;
	assert.equal(rec.status, "resolved");
	assert.equal(rec.answer, "Full scope");
	assert.notEqual(rec.answered_at, null);
});

test("history entry has record_ref for clarify transitions", () => {
	const { runs, records, runId } = bootstrap("rec-clarify-ref");
	advanceTo(runId, runs, records, [
		"propose",
		"check_scope",
		"continue_proposal",
	]);
	advanceRun(
		{
			runId,
			event: "challenge_proposal",
			clarify: { question: "What?" },
		},
		{ runs, workflow: testWorkflowDefinition, records },
	);
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(runs.read(ref));
	const lastEntry = state.history[state.history.length - 1];
	assert.ok(lastEntry.record_ref, "record_ref should be present for clarify");
	assert.match(lastEntry.record_ref, /^clarify-/);
});
