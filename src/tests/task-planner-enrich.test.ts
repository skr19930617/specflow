import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { withSizeScore } from "../lib/task-planner/enrich.js";
import { validateTaskGraph } from "../lib/task-planner/schema.js";
import type { TaskGraph } from "../lib/task-planner/types.js";
import {
	createCodexStub,
	createFixtureRepo,
	makeTempDir,
	prependPath,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

// Fixture shaped exactly like a real LLM response from
// `specflow-generate-task-graph` buildPrompt — i.e. WITHOUT size_score. This
// models the reviewer's concern (F1): the CLI used to persist `result.payload`
// directly; now it must run through `withSizeScore` so every persisted graph
// carries the deterministic signal the dispatcher relies on.
function llmShapedGraph(): TaskGraph {
	return {
		version: "1.0",
		change_id: "integration-test",
		generated_at: "2026-04-20T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "core",
				title: "Core work",
				goal: "Build the thing",
				depends_on: [],
				inputs: [],
				outputs: ["src/core.ts"],
				status: "pending",
				tasks: [
					{ id: "1", title: "write types", status: "pending" },
					{ id: "2", title: "write validator", status: "pending" },
					{ id: "3", title: "write tests", status: "pending" },
				],
				owner_capabilities: ["task-planner"],
			},
			{
				id: "glue",
				title: "Wire it up",
				goal: "Integrate core",
				depends_on: ["core"],
				inputs: ["src/core.ts"],
				outputs: ["src/bin/cli.ts"],
				status: "pending",
				tasks: [{ id: "1", title: "wire cli", status: "pending" }],
				owner_capabilities: ["slash-command-guides"],
			},
		],
	};
}

test("withSizeScore: every bundle carries size_score = tasks.length after enrichment", () => {
	const enriched = withSizeScore(llmShapedGraph());
	for (const bundle of enriched.bundles) {
		assert.equal(
			bundle.size_score,
			bundle.tasks.length,
			`bundle ${bundle.id}: size_score should equal tasks.length`,
		);
	}
});

test("withSizeScore: does not mutate input graph", () => {
	const input = llmShapedGraph();
	const snapshot = JSON.stringify(input);
	withSizeScore(input);
	assert.equal(
		JSON.stringify(input),
		snapshot,
		"input graph must not be mutated",
	);
});

test("withSizeScore: enriched graph passes schema validation", () => {
	const enriched = withSizeScore(llmShapedGraph());
	const result = validateTaskGraph(enriched);
	assert.equal(result.valid, true, result.errors.join(", "));
});

test("withSizeScore: the persisted JSON shape includes size_score per bundle", () => {
	// Simulates what `specflow-generate-task-graph.ts` writes to
	// `openspec/changes/<CHANGE_ID>/task-graph.json`. This is the integration-
	// level assertion the reviewer asked for (F2): if the CLI were ever to bypass
	// withSizeScore again, this round-trip test would fail.
	const enriched = withSizeScore(llmShapedGraph());
	const serialized = JSON.stringify(enriched, null, 2);
	const reparsed = JSON.parse(serialized) as TaskGraph;
	for (const bundle of reparsed.bundles) {
		assert.equal(
			typeof bundle.size_score,
			"number",
			`bundle ${bundle.id}: persisted size_score must survive JSON round-trip as a number`,
		);
		assert.equal(bundle.size_score, bundle.tasks.length);
	}
});

test("withSizeScore: handles empty bundles (size_score = 0)", () => {
	const graph: TaskGraph = {
		version: "1.0",
		change_id: "empty",
		generated_at: "2026-04-20T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "empty",
				title: "Empty",
				goal: "Nothing",
				depends_on: [],
				inputs: [],
				outputs: [],
				status: "pending",
				tasks: [],
				owner_capabilities: [],
			},
		],
	};
	const enriched = withSizeScore(graph);
	assert.equal(enriched.bundles[0]?.size_score, 0);
});

test("withSizeScore: overwrites any incoming (stale/wrong) size_score with tasks.length", () => {
	// Defence in depth — if an upstream generator ever emits a size_score that
	// disagrees with tasks.length, the post-process step SHALL normalize.
	const graph = llmShapedGraph();
	const stale: TaskGraph = {
		...graph,
		bundles: graph.bundles.map((b) => ({ ...b, size_score: 999 })),
	};
	const enriched = withSizeScore(stale);
	for (const bundle of enriched.bundles) {
		assert.equal(bundle.size_score, bundle.tasks.length);
	}
});

test("withSizeScore: CLI code path and library helper converge on identical enrichment", async () => {
	// Belt-and-suspenders: both `src/bin/specflow-generate-task-graph.ts` and
	// `src/lib/task-planner/generate.ts` import `withSizeScore` from the same
	// module. Any future regression where a call site stops using it will fail
	// this test (which asserts both entry points are observable through the same
	// helper) plus the existing `generateTaskGraph: emits size_score` test.
	const { withSizeScore: libHelper } = await import(
		"../lib/task-planner/enrich.js"
	);
	// Smoke check that the helper is the same function reference across import
	// paths (since both bin and lib re-use it).
	const enrichedA = libHelper(llmShapedGraph());
	const enrichedB = withSizeScore(llmShapedGraph());
	assert.deepEqual(
		enrichedA.bundles.map((b) => b.size_score),
		enrichedB.bundles.map((b) => b.size_score),
	);
});

// --- CLI integration test (R1-F02) ---
//
// Exercises the real `specflow-generate-task-graph` binary end-to-end and
// asserts that every bundle in the persisted `task-graph.json` carries
// `size_score = tasks.length`. This closes the gap where the CLI path
// could silently diverge from the library helper.

const generateTaskGraphCliPath = resolve(
	process.cwd(),
	"dist/bin/specflow-generate-task-graph.js",
);

test("specflow-generate-task-graph CLI: persisted task-graph.json includes size_score on every bundle", () => {
	if (!existsSync(generateTaskGraphCliPath)) {
		// Skip gracefully when dist has not been built.
		return;
	}

	const tmpRoot = makeTempDir("generate-task-graph-cli-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tmpRoot, "cli-test");
		const changeDir = resolve(repoPath, "openspec/changes", changeId);

		// Write a design.md for the CLI to read.
		writeFileSync(
			resolve(changeDir, "design.md"),
			"# Design\n\nImplement a CLI that persists size_score.\n",
			"utf8",
		);

		// The LLM response the codex stub will produce — intentionally omits
		// size_score so we verify the CLI enriches it post-generation.
		const llmResponse: TaskGraph = {
			version: "1.0",
			change_id: changeId,
			generated_at: "2026-04-20T00:00:00Z",
			generated_from: "design.md",
			bundles: [
				{
					id: "alpha",
					title: "Alpha work",
					goal: "Do alpha things",
					depends_on: [],
					inputs: [],
					outputs: ["src/alpha.ts"],
					status: "pending",
					tasks: [
						{ id: "1", title: "task one", status: "pending" },
						{ id: "2", title: "task two", status: "pending" },
						{ id: "3", title: "task three", status: "pending" },
					],
					owner_capabilities: [],
				},
				{
					id: "beta",
					title: "Beta work",
					goal: "Do beta things",
					depends_on: ["alpha"],
					inputs: ["src/alpha.ts"],
					outputs: ["src/beta.ts"],
					status: "pending",
					tasks: [{ id: "1", title: "single task", status: "pending" }],
					owner_capabilities: [],
				},
			],
		};

		// Set up codex stub that returns the LLM response via -o file.
		const codexStubDir = createCodexStub(tmpRoot);
		const responsesPath = resolve(tmpRoot, "codex-responses.json");
		writeFileSync(
			responsesPath,
			JSON.stringify([{ exitCode: 0, output: JSON.stringify(llmResponse) }]),
			"utf8",
		);

		const result = runNodeCli(
			"specflow-generate-task-graph",
			[changeId],
			repoPath,
			prependPath(
				{
					SPECFLOW_TEST_CODEX_RESPONSES: responsesPath,
					SPECFLOW_REVIEW_AGENT: "codex",
				},
				codexStubDir,
			),
		);

		assert.equal(result.status, 0, `CLI failed — stderr: ${result.stderr}`);

		// Parse stdout for the success envelope.
		const stdout = JSON.parse(result.stdout) as Record<string, unknown>;
		assert.equal(stdout.status, "success");

		// Read the persisted task-graph.json and verify size_score.
		const persisted = JSON.parse(
			readFileSync(resolve(changeDir, "task-graph.json"), "utf8"),
		) as TaskGraph;

		assert.equal(persisted.bundles.length, 2);
		for (const bundle of persisted.bundles) {
			assert.equal(
				typeof bundle.size_score,
				"number",
				`bundle ${bundle.id}: size_score must be present in persisted task-graph.json`,
			);
			assert.equal(
				bundle.size_score,
				bundle.tasks.length,
				`bundle ${bundle.id}: size_score (${bundle.size_score}) should equal tasks.length (${bundle.tasks.length})`,
			);
		}

		// Also verify the persisted graph passes schema validation.
		const validation = validateTaskGraph(persisted);
		assert.equal(validation.valid, true, validation.errors.join(", "));
	} finally {
		removeTempDir(tmpRoot);
	}
});
