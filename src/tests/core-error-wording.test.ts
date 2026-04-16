// Stderr wording parity test.
//
// Pins the exact human-readable `message` the core runtime produces for each
// `CoreRuntimeError.kind`. The CLI wiring layer writes these messages to
// stderr unchanged, so drift here is an observable change to the CLI
// surface and should be deliberate.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
	advanceRun,
	getRunField,
	resumeRun,
	startChangeRun,
	startSyntheticRun,
	suspendRun,
	updateRunField,
} from "../core/run-core.js";
import {
	ChangeArtifactType,
	changeRef,
	runRef,
} from "../lib/artifact-types.js";
import { createFakeWorkspaceContext } from "./helpers/fake-workspace-context.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";
import { createInMemoryRunArtifactStore } from "./helpers/in-memory-run-store.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

// Fixture is loaded from the source tree (same pattern as other fixture-based
// tests in this suite — see test-helpers.ts's fixture resolver).
const fixturePath = resolve(
	process.cwd(),
	"src/tests/fixtures/core-error-wording.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
	string,
	string
>;

function seedProposal(
	changes: ReturnType<typeof createInMemoryChangeArtifactStore>,
	changeId: string,
): void {
	changes.seed(
		changeRef(changeId, ChangeArtifactType.Proposal),
		"# Proposal\n",
	);
}

function expectError(
	result: {
		ok: boolean;
		value?: unknown;
		error?: { kind: string; message: string };
	},
	kind: string,
): { kind: string; message: string } {
	if (result.ok || !result.error) {
		throw new Error(`expected error for kind=${kind}, got ok`);
	}
	assert.equal(result.error.kind, kind);
	return result.error;
}

test("invalid_run_id wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	const r = await startChangeRun(
		{
			changeId: "../evil",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "invalid_run_id");
	assert.equal(e.message, fixture.invalid_run_id);
});

test("run_not_found wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const r = await getRunField(
		{ runId: "ghost-1", field: "current_phase" },
		{ runs },
	);
	const e = expectError(r, "run_not_found");
	assert.equal(e.message, fixture.run_not_found);
});

test("run_schema_mismatch wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	// Seed a minimal run.json without the required schema fields.
	await runs.write(
		runRef("legacy-1"),
		`${JSON.stringify({ run_id: "legacy-1", current_phase: "start", status: "active", allowed_events: [], history: [], change_name: null, created_at: "", updated_at: "" })}\n`,
	);
	const r = await advanceRun(
		{ runId: "legacy-1", event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	const e = expectError(r, "run_schema_mismatch");
	assert.equal(e.message, fixture.run_schema_mismatch);
});

test("invalid_event wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-iw");
	const started = await startChangeRun(
		{
			changeId: "feat-iw",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(started.ok, true);
	const r = await advanceRun(
		{ runId: "feat-iw-1", event: "bogus" },
		{ runs, workflow: testWorkflowDefinition },
	);
	const e = expectError(r, "invalid_event");
	assert.equal(e.message, fixture.invalid_event);
});

test("run_suspended wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-sw");
	const started = await startChangeRun(
		{
			changeId: "feat-sw",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(started.ok, true);
	assert.equal((await suspendRun({ runId: "feat-sw-1" }, { runs })).ok, true);
	const r = await advanceRun(
		{ runId: "feat-sw-1", event: "propose" },
		{ runs, workflow: testWorkflowDefinition },
	);
	const e = expectError(r, "run_suspended");
	assert.equal(e.message, fixture.run_suspended);
});

test("run_not_suspended wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-nsw");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-nsw",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	const r = await resumeRun({ runId: "feat-nsw-1" }, { runs });
	const e = expectError(r, "run_not_suspended");
	assert.equal(e.message, fixture.run_not_suspended);
});

test("run_already_exists wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const workspace = createFakeWorkspaceContext();
	assert.equal(
		(
			await startSyntheticRun(
				{ runId: "synth-x", source: null, agents: { main: "c", review: "x" } },
				{ runs, workspace },
			)
		).ok,
		true,
	);
	const r = await startSyntheticRun(
		{ runId: "synth-x", source: null, agents: { main: "c", review: "x" } },
		{ runs, workspace },
	);
	const e = expectError(r, "run_already_exists");
	assert.equal(e.message, fixture.run_already_exists);
});

test("run_active_exists wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-one");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-one",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	const r = await startChangeRun(
		{
			changeId: "feat-one",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "run_active_exists");
	assert.equal(e.message, fixture.run_active_exists);
});

test("run_suspended_exists wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-one");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-one",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	assert.equal((await suspendRun({ runId: "feat-one-1" }, { runs })).ok, true);
	const r = await startChangeRun(
		{
			changeId: "feat-one",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "run_suspended_exists");
	assert.equal(e.message, fixture.run_suspended_exists);
});

test("prior_runs_require_retry wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-p");
	const first = await startChangeRun(
		{
			changeId: "feat-p",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	assert.equal(first.ok, true);
	// Terminate the run manually.
	if (!first.ok) return;
	await runs.write(
		runRef(first.value.run_id),
		`${JSON.stringify({ ...first.value, status: "terminal" })}\n`,
	);
	const r = await startChangeRun(
		{
			changeId: "feat-p",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "prior_runs_require_retry");
	assert.equal(e.message, fixture.prior_runs_require_retry);
});

test("retry_without_prior wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-rw");
	const r = await startChangeRun(
		{
			changeId: "feat-rw",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: true,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "retry_without_prior");
	assert.equal(e.message, fixture.retry_without_prior);
});

test("retry_on_rejected wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-rr");
	const first = await startChangeRun(
		{
			changeId: "feat-rr",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	if (!first.ok) return;
	await runs.write(
		runRef(first.value.run_id),
		`${JSON.stringify({ ...first.value, status: "terminal", current_phase: "rejected" })}\n`,
	);
	const r = await startChangeRun(
		{
			changeId: "feat-rr",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: true,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "retry_on_rejected");
	assert.equal(e.message, fixture.retry_on_rejected);
});

test("change_proposal_missing wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	const r = await startChangeRun(
		{
			changeId: "missing-change",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	const e = expectError(r, "change_proposal_missing");
	assert.equal(e.message, fixture.change_proposal_missing);
});

test("terminal_suspend wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-ts");
	const first = await startChangeRun(
		{
			changeId: "feat-ts",
			source: null,
			agents: { main: "claude", review: "codex" },
			retry: false,
		},
		{ runs, changes, workspace },
	);
	if (!first.ok) return;
	await runs.write(
		runRef(first.value.run_id),
		`${JSON.stringify({ ...first.value, status: "terminal" })}\n`,
	);
	const r = await suspendRun({ runId: first.value.run_id }, { runs });
	const e = expectError(r, "terminal_suspend");
	assert.equal(e.message, fixture.terminal_suspend);
});

test("already_suspended wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-as");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-as",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	assert.equal((await suspendRun({ runId: "feat-as-1" }, { runs })).ok, true);
	const r = await suspendRun({ runId: "feat-as-1" }, { runs });
	const e = expectError(r, "already_suspended");
	assert.equal(e.message, fixture.already_suspended);
});

test("field_not_found wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-fn");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-fn",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	const r = await getRunField({ runId: "feat-fn-1", field: "nope" }, { runs });
	const e = expectError(r, "field_not_found");
	assert.equal(e.message, fixture.field_not_found);
});

test("field_not_updatable wording matches fixture", async () => {
	const runs = createInMemoryRunArtifactStore();
	const changes = createInMemoryChangeArtifactStore();
	const workspace = createFakeWorkspaceContext();
	seedProposal(changes, "feat-fu");
	assert.equal(
		(
			await startChangeRun(
				{
					changeId: "feat-fu",
					source: null,
					agents: { main: "claude", review: "codex" },
					retry: false,
				},
				{ runs, changes, workspace },
			)
		).ok,
		true,
	);
	const r = await updateRunField(
		{ runId: "feat-fu-1", field: "status", value: "terminal" },
		{ runs },
	);
	const e = expectError(r, "field_not_updatable");
	assert.equal(e.message, fixture.field_not_updatable);
});
