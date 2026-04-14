import assert from "node:assert/strict";
import test from "node:test";
import { checkBundleCompletion } from "../lib/task-planner/completion.js";
import type { LlmClient } from "../lib/task-planner/generate.js";
import { generateTaskGraph } from "../lib/task-planner/generate.js";
import { renderTasksMd } from "../lib/task-planner/render.js";
import { updateBundleStatus } from "../lib/task-planner/status.js";
import type { TaskGraph } from "../lib/task-planner/types.js";
import { selectNextWindow } from "../lib/task-planner/window.js";

// --- Fixtures ---

function sampleGraph(): TaskGraph {
	return {
		version: "1.0",
		change_id: "test-change",
		generated_at: "2026-04-14T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "schema",
				title: "Define Schema",
				goal: "Create the task graph schema",
				depends_on: [],
				inputs: [],
				outputs: ["src/lib/task-planner/types.ts"],
				status: "pending",
				tasks: [
					{ id: "1", title: "Create types.ts", status: "pending" },
					{ id: "2", title: "Create schema.ts", status: "pending" },
				],
				owner_capabilities: ["artifact-ownership-model"],
			},
			{
				id: "generation",
				title: "Implement Generation",
				goal: "Generate task graph from design",
				depends_on: ["schema"],
				inputs: ["src/lib/task-planner/types.ts"],
				outputs: ["src/lib/task-planner/generate.ts"],
				status: "pending",
				tasks: [
					{ id: "1", title: "Define LlmClient interface", status: "pending" },
					{ id: "2", title: "Implement generateTaskGraph", status: "pending" },
				],
				owner_capabilities: ["task-planner"],
			},
			{
				id: "rendering",
				title: "Implement Rendering",
				goal: "Render tasks.md from task graph",
				depends_on: ["schema"],
				inputs: ["src/lib/task-planner/types.ts"],
				outputs: ["src/lib/task-planner/render.ts"],
				status: "pending",
				tasks: [
					{ id: "1", title: "Implement renderTasksMd", status: "pending" },
				],
				owner_capabilities: ["task-planner"],
			},
		],
	};
}

// --- generateTaskGraph tests ---

function mockLlmClient(responses: readonly string[]): LlmClient {
	let callIndex = 0;
	return {
		async generateJson(_sys: string, _user: string): Promise<string> {
			const response = responses[callIndex] ?? "{}";
			callIndex++;
			return response;
		},
	};
}

test("generateTaskGraph: success on first attempt", async () => {
	const graph = sampleGraph();
	const client = mockLlmClient([JSON.stringify(graph)]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		["artifact-ownership-model", "task-planner"],
		client,
	);
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.taskGraph.change_id, "test-change");
		assert.equal(result.taskGraph.bundles.length, 3);
	}
});

test("generateTaskGraph: retries on validation failure then succeeds", async () => {
	const graph = sampleGraph();
	const client = mockLlmClient(['{"invalid": true}', JSON.stringify(graph)]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		["artifact-ownership-model"],
		client,
		{ maxRetries: 3 },
	);
	assert.equal(result.ok, true);
});

test("generateTaskGraph: fails after all retries exhausted", async () => {
	const client = mockLlmClient([
		"not json",
		'{"bad": true}',
		'{"also": "bad"}',
	]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		[],
		client,
		{ maxRetries: 3 },
	);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.ok(result.error.includes("failed after 3 attempts"));
	}
});

test("generateTaskGraph: retries on JSON parse error", async () => {
	const graph = sampleGraph();
	const client = mockLlmClient(["not json at all", JSON.stringify(graph)]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		[],
		client,
		{ maxRetries: 2 },
	);
	assert.equal(result.ok, true);
});

// --- renderTasksMd tests ---

test("renderTasksMd: renders all bundles", () => {
	const md = renderTasksMd(sampleGraph());
	assert.ok(md.includes("## 1. Define Schema"));
	assert.ok(md.includes("## 2. Implement Generation"));
	assert.ok(md.includes("## 3. Implement Rendering"));
});

test("renderTasksMd: renders task checkboxes", () => {
	const md = renderTasksMd(sampleGraph());
	assert.ok(md.includes("- [ ] 1.1 Create types.ts"));
	assert.ok(md.includes("- [ ] 1.2 Create schema.ts"));
});

test("renderTasksMd: renders dependency info", () => {
	const md = renderTasksMd(sampleGraph());
	assert.ok(md.includes("Depends on: schema"));
});

test("renderTasksMd: is idempotent", () => {
	const graph = sampleGraph();
	const first = renderTasksMd(graph);
	const second = renderTasksMd(graph);
	assert.equal(first, second);
});

test("renderTasksMd: renders status indicators for done bundles", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: [
			{ ...sampleGraph().bundles[0], status: "done" },
			...sampleGraph().bundles.slice(1),
		],
	};
	const md = renderTasksMd(graph);
	assert.ok(md.includes("## 1. Define Schema ✓"));
});

// --- checkBundleCompletion tests ---

test("checkBundleCompletion: all outputs present returns true", () => {
	const bundle = sampleGraph().bundles[0];
	const checker = (ref: string) => ref === "src/lib/task-planner/types.ts";
	assert.equal(checkBundleCompletion(bundle, checker), true);
});

test("checkBundleCompletion: missing output returns false", () => {
	const bundle = sampleGraph().bundles[0];
	const checker = (_ref: string) => false;
	assert.equal(checkBundleCompletion(bundle, checker), false);
});

test("checkBundleCompletion: empty outputs returns true", () => {
	const bundle = { ...sampleGraph().bundles[0], outputs: [] as string[] };
	const checker = (_ref: string) => false;
	assert.equal(checkBundleCompletion(bundle, checker), true);
});

// --- selectNextWindow tests ---

test("selectNextWindow: independent pending bundles are all eligible", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: sampleGraph().bundles.map((b) => ({
			...b,
			depends_on: [] as string[],
		})),
	};
	const checker = (_ref: string) => false;
	const window = selectNextWindow(graph, checker);
	assert.equal(window.length, 3);
});

test("selectNextWindow: dependent bundle eligible when dep outputs exist", () => {
	const graph = sampleGraph();
	const checker = (ref: string) => ref === "src/lib/task-planner/types.ts";
	const window = selectNextWindow(graph, checker);
	// schema (no deps), generation (dep outputs exist), rendering (dep outputs exist)
	assert.equal(window.length, 3);
});

test("selectNextWindow: dependent bundle not eligible when dep outputs missing", () => {
	const graph = sampleGraph();
	const checker = (_ref: string) => false;
	const window = selectNextWindow(graph, checker);
	// Only schema (no deps)
	assert.equal(window.length, 1);
	assert.equal(window[0].id, "schema");
});

test("selectNextWindow: non-pending bundles excluded", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: [
			{ ...sampleGraph().bundles[0], status: "done" },
			{ ...sampleGraph().bundles[1], status: "in_progress" },
			sampleGraph().bundles[2],
		],
	};
	const checker = (ref: string) => ref === "src/lib/task-planner/types.ts";
	const window = selectNextWindow(graph, checker);
	assert.equal(window.length, 1);
	assert.equal(window[0].id, "rendering");
});

// --- updateBundleStatus tests ---

test("updateBundleStatus: pending → in_progress succeeds", () => {
	const result = updateBundleStatus(sampleGraph(), "schema", "in_progress");
	assert.equal(result.ok, true);
	if (result.ok) {
		const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
		assert.equal(updated?.status, "in_progress");
	}
});

test("updateBundleStatus: in_progress → done succeeds", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: [
			{ ...sampleGraph().bundles[0], status: "in_progress" },
			...sampleGraph().bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (result.ok) {
		const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
		assert.equal(updated?.status, "done");
	}
});

test("updateBundleStatus: pending → skipped succeeds", () => {
	const result = updateBundleStatus(sampleGraph(), "schema", "skipped");
	assert.equal(result.ok, true);
	if (result.ok) {
		const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
		assert.equal(updated?.status, "skipped");
	}
});

test("updateBundleStatus: done → pending is rejected", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: [
			{ ...sampleGraph().bundles[0], status: "done" },
			...sampleGraph().bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "pending");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.ok(result.error.includes("Invalid status transition"));
	}
});

test("updateBundleStatus: skipped → in_progress is rejected", () => {
	const graph: TaskGraph = {
		...sampleGraph(),
		bundles: [
			{ ...sampleGraph().bundles[0], status: "skipped" },
			...sampleGraph().bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "in_progress");
	assert.equal(result.ok, false);
});

test("updateBundleStatus: unknown bundle returns error", () => {
	const result = updateBundleStatus(sampleGraph(), "nonexistent", "done");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.ok(result.error.includes("Bundle not found"));
	}
});

test("updateBundleStatus: does not mutate original graph", () => {
	const original = sampleGraph();
	const originalStatus = original.bundles[0].status;
	const result = updateBundleStatus(original, "schema", "in_progress");
	assert.equal(result.ok, true);
	// Original unchanged
	assert.equal(original.bundles[0].status, originalStatus);
	if (result.ok) {
		assert.equal(result.taskGraph.bundles[0].status, "in_progress");
		// Different reference
		assert.notEqual(result.taskGraph, original);
		assert.notEqual(result.taskGraph.bundles, original.bundles);
	}
});
