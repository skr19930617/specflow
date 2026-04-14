import assert from "node:assert/strict";
import test from "node:test";
import { validateTaskGraph } from "../lib/task-planner/schema.js";
import type { TaskGraph } from "../lib/task-planner/types.js";

function validGraph(overrides?: Partial<TaskGraph>): TaskGraph {
	return {
		version: "1.0",
		change_id: "test-change",
		generated_at: "2026-04-14T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "bundle-a",
				title: "Bundle A",
				goal: "Do A",
				depends_on: [],
				inputs: [],
				outputs: ["src/a.ts"],
				status: "pending",
				tasks: [{ id: "a-1", title: "Task A1", status: "pending" }],
				owner_capabilities: ["artifact-ownership-model"],
			},
			{
				id: "bundle-b",
				title: "Bundle B",
				goal: "Do B",
				depends_on: ["bundle-a"],
				inputs: ["src/a.ts"],
				outputs: ["src/b.ts"],
				status: "pending",
				tasks: [{ id: "b-1", title: "Task B1", status: "pending" }],
				owner_capabilities: ["workflow-run-state"],
			},
		],
		...overrides,
	};
}

test("validateTaskGraph: valid graph passes", () => {
	const result = validateTaskGraph(validGraph());
	assert.equal(result.valid, true);
	assert.equal(result.errors.length, 0);
});

test("validateTaskGraph: rejects non-object root", () => {
	const result = validateTaskGraph("not an object");
	assert.equal(result.valid, false);
	assert.ok(result.errors[0]?.includes("Root must be a non-null object"));
});

test("validateTaskGraph: rejects null root", () => {
	const result = validateTaskGraph(null);
	assert.equal(result.valid, false);
});

test("validateTaskGraph: rejects missing version", () => {
	const { version: _, ...rest } = validGraph();
	const result = validateTaskGraph(rest);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("version")));
});

test("validateTaskGraph: rejects missing change_id", () => {
	const { change_id: _, ...rest } = validGraph();
	const result = validateTaskGraph(rest);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("change_id")));
});

test("validateTaskGraph: rejects missing bundles array", () => {
	const { bundles: _, ...rest } = validGraph();
	const result = validateTaskGraph(rest);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("bundles")));
});

test("validateTaskGraph: rejects duplicate bundle IDs", () => {
	const graph = validGraph();
	const dupe = {
		...graph,
		bundles: [
			graph.bundles[0],
			{ ...graph.bundles[1], id: "bundle-a", depends_on: [] },
		],
	};
	const result = validateTaskGraph(dupe);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("duplicate bundle ID")));
});

test("validateTaskGraph: rejects invalid depends_on references", () => {
	const graph = validGraph();
	const bad = {
		...graph,
		bundles: [
			{ ...graph.bundles[0], depends_on: ["nonexistent"] },
			graph.bundles[1],
		],
	};
	const result = validateTaskGraph(bad);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("non-existent bundle")));
});

test("validateTaskGraph: detects circular dependencies", () => {
	const graph = {
		version: "1.0",
		change_id: "test",
		generated_at: "2026-04-14T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "a",
				title: "A",
				goal: "A",
				depends_on: ["b"],
				inputs: [],
				outputs: [],
				status: "pending",
				tasks: [],
				owner_capabilities: [],
			},
			{
				id: "b",
				title: "B",
				goal: "B",
				depends_on: ["a"],
				inputs: [],
				outputs: [],
				status: "pending",
				tasks: [],
				owner_capabilities: [],
			},
		],
	};
	const result = validateTaskGraph(graph);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("Circular dependency")));
});

test("validateTaskGraph: rejects invalid bundle status", () => {
	const graph = validGraph();
	const bad = {
		...graph,
		bundles: [
			{ ...graph.bundles[0], status: "invalid" },
			{ ...graph.bundles[1], depends_on: [] },
		],
	};
	const result = validateTaskGraph(bad);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("status")));
});

test("validateTaskGraph: rejects duplicate task IDs within bundle", () => {
	const graph = validGraph();
	const bad = {
		...graph,
		bundles: [
			{
				...graph.bundles[0],
				tasks: [
					{ id: "t-1", title: "Task 1", status: "pending" },
					{ id: "t-1", title: "Task 2", status: "pending" },
				],
			},
			graph.bundles[1],
		],
	};
	const result = validateTaskGraph(bad);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => e.includes("duplicate task ID")));
});

test("validateTaskGraph: accepts empty bundles array", () => {
	const result = validateTaskGraph(validGraph({ bundles: [] }));
	assert.equal(result.valid, true);
});

test("validateTaskGraph: accepts empty tasks array in bundle", () => {
	const graph = validGraph();
	const withEmptyTasks = {
		...graph,
		bundles: [
			{ ...graph.bundles[0], tasks: [] },
			{ ...graph.bundles[1], tasks: [] },
		],
	};
	const result = validateTaskGraph(withEmptyTasks);
	assert.equal(result.valid, true);
});
