// Stderr wording parity test for pure core runtime functions.
//
// Pins the exact `message` text each `CoreRuntimeError.kind` produces so
// the CLI wiring layer (which passes the message through unchanged) keeps
// identical stderr output.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
	advanceRun,
	resumeRun,
	startChangeRun,
	startSyntheticRun,
	suspendRun,
} from "../core/run-core.js";
import type {
	CoreRunState,
	LocalRunState,
	RunState,
} from "../types/contracts.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

const NOW = "2026-01-01T00:00:00Z";

const fixturePath = resolve(
	process.cwd(),
	"src/tests/fixtures/core-error-wording.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
	string,
	string
>;

const AGENTS = { main: "claude", review: "codex" };
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

function seedState(overrides: Partial<RunState> = {}): RunState {
	return {
		run_id: "seed-1",
		change_name: "seed",
		current_phase: "start",
		status: "active",
		allowed_events: [],
		source: null,
		agents: AGENTS,
		created_at: NOW,
		updated_at: NOW,
		history: [],
		previous_run_id: null,
		...SEED,
		...overrides,
	};
}

function priorRun(
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

function expectError<T>(
	result: { ok: boolean; error?: { kind: string; message: string } },
	kind: string,
): { kind: string; message: string } {
	if (result.ok || !result.error) {
		throw new Error(`expected error for kind=${kind}, got ok`);
	}
	assert.equal(result.error.kind, kind);
	return result.error;
}

test("invalid_run_id wording matches fixture", () => {
	const r = startChangeRun<LocalRunState>({
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
	assert.equal(
		expectError(r, "invalid_run_id").message,
		fixture.invalid_run_id,
	);
});

test("invalid_event wording matches fixture", () => {
	const r = advanceRun<LocalRunState>(
		{
			state: seedState({
				allowed_events: [
					"propose",
					"explore_start",
					"spec_bootstrap_start",
					"suspend",
				],
			}),
			event: "bogus",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(expectError(r, "invalid_event").message, fixture.invalid_event);
});

test("run_suspended wording matches fixture", () => {
	const r = advanceRun<LocalRunState>(
		{
			state: seedState({ status: "suspended" }),
			event: "propose",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(expectError(r, "run_suspended").message, fixture.run_suspended);
});

test("run_not_suspended wording matches fixture", () => {
	const r = resumeRun<LocalRunState>({ state: seedState(), nowIso: NOW });
	assert.equal(
		expectError(r, "run_not_suspended").message,
		fixture.run_not_suspended,
	);
});

test("run_already_exists wording matches fixture", () => {
	const r = startSyntheticRun<LocalRunState>({
		runId: "synth-x",
		source: null,
		agents: AGENTS,
		existingRunExists: true,
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(
		expectError(r, "run_already_exists").message,
		fixture.run_already_exists,
	);
});

test("run_active_exists wording matches fixture", () => {
	const active = priorRun("feat-one", 1, {
		current_phase: "proposal_draft",
		status: "active",
	});
	const r = startChangeRun<LocalRunState>({
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
	assert.equal(
		expectError(r, "run_active_exists").message,
		fixture.run_active_exists,
	);
});

test("run_suspended_exists wording matches fixture", () => {
	const suspended = priorRun("feat-one", 1, {
		current_phase: "proposal_draft",
		status: "suspended",
	});
	const r = startChangeRun<LocalRunState>({
		changeId: "feat-one",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [suspended],
		nextRunId: "feat-one-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(
		expectError(r, "run_suspended_exists").message,
		fixture.run_suspended_exists,
	);
});

test("prior_runs_require_retry wording matches fixture", () => {
	const r = startChangeRun<LocalRunState>({
		changeId: "feat-two",
		source: null,
		agents: AGENTS,
		retry: false,
		proposalExists: true,
		priorRuns: [priorRun("feat-two", 1)],
		nextRunId: "feat-two-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(
		expectError(r, "prior_runs_require_retry").message,
		fixture.prior_runs_require_retry,
	);
});

test("retry_without_prior wording matches fixture", () => {
	const r = startChangeRun<LocalRunState>({
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
	assert.equal(
		expectError(r, "retry_without_prior").message,
		fixture.retry_without_prior,
	);
});

test("retry_on_rejected wording matches fixture", () => {
	const rejected = priorRun("feat-x", 1, { current_phase: "rejected" });
	const r = startChangeRun<LocalRunState>({
		changeId: "feat-x",
		source: null,
		agents: AGENTS,
		retry: true,
		proposalExists: true,
		priorRuns: [rejected],
		nextRunId: "feat-x-2",
		nowIso: NOW,
		adapterSeed: SEED,
	});
	assert.equal(
		expectError(r, "retry_on_rejected").message,
		fixture.retry_on_rejected,
	);
});

test("change_proposal_missing wording matches fixture", () => {
	const r = startChangeRun<LocalRunState>({
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
	assert.equal(
		expectError(r, "change_proposal_missing").message,
		fixture.change_proposal_missing,
	);
});

test("terminal_suspend wording matches fixture", () => {
	const r = suspendRun<LocalRunState>({
		state: seedState({ status: "terminal", current_phase: "approved" }),
		nowIso: NOW,
	});
	assert.equal(
		expectError(r, "terminal_suspend").message,
		fixture.terminal_suspend,
	);
});

test("already_suspended wording matches fixture", () => {
	const r = suspendRun<LocalRunState>({
		state: seedState({ status: "suspended" }),
		nowIso: NOW,
	});
	assert.equal(
		expectError(r, "already_suspended").message,
		fixture.already_suspended,
	);
});
