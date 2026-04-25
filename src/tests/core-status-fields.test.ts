// Pure-function tests for updateRunField. `status` and `get-field` are now
// wiring-layer operations and are exercised via CLI smoke tests, not here.

import assert from "node:assert/strict";
import test from "node:test";
import { updateRunField } from "../core/run-core.js";
import type { LocalRunState, RunState } from "../types/contracts.js";

const NOW = "2026-01-01T00:00:00Z";

function seedState(overrides: Partial<RunState> = {}): RunState {
	return {
		run_id: "seed-1",
		change_name: "seed",
		current_phase: "start",
		status: "active",
		allowed_events: [],
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
		base_commit: "",
		base_branch: null,
		cleanup_pending: false,
		last_summary_path: null,
		...overrides,
	};
}

test("updateRunField persists last_summary_path in returned state", () => {
	const result = updateRunField<LocalRunState>({
		state: seedState(),
		field: "last_summary_path",
		value: "summaries/one.md",
		nowIso: NOW,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const merged = result.value.state as RunState;
	assert.equal(merged.last_summary_path, "summaries/one.md");
});

test("updateRunField updates timestamp", () => {
	const result = updateRunField<LocalRunState>({
		state: seedState(),
		field: "last_summary_path",
		value: "x",
		nowIso: "2099-12-31T00:00:00Z",
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.value.state.updated_at, "2099-12-31T00:00:00Z");
});
