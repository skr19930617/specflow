// Compile-time assignability tests for RunState partition (CoreRunState + LocalRunState)
// and RunStateCoreFields backward-compat alias.

import test from "node:test";
import type {
	CoreRunState,
	LocalRunState,
	RunState,
	RunStateCoreFields,
} from "../types/contracts.js";

// --- Test fixtures ---

const coreSample: CoreRunState = {
	run_id: "test-1",
	change_name: "test",
	current_phase: "proposal_draft",
	status: "active",
	allowed_events: [],
	source: null,
	agents: { main: "claude", review: "codex" },
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
	history: [],
	previous_run_id: null,
};

const localSample: LocalRunState = {
	project_id: "test/repo",
	repo_name: "test/repo",
	repo_path: "/tmp/test",
	branch_name: "main",
	worktree_path: "/tmp/test",
	last_summary_path: null,
};

const fullSample: RunState = { ...coreSample, ...localSample };

test("RunState is assignable from CoreRunState & LocalRunState", () => {
	const state: RunState = { ...coreSample, ...localSample };
	const _id: string = state.run_id;
	const _phase: string = state.current_phase;
	const _project: string = state.project_id;
});

test("RunStateCoreFields is a backward-compat alias for RunState", () => {
	const state: RunStateCoreFields = fullSample;
	const _id: string = state.run_id;
	const _project: string = state.project_id;
});

test("CoreRunState is independently usable without LocalRunState fields", () => {
	function processCoreOnly(state: CoreRunState): string {
		return state.run_id;
	}
	const result = processCoreOnly(coreSample);
	const _check: string = result;
});

test("LocalRunState contains only adapter-specific fields", () => {
	const local: LocalRunState = localSample;
	const _project: string = local.project_id;
	const _repo: string = local.repo_name;
	const _path: string = local.repo_path;
});
