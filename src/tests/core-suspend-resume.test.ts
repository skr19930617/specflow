import assert from "node:assert/strict";
import test from "node:test";
import {
	advanceRun,
	resumeRun,
	startChangeRun,
	suspendRun,
} from "../core/run-core.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

function bootstrap(changeId: string) {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
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
	if (!started.ok) throw new Error(`bootstrap: ${started.error.message}`);
	return { runs, runId: started.value.run_id };
}

test("suspendRun sets status=suspended and preserves current_phase", () => {
	const { runs, runId } = bootstrap("feat-suspend");
	// Advance to proposal_draft first
	assert.equal(
		advanceRun(
			{ runId, event: "propose" },
			{ runs, workflow: testWorkflowDefinition },
		).ok,
		true,
	);

	const result = suspendRun({ runId }, { runs });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.status, "suspended");
	assert.equal(result.value.current_phase, "proposal_draft");
	assert.deepEqual(result.value.allowed_events, ["resume"]);
});

test("suspendRun rejects terminal runs", () => {
	const { runs, runId } = bootstrap("feat-suspend-terminal");
	assert.equal(
		advanceRun(
			{ runId, event: "propose" },
			{ runs, workflow: testWorkflowDefinition },
		).ok,
		true,
	);
	assert.equal(
		advanceRun(
			{ runId, event: "reject" },
			{ runs, workflow: testWorkflowDefinition },
		).ok,
		true,
	);

	const result = suspendRun({ runId }, { runs });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "terminal_suspend");
});

test("suspendRun rejects already-suspended runs", () => {
	const { runs, runId } = bootstrap("feat-suspend-dup");
	const first = suspendRun({ runId }, { runs });
	assert.equal(first.ok, true);
	const second = suspendRun({ runId }, { runs });
	assert.equal(second.ok, false);
	if (second.ok) return;
	assert.equal(second.error.kind, "already_suspended");
});

test("resumeRun restores allowed_events for the preserved phase", () => {
	const { runs, runId } = bootstrap("feat-resume");
	assert.equal(
		advanceRun(
			{ runId, event: "propose" },
			{ runs, workflow: testWorkflowDefinition },
		).ok,
		true,
	);
	assert.equal(suspendRun({ runId }, { runs }).ok, true);

	const result = resumeRun({ runId }, { runs });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.status, "active");
	assert.ok(result.value.allowed_events.includes("check_scope"));
	assert.ok(result.value.allowed_events.includes("suspend"));
});

test("resumeRun rejects non-suspended runs", () => {
	const { runs, runId } = bootstrap("feat-resume-noop");
	const result = resumeRun({ runId }, { runs });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_not_suspended");
});
