// Unit tests for resolveRunId — all five spec scenarios.

import assert from "node:assert/strict";
import test from "node:test";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import type {
	RunArtifactQuery,
	RunArtifactRef,
} from "../lib/artifact-types.js";
import { resolveRunId } from "../lib/run-store-ops.js";

// --- Mock RunArtifactStore (async, same pattern as run-store-ops.test.ts) ---

function createMockStore(data: Map<string, string>): RunArtifactStore {
	return {
		async read(ref: RunArtifactRef): Promise<string> {
			const content = data.get(ref.runId);
			if (content === undefined) {
				throw new Error(`Not found: ${ref.runId}`);
			}
			return content;
		},
		async write(ref: RunArtifactRef, content: string): Promise<void> {
			data.set(ref.runId, content);
		},
		async exists(ref: RunArtifactRef): Promise<boolean> {
			return data.has(ref.runId);
		},
		async list(query?: RunArtifactQuery): Promise<readonly RunArtifactRef[]> {
			const entries = [...data.keys()].sort();
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

function makeRunJson(
	runId: string,
	status: "active" | "suspended" | "terminal",
	phase = "proposal_draft",
): string {
	return JSON.stringify({
		run_id: runId,
		change_name: runId.replace(/-\d+$/, ""),
		current_phase: phase,
		status,
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

test("resolveRunId: returns run_id for single active run", async () => {
	const data = new Map<string, string>();
	data.set("my-feature-1", makeRunJson("my-feature-1", "terminal", "approved"));
	data.set("my-feature-2", makeRunJson("my-feature-2", "active"));
	const store = createMockStore(data);

	const result = await resolveRunId(store, "my-feature");
	assert.deepStrictEqual(result, { ok: true, value: "my-feature-2" });
});

test("resolveRunId: returns run_id for suspended run when no active exists", async () => {
	const data = new Map<string, string>();
	data.set("my-feature-1", makeRunJson("my-feature-1", "terminal", "approved"));
	data.set(
		"my-feature-3",
		makeRunJson("my-feature-3", "suspended", "design_draft"),
	);
	const store = createMockStore(data);

	const result = await resolveRunId(store, "my-feature");
	assert.deepStrictEqual(result, { ok: true, value: "my-feature-3" });
});

test("resolveRunId: returns no_active_run error when all runs are terminal", async () => {
	const data = new Map<string, string>();
	data.set("my-feature-1", makeRunJson("my-feature-1", "terminal", "approved"));
	data.set("my-feature-2", makeRunJson("my-feature-2", "terminal", "rejected"));
	const store = createMockStore(data);

	const result = await resolveRunId(store, "my-feature");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.kind, "no_active_run");
		assert.match(result.error.message, /No active or suspended run/);
	}
});

test("resolveRunId: returns change_not_found error when changeId has no runs", async () => {
	const store = createMockStore(new Map());

	const result = await resolveRunId(store, "nonexistent");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.kind, "change_not_found");
		assert.match(result.error.message, /No runs found/);
	}
});

test("resolveRunId: returns multiple_active_runs error when ambiguous", async () => {
	const data = new Map<string, string>();
	data.set("my-feature-1", makeRunJson("my-feature-1", "active"));
	data.set("my-feature-2", makeRunJson("my-feature-2", "active"));
	const store = createMockStore(data);

	const result = await resolveRunId(store, "my-feature");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.kind, "multiple_active_runs");
		assert.match(result.error.message, /Invariant violation/);
	}
});
