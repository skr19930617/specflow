import assert from "node:assert/strict";
import test from "node:test";
import { advanceRun, startChangeRun } from "../core/run-core.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

async function bootstrap(changeId: string) {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	changes.seed(
		changeRef(changeId, ChangeArtifactType.Proposal),
		"# Proposal\n",
	);
	const started = await startChangeRun(
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
	return { runs, runId: started.value.run_id };
}

test("advanceRun applies a declared transition and appends history", async () => {
	const { runs, runId } = await bootstrap("feat-adv");
	const result = await advanceRun(
		{ runId, event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.current_phase, "proposal_draft");
	assert.equal(result.value.history.length, 1);
	const [entry] = result.value.history;
	assert.equal(entry?.from, "start");
	assert.equal(entry?.to, "proposal_draft");
	assert.equal(entry?.event, "propose");
});

test("advanceRun rejects invalid events and lists allowed ones", async () => {
	const { runs, runId } = await bootstrap("feat-adv-invalid");
	const result = await advanceRun(
		{ runId, event: "bogus" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "invalid_event");
	assert.match(result.error.message, /Allowed events:/);
});

test("advanceRun rejects events when run is suspended", async () => {
	const { runs, runId } = await bootstrap("feat-adv-suspended");
	// Directly mutate stored state to suspended for this branch.
	const ref = { runId, type: "run-state" as const };
	const state = JSON.parse(await runs.read(ref));
	await runs.write(
		ref,
		`${JSON.stringify({ ...state, status: "suspended" })}\n`,
	);

	const result = await advanceRun(
		{ runId, event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_suspended");
});

test("advanceRun reports run_not_found for unknown run_id", async () => {
	const runs = createInMemoryRunArtifactStore();
	const result = await advanceRun(
		{ runId: "does-not-exist-1", event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_not_found");
});

test("advanceRun transitions to terminal status on terminal phases", async () => {
	const { runs, runId } = await bootstrap("feat-adv-terminal");
	// Drive to proposal_draft → reject (terminal).
	const r1 = await advanceRun(
		{ runId, event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(r1.ok, true);
	const r2 = await advanceRun(
		{ runId, event: "reject" },
		{ runs, workflow: testWorkflowDefinition },
	);
	assert.equal(r2.ok, true);
	if (!r2.ok) return;
	assert.equal(r2.value.current_phase, "rejected");
	assert.equal(r2.value.status, "terminal");
	assert.deepEqual(r2.value.allowed_events, []);
});
