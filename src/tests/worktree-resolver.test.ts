// Tests for the run-id → worktree_path resolver used by phase commands.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import type {
	RunArtifactQuery,
	RunArtifactRef,
} from "../lib/artifact-types.js";
import {
	resolveChangeRootForRun,
	resolveWorktreeForRun,
	resolveWorktreeForRunOrNull,
} from "../lib/worktree-resolver.js";
import type { RunState } from "../types/contracts.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function buildRunState(overrides: Partial<RunState>): RunState {
	return {
		run_id: "wt-1",
		change_name: "wt",
		current_phase: "apply_draft",
		status: "active",
		allowed_events: [],
		source: null,
		project_id: "fixture",
		repo_name: "fixture",
		repo_path: "/repo",
		branch_name: "wt",
		worktree_path: "/repo/.specflow/worktrees/wt/main",
		base_commit: "deadbeef",
		base_branch: "main",
		cleanup_pending: false,
		agents: { main: "claude", review: "codex" },
		last_summary_path: null,
		created_at: "2026-04-25T00:00:00Z",
		updated_at: "2026-04-25T00:00:00Z",
		history: [],
		previous_run_id: null,
		run_kind: "change",
		...overrides,
	} as RunState;
}

function inMemoryStore(records: Map<string, string>): RunArtifactStore {
	return {
		read: async (ref: RunArtifactRef): Promise<string> => {
			const key = `${ref.runId}/${ref.type}`;
			const value = records.get(key);
			if (value === undefined) throw new Error(`not found: ${key}`);
			return value;
		},
		write: async (ref: RunArtifactRef, content: string): Promise<void> => {
			records.set(`${ref.runId}/${ref.type}`, content);
		},
		exists: async (ref: RunArtifactRef): Promise<boolean> =>
			records.has(`${ref.runId}/${ref.type}`),
		list: async (
			_query?: RunArtifactQuery,
		): Promise<readonly RunArtifactRef[]> => [],
	};
}

test("resolveWorktreeForRun returns the persisted worktree tuple", async () => {
	const records = new Map<string, string>();
	const state = buildRunState({});
	records.set("wt-1/run-state", JSON.stringify(state));
	const store = inMemoryStore(records);

	const resolution = await resolveWorktreeForRun(store, "wt-1");

	assert.equal(resolution.repoPath, "/repo");
	assert.equal(resolution.worktreePath, "/repo/.specflow/worktrees/wt/main");
	assert.equal(resolution.branchName, "wt");
	assert.equal(resolution.baseCommit, "deadbeef");
	assert.equal(resolution.baseBranch, "main");
	assert.equal(resolution.cleanupPending, false);
});

test("resolveWorktreeForRun returns repo_path-equal worktree_path for legacy records", async () => {
	const records = new Map<string, string>();
	// Legacy record: worktree_path == repo_path
	const legacyState = buildRunState({
		repo_path: "/legacy",
		worktree_path: "/legacy",
		base_commit: "",
		base_branch: null,
	});
	records.set("legacy-1/run-state", JSON.stringify(legacyState));
	const store = inMemoryStore(records);

	const resolution = await resolveWorktreeForRun(store, "legacy-1");
	assert.equal(resolution.repoPath, resolution.worktreePath);
	assert.equal(resolution.baseCommit, "");
	assert.equal(resolution.baseBranch, null);
});

test("resolveWorktreeForRunOrNull returns null when the run does not exist", async () => {
	const store = inMemoryStore(new Map());
	const resolution = await resolveWorktreeForRunOrNull(store, "missing-1");
	assert.equal(resolution, null);
});

test("resolveWorktreeForRunOrNull returns the resolution when present", async () => {
	const records = new Map<string, string>();
	const state = buildRunState({});
	records.set("wt-1/run-state", JSON.stringify(state));
	const store = inMemoryStore(records);

	const resolution = await resolveWorktreeForRunOrNull(store, "wt-1");
	assert.notEqual(resolution, null);
	assert.equal(resolution?.worktreePath, "/repo/.specflow/worktrees/wt/main");
});

// --- resolveChangeRootForRun ---

test("resolveChangeRootForRun returns worktree_path for a normal worktree-mode run", async () => {
	const records = new Map<string, string>();
	const state = buildRunState({
		run_id: "cr-1",
		change_name: "cr",
		repo_path: "/repo",
		worktree_path: "/repo/.specflow/worktrees/cr/main",
		run_kind: "change",
	});
	records.set("cr-1/run-state", JSON.stringify(state));
	const store = inMemoryStore(records);

	const result = await resolveChangeRootForRun(store, "cr-1", "/repo");
	assert.equal(result, "/repo/.specflow/worktrees/cr/main");
});

test("resolveChangeRootForRun falls back to repoRoot when runId is undefined", async () => {
	const store = inMemoryStore(new Map());
	const result = await resolveChangeRootForRun(store, undefined, "/repo");
	assert.equal(result, "/repo");
});

test("resolveChangeRootForRun falls back to repoRoot when run does not exist", async () => {
	const store = inMemoryStore(new Map());
	const result = await resolveChangeRootForRun(store, "missing-1", "/repo");
	assert.equal(result, "/repo");
});

test("resolveChangeRootForRun throws for non-synthetic run with worktree_path == repo_path (legacy guard)", async () => {
	const records = new Map<string, string>();
	const legacyState = buildRunState({
		run_id: "legacy-1",
		repo_path: "/repo",
		worktree_path: "/repo",
		run_kind: "change",
	});
	records.set("legacy-1/run-state", JSON.stringify(legacyState));
	const store = inMemoryStore(records);

	await assert.rejects(
		() => resolveChangeRootForRun(store, "legacy-1", "/repo"),
		(err: Error) =>
			err.message.includes("legacy layout") && err.message.includes("legacy-1"),
	);
});

test("resolveChangeRootForRun allows synthetic run with worktree_path == repo_path", async () => {
	const records = new Map<string, string>();
	const syntheticState = buildRunState({
		run_id: "syn-1",
		repo_path: "/repo",
		worktree_path: "/repo",
		run_kind: "synthetic",
	});
	records.set("syn-1/run-state", JSON.stringify(syntheticState));
	const store = inMemoryStore(records);

	const result = await resolveChangeRootForRun(store, "syn-1", "/repo");
	assert.equal(result, "/repo");
});

test("resolveWorktreeForRun fills defaults for missing base_commit/base_branch/cleanup_pending fields", async () => {
	// Simulate a legacy record on disk that does not yet carry the new fields.
	const records = new Map<string, string>();
	const tempRoot = makeTempDir("worktree-resolver-legacy-");
	try {
		const runsDir = join(tempRoot, ".specflow/runs/legacy-noflds-1");
		mkdirSync(runsDir, { recursive: true });
		const minimalRecord = {
			run_id: "legacy-noflds-1",
			change_name: "legacy-noflds",
			current_phase: "spec_ready",
			status: "active",
			allowed_events: [],
			source: null,
			project_id: "fixture",
			repo_name: "fixture",
			repo_path: "/legacy",
			branch_name: "legacy-noflds",
			worktree_path: "/legacy",
			agents: { main: "claude", review: "codex" },
			last_summary_path: null,
			created_at: "2026-04-25T00:00:00Z",
			updated_at: "2026-04-25T00:00:00Z",
			history: [],
			previous_run_id: null,
			run_kind: "change",
		};
		writeFileSync(
			join(runsDir, "run.json"),
			JSON.stringify(minimalRecord, null, 2),
			"utf8",
		);
		records.set("legacy-noflds-1/run-state", JSON.stringify(minimalRecord));
		const store = inMemoryStore(records);

		const resolution = await resolveWorktreeForRun(store, "legacy-noflds-1");
		assert.equal(resolution.baseCommit, "");
		assert.equal(resolution.baseBranch, null);
		assert.equal(resolution.cleanupPending, false);
	} finally {
		removeTempDir(tempRoot);
	}
});
