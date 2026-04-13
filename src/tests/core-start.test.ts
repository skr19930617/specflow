import assert from "node:assert/strict";
import test from "node:test";
import { startChangeRun, startSyntheticRun } from "../core/run-core.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";

function seedProposal(
	changes: ReturnType<typeof createInMemoryChangeArtifactStore>,
	changeId: string,
): void {
	changes.seed(
		changeRef(changeId, ChangeArtifactType.Proposal),
		"# Proposal\n",
	);
}

test("startChangeRun writes initial run state via the run store", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-one");

	const result = startChangeRun(
		{
			changeId: "feat-one",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);

	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.run_id, "feat-one-1");
	assert.equal(result.value.change_name, "feat-one");
	assert.equal(result.value.current_phase, "start");
	assert.equal(result.value.status, "active");
	assert.equal(result.value.previous_run_id, null);
	assert.deepEqual(result.value.agents, { main: "claude", review: "codex" });
	assert.equal(runs.snapshot().size, 1);
});

test("startChangeRun returns change_proposal_missing when proposal absent", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();

	const result = startChangeRun(
		{
			changeId: "missing-change",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);

	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "change_proposal_missing");
	assert.match(result.error.message, /no OpenSpec proposal/);
});

test("startChangeRun rejects invalid change_id", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();

	const result = startChangeRun(
		{
			changeId: "../evil",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "invalid_run_id");
});

test("startChangeRun rejects when an active non-terminal run exists", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-one");

	const first = startChangeRun(
		{
			changeId: "feat-one",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(first.ok, true);

	const second = startChangeRun(
		{
			changeId: "feat-one",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(second.ok, false);
	if (second.ok) return;
	assert.equal(second.error.kind, "run_active_exists");
	assert.match(second.error.message, /Active run already exists/);
});

test("startChangeRun rejects when prior terminal runs exist without --retry", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-two");

	const first = startChangeRun(
		{
			changeId: "feat-two",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(first.ok, true);
	if (!first.ok) return;
	// Manually terminate the prior run in the store
	runs.write(
		{ runId: first.value.run_id, type: "run-state" },
		`${JSON.stringify({ ...first.value, status: "terminal" }, null, 2)}\n`,
	);

	const second = startChangeRun(
		{
			changeId: "feat-two",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(second.ok, false);
	if (second.ok) return;
	assert.equal(second.error.kind, "prior_runs_require_retry");
});

test("startChangeRun with retry copies prior source and links previous_run_id", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-three");

	const first = startChangeRun(
		{
			changeId: "feat-three",
			source: {
				kind: "url",
				provider: "github",
				reference: "https://github.com/o/r/issues/1",
				title: "t",
			},
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(first.ok, true);
	if (!first.ok) return;
	runs.write(
		{ runId: first.value.run_id, type: "run-state" },
		`${JSON.stringify({ ...first.value, status: "terminal", current_phase: "approved" }, null, 2)}\n`,
	);

	const retryResult = startChangeRun(
		{
			changeId: "feat-three",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: true,
		},
		{ runs, changes, workspace },
	);
	assert.equal(retryResult.ok, true);
	if (!retryResult.ok) return;
	assert.equal(retryResult.value.run_id, "feat-three-2");
	assert.equal(retryResult.value.previous_run_id, "feat-three-1");
	assert.deepEqual(retryResult.value.source, {
		kind: "url",
		provider: "github",
		reference: "https://github.com/o/r/issues/1",
		title: "t",
	});
});

test("startChangeRun rejects retry without any prior run", () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-four");

	const result = startChangeRun(
		{
			changeId: "feat-four",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: true,
		},
		{ runs, changes, workspace },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "retry_without_prior");
});

test("startSyntheticRun creates a synthetic run with verbatim run_id", () => {
	const runs = createInMemoryRunArtifactStore();
	const workspace = createFakeWorkspaceContext();

	const result = startSyntheticRun(
		{
			runId: "synth-run-xyz",
			source: null,
			agents: { main: "claude", review: "codex" },
		},
		{ runs, workspace },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.run_id, "synth-run-xyz");
	assert.equal(result.value.change_name, null);
	assert.equal(result.value.run_kind, "synthetic");
});

test("startSyntheticRun rejects collisions", () => {
	const runs = createInMemoryRunArtifactStore();
	const workspace = createFakeWorkspaceContext();

	assert.equal(
		startSyntheticRun(
			{
				runId: "synth-dup",
				source: null,
				agents: { main: "claude", review: "codex" },
			},
			{ runs, workspace },
		).ok,
		true,
	);
	const dup = startSyntheticRun(
		{
			runId: "synth-dup",
			source: null,
			agents: { main: "claude", review: "codex" },
		},
		{ runs, workspace },
	);
	assert.equal(dup.ok, false);
	if (dup.ok) return;
	assert.equal(dup.error.kind, "run_already_exists");
});
