// Pure-function tests for startChangeRun / startSyntheticRun.

import assert from "node:assert/strict";
import test from "node:test";
import { startChangeRun, startSyntheticRun } from "../core/run-core.js";
import type { CoreRunState, LocalRunState } from "../types/contracts.js";

const NOW = "2026-01-01T00:00:00Z";

const SEED: LocalRunState = {
	project_id: "test/repo",
	repo_name: "test/repo",
	repo_path: "/tmp/test",
	branch_name: "main",
	worktree_path: "/tmp/test",
	base_commit: "",
	base_branch: null,
	cleanup_pending: false,
	last_summary_path: null,
};

const AGENTS = { main: "claude", review: "codex" };

function priorTerminalRun(
	changeId: string,
	seq: number,
	overrides: Partial<CoreRunState> = {},
): CoreRunState {
	return {
		run_id: `${changeId}-${seq}`,
		change_name: changeId,
		current_phase: "approved",
		status: "terminal",
		allowed_events: [],
		source: null,
		agents: AGENTS,
		created_at: NOW,
		updated_at: NOW,
		history: [],
		previous_run_id: null,
		...overrides,
	};
}

test("startChangeRun produces initial run state", () => {
	const result = startChangeRun<LocalRunState>({
		changeId: "feat-one",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [],
		nextRunId: "feat-one-1",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.run_id, "feat-one-1");
	assert.equal(result.value.state.change_name, "feat-one");
	assert.equal(result.value.state.current_phase, "start");
	assert.equal(result.value.state.status, "active");
	assert.equal(result.value.state.previous_run_id, null);
	assert.deepEqual(result.value.state.agents, AGENTS);
	assert.deepEqual(result.value.recordMutations, []);
});

test("startChangeRun returns change_proposal_missing when proposal absent", () => {
	const result = startChangeRun<LocalRunState>({
		changeId: "missing-change",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: false,
		priorRuns: [],
		nextRunId: "missing-change-1",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "change_proposal_missing");
	assert.match(result.error.message, /no OpenSpec proposal/);
});

test("startChangeRun rejects invalid change_id", () => {
	const result = startChangeRun<LocalRunState>({
		changeId: "../evil",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [],
		nextRunId: "evil-1",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "invalid_run_id");
});

test("startChangeRun rejects when an active non-terminal run exists", () => {
	const active = priorTerminalRun("feat-one", 1, {
		current_phase: "proposal_draft",
		status: "active",
	});
	const result = startChangeRun<LocalRunState>({
		changeId: "feat-one",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [active],
		nextRunId: "feat-one-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_active_exists");
	assert.match(result.error.message, /Active run already exists/);
});

test("startChangeRun rejects when prior terminal runs exist without --retry", () => {
	const result = startChangeRun<LocalRunState>({
		changeId: "feat-two",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [priorTerminalRun("feat-two", 1)],
		nextRunId: "feat-two-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "prior_runs_require_retry");
});

test("startChangeRun with retry copies prior source and links previous_run_id", () => {
	const prior = priorTerminalRun("feat-three", 1, {
		source: {
			kind: "url",
			provider: "github",
			reference: "https://github.com/o/r/issues/1",
			title: "t",
		},
	});
	const result = startChangeRun<LocalRunState>({
		changeId: "feat-three",
		source: null,
		agents: AGENTS,
		retry: true,
		proposalExists: true,
		priorRuns: [prior],
		nextRunId: "feat-three-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.run_id, "feat-three-2");
	assert.equal(result.value.state.previous_run_id, "feat-three-1");
	assert.deepEqual(result.value.state.source, {
		kind: "url",
		provider: "github",
		reference: "https://github.com/o/r/issues/1",
		title: "t",
	});
});

test("startChangeRun rejects retry without any prior run", () => {
	const result = startChangeRun<LocalRunState>({
		changeId: "feat-four",
		source: null,
		agents: AGENTS,
		retry: true,
		proposalExists: true,
		priorRuns: [],
		nextRunId: "feat-four-1",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "retry_without_prior");
});

test("startSyntheticRun creates a synthetic run with verbatim run_id", () => {
	const result = startSyntheticRun<LocalRunState>({
		runId: "synth-run-xyz",
		source: null,
		agents: AGENTS,
		existingRunExists: false,
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.run_id, "synth-run-xyz");
	assert.equal(result.value.state.change_name, null);
	assert.equal(result.value.state.run_kind, "synthetic");
});

test("startSyntheticRun rejects collisions", () => {
	const result = startSyntheticRun<LocalRunState>({
		runId: "synth-dup",
		source: null,
		agents: AGENTS,
		existingRunExists: true,
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.error.kind, "run_already_exists");
});
