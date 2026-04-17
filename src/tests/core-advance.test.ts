// Pure-function tests for advanceRun.

import assert from "node:assert/strict";
import test from "node:test";
import { advanceRun } from "../core/run-core.js";
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

test("advanceRun applies a declared transition and appends history", () => {
	const result = advanceRun<LocalRunState>(
		{
			state: seedState(),
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.current_phase, "proposal_draft");
	assert.equal(result.value.state.history.length, 1);
	const [entry] = result.value.state.history;
	assert.equal(entry?.from, "start");
	assert.equal(entry?.to, "proposal_draft");
	assert.equal(entry?.event, "propose");
});

test("advanceRun rejects invalid events and lists allowed ones", () => {
	const result = advanceRun<LocalRunState>(
		{
			state: seedState(),
			event: "bogus",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "invalid_event");
	assert.match(result.error.message, /Allowed events:/);
});

test("advanceRun rejects events when run is suspended", () => {
	const suspended = seedState({ status: "suspended" });
	const result = advanceRun<LocalRunState>(
		{
			state: suspended,
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_suspended");
});

test("advanceRun transitions to terminal status on terminal phases", () => {
	const r1 = advanceRun<LocalRunState>(
		{
			state: seedState(),
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(r1.ok, true);
	if (!r1.ok) return;
	const r2 = advanceRun<LocalRunState>(
		{
			state: r1.value.state,
			event: "reject",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(r2.ok, true);
	if (!r2.ok) return;
	assert.equal(r2.value.state.current_phase, "rejected");
	assert.equal(r2.value.state.status, "terminal");
	assert.deepEqual(r2.value.state.allowed_events, []);
});
