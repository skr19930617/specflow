import assert from "node:assert/strict";
import test from "node:test";
import {
	getRunField,
	readRunStatus,
	startChangeRun,
	updateRunField,
} from "../core/run-core.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";

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
	if (!started.ok) throw new Error(`bootstrap: ${started.error.message}`);
	return { runs, runId: started.value.run_id };
}

test("readRunStatus returns the persisted run state", async () => {
	const { runs, runId } = await bootstrap("feat-status");
	const result = await readRunStatus({ runId }, { runs });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.run_id, runId);
	assert.equal(result.value.current_phase, "start");
});

test("readRunStatus returns run_not_found for unknown runs", async () => {
	const runs = createInMemoryRunArtifactStore();
	const result = await readRunStatus({ runId: "missing-1" }, { runs });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_not_found");
});

test("updateRunField persists last_summary_path", async () => {
	const { runs, runId } = await bootstrap("feat-field-update");
	const result = await updateRunField(
		{ runId, field: "last_summary_path", value: "summaries/one.md" },
		{ runs },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.last_summary_path, "summaries/one.md");
});

test("updateRunField rejects non-allowlisted fields", async () => {
	const { runs, runId } = await bootstrap("feat-field-reject");
	const result = await updateRunField(
		{ runId, field: "status", value: "terminal" },
		{ runs },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "field_not_updatable");
});

test("getRunField returns a stored field value", async () => {
	const { runs, runId } = await bootstrap("feat-field-get");
	const result = await getRunField({ runId, field: "current_phase" }, { runs });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value, "start");
});

test("getRunField reports field_not_found for unknown fields", async () => {
	const { runs, runId } = await bootstrap("feat-field-missing");
	const result = await getRunField({ runId, field: "nope" }, { runs });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "field_not_found");
});
