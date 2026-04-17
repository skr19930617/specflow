// Pure-function tests for suspendRun / resumeRun. The new core runtime
// accepts state as input and returns the updated state without I/O.

import assert from "node:assert/strict";
import test from "node:test";
import { advanceRun, resumeRun, suspendRun } from "../core/run-core.js";
import type { LocalRunState, RunState } from "../types/contracts.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

const NOW = "2026-01-01T00:00:00Z";

function seedState(overrides: Partial<RunState> = {}): RunState {
	return {
		run_id: "seed-1",
		change_name: "seed",
		current_phase: "start",
		status: "active",
		allowed_events: ["propose", "reject", "suspend"],
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
		...overrides,
	};
}

test("suspendRun sets status=suspended and preserves current_phase", () => {
	// Advance to proposal_draft first.
	const advanced = advanceRun<LocalRunState>(
		{
			state: seedState(),
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(advanced.ok, true);
	if (!advanced.ok) return;

	const result = suspendRun<LocalRunState>({
		state: advanced.value.state,
		nowIso: NOW,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.status, "suspended");
	assert.equal(result.value.state.current_phase, "proposal_draft");
	assert.deepEqual(result.value.state.allowed_events, ["resume"]);
});

test("suspendRun rejects terminal runs", () => {
	const terminal = seedState({
		current_phase: "rejected",
		status: "terminal",
		allowed_events: [],
	});
	const result = suspendRun<LocalRunState>({ state: terminal, nowIso: NOW });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "terminal_suspend");
});

test("suspendRun rejects already-suspended runs", () => {
	const first = suspendRun<LocalRunState>({ state: seedState(), nowIso: NOW });
	assert.equal(first.ok, true);
	if (!first.ok) return;
	const second = suspendRun<LocalRunState>({
		state: first.value.state,
		nowIso: NOW,
	});
	assert.equal(second.ok, false);
	if (second.ok) return;
	assert.equal(second.error.kind, "already_suspended");
});

test("resumeRun restores allowed_events for the preserved phase", () => {
	const advanced = advanceRun<LocalRunState>(
		{
			state: seedState(),
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(advanced.ok, true);
	if (!advanced.ok) return;
	const suspended = suspendRun<LocalRunState>({
		state: advanced.value.state,
		nowIso: NOW,
	});
	assert.equal(suspended.ok, true);
	if (!suspended.ok) return;

	const result = resumeRun<LocalRunState>({
		state: suspended.value.state,
		nowIso: NOW,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.status, "active");
	assert.ok(result.value.state.allowed_events.includes("check_scope"));
	assert.ok(result.value.state.allowed_events.includes("suspend"));
});

test("resumeRun rejects non-suspended runs", () => {
	const result = resumeRun<LocalRunState>({ state: seedState(), nowIso: NOW });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_not_suspended");
});
