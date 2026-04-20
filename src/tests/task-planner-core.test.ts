import assert from "node:assert/strict";
import test from "node:test";
import type { LlmClient } from "../lib/task-planner/generate.js";
import { generateTaskGraph } from "../lib/task-planner/generate.js";
import { renderTasksMd } from "../lib/task-planner/render.js";
import { updateBundleStatus } from "../lib/task-planner/status.js";
import type { TaskGraph } from "../lib/task-planner/types.js";
import {
	checkBundleCompletion,
	selectNextWindow,
} from "../lib/task-planner/window.js";

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

test("generateTaskGraph: emits size_score = tasks.length on every bundle", async () => {
	const graph = sampleGraph();
	// The fixture's LLM response intentionally omits size_score so we can verify
	// the generator attaches it during post-processing (not via the LLM).
	const client = mockLlmClient([JSON.stringify(graph)]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		["artifact-ownership-model", "task-planner"],
		client,
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	for (const bundle of result.taskGraph.bundles) {
		assert.equal(
			bundle.size_score,
			bundle.tasks.length,
			`bundle ${bundle.id} size_score should equal tasks.length`,
		);
	}
});

test("generateTaskGraph: normalizes LLM-emitted stale size_score (R3-F06)", async () => {
	// Simulate an LLM that emits size_score inconsistent with tasks.length.
	// After the R2-F04 schema tightening, validating the raw LLM output would
	// fail. The generator must strip size_score BEFORE validation and reapply
	// the canonical value via withSizeScore.
	const rawWithStaleScore = {
		version: "1.0",
		change_id: "test-change",
		generated_at: "2026-04-14T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "one",
				title: "One",
				goal: "g",
				depends_on: [],
				inputs: [],
				outputs: ["o"],
				status: "pending",
				tasks: [
					{ id: "1", title: "a", status: "pending" },
					{ id: "2", title: "b", status: "pending" },
				],
				owner_capabilities: ["task-planner"],
				size_score: 99, // stale / mismatched
			},
		],
	};
	const client = mockLlmClient([JSON.stringify(rawWithStaleScore)]);
	const result = await generateTaskGraph(
		"# Design",
		"test-change",
		["task-planner"],
		client,
		{ maxRetries: 1 },
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.taskGraph.bundles[0]?.size_score, 2);
});

test("generateTaskGraph: size_score is zero for bundles with empty tasks", async () => {
	const graph: TaskGraph = {
		version: "1.0",
		change_id: "test-change",
		generated_at: "2026-04-14T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "empty",
				title: "Empty Bundle",
				goal: "No tasks yet",
				depends_on: [],
				inputs: [],
				outputs: [],
				status: "pending",
				tasks: [],
				owner_capabilities: ["task-planner"],
			},
		],
	};
	const client = mockLlmClient([JSON.stringify(graph)]);
	const result = await generateTaskGraph("# Design", "test-change", [], client);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.taskGraph.bundles[0]?.size_score, 0);
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

// --- Child-task normalization on terminal transitions (issue #142) ---

function inProgressSchemaGraph(): TaskGraph {
	const base = sampleGraph();
	return {
		...base,
		bundles: [
			{ ...base.bundles[0], status: "in_progress" },
			...base.bundles.slice(1),
		],
	};
}

test("updateBundleStatus: bundle → done coerces all pending children to done and reports coercions", () => {
	const graph = inProgressSchemaGraph();
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	assert.equal(updated?.status, "done");
	for (const task of updated?.tasks ?? []) {
		assert.equal(task.status, "done");
	}
	assert.equal(result.coercions.length, 2);
	for (const coercion of result.coercions) {
		assert.equal(coercion.bundleId, "schema");
		assert.equal(coercion.from, "pending");
		assert.equal(coercion.to, "done");
	}
	assert.deepEqual([...result.coercions].map((c) => c.taskId).sort(), [
		"1",
		"2",
	]);
});

test("updateBundleStatus: bundle → skipped coerces all pending children to skipped and reports coercions", () => {
	const result = updateBundleStatus(sampleGraph(), "schema", "skipped");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	assert.equal(updated?.status, "skipped");
	for (const task of updated?.tasks ?? []) {
		assert.equal(task.status, "skipped");
	}
	assert.equal(result.coercions.length, 2);
	assert.ok(result.coercions.every((c) => c.to === "skipped"));
	assert.ok(result.coercions.every((c) => c.from === "pending"));
});

test("updateBundleStatus: no-op children (already matching target) produce no coercion entries", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [
			{
				...base.bundles[0],
				status: "in_progress",
				tasks: base.bundles[0].tasks.map((t) => ({ ...t, status: "done" })),
			},
			...base.bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.coercions.length, 0);
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	assert.equal(updated?.status, "done");
	for (const task of updated?.tasks ?? []) {
		assert.equal(task.status, "done");
	}
});

test("updateBundleStatus: non-terminal transition returns empty coercions and leaves task statuses untouched", () => {
	const result = updateBundleStatus(sampleGraph(), "schema", "in_progress");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.coercions.length, 0);
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	for (const task of updated?.tasks ?? []) {
		assert.equal(task.status, "pending");
	}
});

test("updateBundleStatus: empty-bundle terminal transition updates bundle status and returns empty coercions", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [
			{ ...base.bundles[0], status: "in_progress", tasks: [] },
			...base.bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.coercions.length, 0);
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	assert.equal(updated?.status, "done");
	assert.equal(updated?.tasks.length, 0);
});

test("updateBundleStatus: conflicting prior terminal child (done when bundle → skipped) is force-coerced and reported", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [
			{
				...base.bundles[0],
				status: "pending",
				tasks: [
					{ id: "1", title: "Already done", status: "done" },
					{ id: "2", title: "Still pending", status: "pending" },
				],
			},
			...base.bundles.slice(1),
		],
	};
	const result = updateBundleStatus(graph, "schema", "skipped");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const updated = result.taskGraph.bundles.find((b) => b.id === "schema");
	assert.equal(updated?.status, "skipped");
	for (const task of updated?.tasks ?? []) {
		assert.equal(task.status, "skipped");
	}
	assert.equal(result.coercions.length, 2);
	const byTaskId = new Map(result.coercions.map((c) => [c.taskId, c]));
	assert.equal(byTaskId.get("1")?.from, "done");
	assert.equal(byTaskId.get("1")?.to, "skipped");
	assert.equal(byTaskId.get("2")?.from, "pending");
	assert.equal(byTaskId.get("2")?.to, "skipped");
});

test("updateBundleStatus: terminal transition does not mutate input TaskGraph or nested arrays", () => {
	const original = inProgressSchemaGraph();
	const beforeBundles = original.bundles;
	const beforeTasks = original.bundles[0].tasks;
	const beforeStatuses = original.bundles[0].tasks.map((t) => t.status);
	const result = updateBundleStatus(original, "schema", "done");
	assert.equal(result.ok, true);
	// Input reference equality preserved
	assert.strictEqual(original.bundles, beforeBundles);
	assert.strictEqual(original.bundles[0].tasks, beforeTasks);
	// Per-task statuses on the input unchanged
	assert.deepEqual(
		original.bundles[0].tasks.map((t) => t.status),
		beforeStatuses,
	);
	if (result.ok) {
		// Output is a different reference
		assert.notStrictEqual(result.taskGraph.bundles, original.bundles);
		assert.notStrictEqual(
			result.taskGraph.bundles[0].tasks,
			original.bundles[0].tasks,
		);
	}
});

test("updateBundleStatus: rejected transitions (done → pending) return ok:false with no coercions", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [{ ...base.bundles[0], status: "done" }, ...base.bundles.slice(1)],
	};
	const result = updateBundleStatus(graph, "schema", "pending");
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.ok(result.error.includes("Invalid status transition"));
		// Errors have no `coercions` field; this check is structural.
		assert.equal(
			(result as unknown as { coercions?: unknown }).coercions,
			undefined,
		);
	}
});

// --- Renderer consistency after normalization (issue #142) ---

test("renderTasksMd: after bundle → done, rendered checkboxes under the done header are checked", () => {
	const graph = inProgressSchemaGraph();
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const md = renderTasksMd(result.taskGraph);
	// Header shows ✓ and every child task in the schema bundle renders as [x]
	assert.ok(md.includes("## 1. Define Schema ✓"));
	assert.ok(md.includes("- [x] 1.1 Create types.ts"));
	assert.ok(md.includes("- [x] 1.2 Create schema.ts"));
	// No unchecked schema task lines
	assert.ok(!md.includes("- [ ] 1.1"), "no pending schema task checkbox");
	assert.ok(!md.includes("- [ ] 1.2"), "no pending schema task checkbox");
});

test("renderTasksMd: after bundle → skipped, rendered section reflects skipped state consistently", () => {
	const result = updateBundleStatus(sampleGraph(), "schema", "skipped");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const md = renderTasksMd(result.taskGraph);
	assert.ok(md.includes("## 1. Define Schema (skipped)"));
	assert.ok(md.includes("- [-] 1.1 Create types.ts"));
	assert.ok(md.includes("- [-] 1.2 Create schema.ts"));
	// No pending schema task lines
	assert.ok(!md.includes("- [ ] 1.1"), "no pending schema task checkbox");
	assert.ok(!md.includes("- [ ] 1.2"), "no pending schema task checkbox");
});

test("renderTasksMd: unchanged — produces the same output when invoked directly with a normalized graph", () => {
	// Guard that the renderer itself was not special-cased. Rendering a
	// terminal-normalized graph via the existing function (no extra flags)
	// must yield a consistent checklist.
	const graph = inProgressSchemaGraph();
	const result = updateBundleStatus(graph, "schema", "done");
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const first = renderTasksMd(result.taskGraph);
	const second = renderTasksMd(result.taskGraph);
	assert.equal(first, second);
});
