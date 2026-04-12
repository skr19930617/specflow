import assert from "node:assert/strict";
import test from "node:test";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import type {
	RunArtifactQuery,
	RunArtifactRef,
} from "../lib/artifact-types.js";
import {
	extractSequence,
	findLatestRun,
	findRunsForChange,
	generateRunId,
	readRunState,
} from "../lib/run-store-ops.js";

// --- Mock RunArtifactStore ---

function createMockStore(data: Map<string, string>): RunArtifactStore {
	return {
		read(ref: RunArtifactRef): string {
			const content = data.get(ref.runId);
			if (content === undefined) {
				throw new Error(`Not found: ${ref.runId}`);
			}
			return content;
		},
		write(ref: RunArtifactRef, content: string): void {
			data.set(ref.runId, content);
		},
		exists(ref: RunArtifactRef): boolean {
			return data.has(ref.runId);
		},
		list(query?: RunArtifactQuery): readonly RunArtifactRef[] {
			const entries = [...data.keys()].sort(); // lexicographic
			return entries
				.filter((runId) => {
					if (!query?.changeId) return true;
					const prefix = `${query.changeId}-`;
					if (!runId.startsWith(prefix)) return false;
					const suffix = runId.slice(prefix.length);
					const num = Number.parseInt(suffix, 10);
					return !Number.isNaN(num) && num >= 1 && String(num) === suffix;
				})
				.map((runId) => ({ runId, type: "run-state" as const }));
		},
	};
}

function makeRunJson(runId: string, phase = "proposal_draft"): string {
	return JSON.stringify({
		run_id: runId,
		change_name: runId.replace(/-\d+$/, ""),
		current_phase: phase,
		status: "active",
		allowed_events: [],
		source: null,
		project_id: "test/repo",
		repo_name: "test/repo",
		repo_path: "/tmp/test",
		branch_name: "main",
		worktree_path: "/tmp/test",
		agents: { main: "claude", review: "codex" },
		last_summary_path: null,
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		history: [],
		previous_run_id: null,
	});
}

// --- extractSequence ---

test("extractSequence: parses valid sequence", () => {
	assert.equal(extractSequence("my-change-1", "my-change"), 1);
	assert.equal(extractSequence("my-change-10", "my-change"), 10);
	assert.equal(extractSequence("my-change-99", "my-change"), 99);
});

test("extractSequence: returns null for non-matching prefix", () => {
	assert.equal(extractSequence("other-1", "my-change"), null);
});

test("extractSequence: returns null for invalid suffix", () => {
	assert.equal(extractSequence("my-change-0", "my-change"), null);
	assert.equal(extractSequence("my-change-abc", "my-change"), null);
	assert.equal(extractSequence("my-change-", "my-change"), null);
	assert.equal(extractSequence("my-change-01", "my-change"), null);
});

// --- readRunState ---

test("readRunState: reads and parses from store", () => {
	const data = new Map([["test-1", makeRunJson("test-1")]]);
	const store = createMockStore(data);
	const state = readRunState(store, "test-1");
	assert.equal(state.run_id, "test-1");
	assert.equal(state.current_phase, "proposal_draft");
});

test("readRunState: applies backward-compatibility fallback for missing run_id", () => {
	const data = new Map([["test-1", '{"current_phase":"start"}']]);
	const store = createMockStore(data);
	const state = readRunState(store, "test-1");
	assert.equal(state.run_id, "test-1");
	assert.equal(state.status, "active");
});

// --- findRunsForChange with double-digit IDs ---

test("findRunsForChange: returns runs sorted by numeric sequence, not lexicographic", () => {
	const data = new Map([
		["change-1", makeRunJson("change-1")],
		["change-10", makeRunJson("change-10")],
		["change-2", makeRunJson("change-2")],
	]);
	const store = createMockStore(data);
	const runs = findRunsForChange(store, "change");
	const ids = runs.map((r) => r.run_id);
	assert.deepEqual(ids, ["change-1", "change-2", "change-10"]);
});

test("findRunsForChange: returns empty for no runs", () => {
	const store = createMockStore(new Map());
	const runs = findRunsForChange(store, "nonexistent");
	assert.deepEqual(runs, []);
});

// --- findLatestRun ---

test("findLatestRun: selects highest sequence number, not last lexicographic", () => {
	const data = new Map([
		["change-1", makeRunJson("change-1")],
		["change-10", makeRunJson("change-10")],
		["change-2", makeRunJson("change-2")],
	]);
	const store = createMockStore(data);
	const latest = findLatestRun(store, "change");
	assert.equal(latest?.run_id, "change-10");
});

test("findLatestRun: returns null for no runs", () => {
	const store = createMockStore(new Map());
	assert.equal(findLatestRun(store, "change"), null);
});

// --- generateRunId ---

test("generateRunId: produces change-11 from change-1, change-10, change-2", () => {
	const data = new Map([
		["change-1", makeRunJson("change-1")],
		["change-10", makeRunJson("change-10")],
		["change-2", makeRunJson("change-2")],
	]);
	const store = createMockStore(data);
	assert.equal(generateRunId(store, "change"), "change-11");
});

test("generateRunId: produces change-1 when no prior runs exist", () => {
	const store = createMockStore(new Map());
	assert.equal(generateRunId(store, "change"), "change-1");
});

test("generateRunId: produces change-3 from change-1, change-2", () => {
	const data = new Map([
		["change-1", makeRunJson("change-1")],
		["change-2", makeRunJson("change-2")],
	]);
	const store = createMockStore(data);
	assert.equal(generateRunId(store, "change"), "change-3");
});
