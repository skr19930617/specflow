import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	type AdvanceBundleFn,
	type DispatchOutcome,
	MissingCapabilityError,
	runDispatchedWindow,
} from "../lib/apply-dispatcher/index.js";
import type {
	ContextPackage,
	SubagentInvoker,
	SubagentResult,
} from "../lib/apply-dispatcher/types.js";
import type {
	Bundle,
	BundleStatus,
	TaskGraph,
} from "../lib/task-planner/types.js";

// --- Helpers ---

interface AdvanceCall {
	readonly bundleId: string;
	readonly status: BundleStatus;
}

function recordingAdvance(log: AdvanceCall[]): AdvanceBundleFn {
	return async (bundleId, status) => {
		log.push({ bundleId, status });
	};
}

function mkBundle(
	id: string,
	size_score: number,
	owner_capabilities: readonly string[] = ["alpha"],
): Bundle {
	return {
		id,
		title: id,
		goal: "",
		depends_on: [],
		inputs: [],
		outputs: [],
		status: "pending",
		tasks: Array.from({ length: size_score }, (_, i) => ({
			id: `${id}-${i + 1}`,
			title: `t${i + 1}`,
			status: "pending",
		})),
		owner_capabilities,
		size_score,
	};
}

function mkGraph(bundles: readonly Bundle[]): TaskGraph {
	return {
		version: "1.0",
		change_id: "orch-test",
		generated_at: "2026-04-20T00:00:00Z",
		generated_from: "design.md",
		bundles,
	};
}

function setupRepo(capabilities: readonly string[] = ["alpha"]): {
	root: string;
	changeId: string;
} {
	const root = mkdtempSync(join(tmpdir(), "dispatcher-orch-"));
	const changeId = "orch-test";
	const changeDir = join(root, "openspec/changes", changeId);
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "proposal.md"), "# proposal", "utf8");
	writeFileSync(join(changeDir, "design.md"), "# design", "utf8");
	writeFileSync(join(changeDir, "tasks.md"), "", "utf8");
	for (const cap of capabilities) {
		mkdirSync(join(root, "openspec/specs", cap), { recursive: true });
		writeFileSync(
			join(root, "openspec/specs", cap, "spec.md"),
			`# ${cap}`,
			"utf8",
		);
	}
	return { root, changeId };
}

const dispatchAll = { enabled: true, threshold: 0, maxConcurrency: 3 };

// --- Inline short-circuit ---

test("runDispatchedWindow: returns inline without mutation when classifier picks inline", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 1)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invoker: SubagentInvoker = async () => {
			throw new Error("invoker MUST NOT be called in inline mode");
		};
		const result = await runDispatchedWindow({
			window,
			config: { enabled: false, threshold: 5, maxConcurrency: 3 },
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "inline");
		assert.equal(advances.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- All-success path ---

test("runDispatchedWindow: dispatches one chunk, records in_progress→done for each bundle", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3), mkBundle("b", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invokedFor: string[] = [];
		const invoker: SubagentInvoker = async (pkg: ContextPackage) => {
			invokedFor.push(pkg.bundleId);
			return { status: "success", produced_artifacts: [] };
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "ok");
		assert.deepEqual(invokedFor.sort(), ["a", "b"]);
		// Every bundle: advance in_progress, then advance done.
		assert.deepEqual(advances, [
			{ bundleId: "a", status: "in_progress" },
			{ bundleId: "b", status: "in_progress" },
			{ bundleId: "a", status: "done" },
			{ bundleId: "b", status: "done" },
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow: splits window into chunks of maxConcurrency and dispatches serially", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [
			mkBundle("a", 2),
			mkBundle("b", 2),
			mkBundle("c", 2),
			mkBundle("d", 2),
		];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: [],
		});
		const result = await runDispatchedWindow({
			window,
			config: { enabled: true, threshold: 0, maxConcurrency: 2 },
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "ok");
		// Chunk 1: a, b in_progress → a, b done (interleaved). Chunk 2: c, d.
		// Specifically, in_progress for c SHALL NOT be recorded before done for
		// a and b, because chunks are serial.
		const cInProgIdx = advances.findIndex(
			(e) => e.bundleId === "c" && e.status === "in_progress",
		);
		const aDoneIdx = advances.findIndex(
			(e) => e.bundleId === "a" && e.status === "done",
		);
		const bDoneIdx = advances.findIndex(
			(e) => e.bundleId === "b" && e.status === "done",
		);
		assert.ok(cInProgIdx > aDoneIdx, "c in_progress after a done");
		assert.ok(cInProgIdx > bDoneIdx, "c in_progress after b done");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- Drain-then-stop on failure ---

test("runDispatchedWindow: on failure, drains chunk and records done for successful siblings; failed bundle stays in_progress", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3), mkBundle("b", 3), mkBundle("c", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invoker: SubagentInvoker = async (pkg) => {
			if (pkg.bundleId === "b") {
				return {
					status: "failure",
					produced_artifacts: [],
					error: { message: "B crashed" },
				} satisfies SubagentResult;
			}
			// Artificial delay to ensure a and c don't race ahead of b's rejection.
			await new Promise((r) => setTimeout(r, 10));
			return { status: "success", produced_artifacts: [] };
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures.length, 1);
			assert.equal(result.failures[0]?.bundleId, "b");
			assert.equal(result.failures[0]?.error.message, "B crashed");
		}
		// a, b, c all advanced to in_progress. Only a and c advanced to done.
		const ids = advances.map((e) => `${e.bundleId}:${e.status}`).sort();
		assert.deepEqual(
			ids,
			[
				"a:done",
				"a:in_progress",
				"b:in_progress",
				"c:done",
				"c:in_progress",
			].sort(),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow: multiple failures in one chunk are all reported", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3), mkBundle("b", 3), mkBundle("c", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invoker: SubagentInvoker = async (pkg) => {
			if (pkg.bundleId === "a" || pkg.bundleId === "c") {
				return {
					status: "failure",
					produced_artifacts: [],
					error: { message: `${pkg.bundleId} crashed` },
				};
			}
			return { status: "success", produced_artifacts: [] };
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			const failed = result.failures.map((f) => f.bundleId).sort();
			assert.deepEqual(failed, ["a", "c"]);
			// Only b (the sole success) is advanced to done.
			assert.ok(
				advances.some((e) => e.bundleId === "b" && e.status === "done"),
			);
			assert.ok(
				!advances.some((e) => e.bundleId === "a" && e.status === "done"),
			);
			assert.ok(
				!advances.some((e) => e.bundleId === "c" && e.status === "done"),
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow: failure in first chunk prevents second chunk from starting", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [
			mkBundle("a", 3),
			mkBundle("b", 3),
			mkBundle("c", 3), // second chunk start
		];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invokedFor: string[] = [];
		const invoker: SubagentInvoker = async (pkg) => {
			invokedFor.push(pkg.bundleId);
			if (pkg.bundleId === "a") {
				return {
					status: "failure",
					produced_artifacts: [],
					error: { message: "a crashed" },
				};
			}
			return { status: "success", produced_artifacts: [] };
		};
		const result = await runDispatchedWindow({
			window,
			config: { enabled: true, threshold: 0, maxConcurrency: 2 },
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
		});
		assert.equal(result.outcome, "failed");
		// c SHALL NOT have been invoked (it's in chunk 2).
		assert.ok(
			!invokedFor.includes("c"),
			`c should not be dispatched, but invokedFor=${JSON.stringify(invokedFor)}`,
		);
		// c SHALL NOT have been advanced at all.
		assert.ok(!advances.some((e) => e.bundleId === "c"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- Preflight: zero-mutation invariant ---

test("runDispatchedWindow: preflight failure throws MissingCapabilityError with ZERO mutation", async () => {
	// capability "valid" exists; capability "missing" does not.
	const { root, changeId } = setupRepo(["valid"]);
	try {
		const window = [
			mkBundle("a", 3, ["valid"]),
			mkBundle("b", 3, ["missing"]), // this will trigger preflight failure
		];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const invokedFor: string[] = [];
		const invoker: SubagentInvoker = async (pkg) => {
			invokedFor.push(pkg.bundleId);
			return { status: "success", produced_artifacts: [] };
		};
		await assert.rejects(
			runDispatchedWindow({
				window,
				config: dispatchAll,
				changeId,
				taskGraph: graph,
				repoRoot: root,
				invoke: invoker,
				advance: recordingAdvance(advances),
			}),
			(err: Error) => {
				assert.ok(err instanceof MissingCapabilityError);
				return true;
			},
		);
		// CRITICAL INVARIANT (review P1): no bundle advanced, no subagent invoked.
		assert.deepEqual(advances, []);
		assert.deepEqual(invokedFor, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- Error details on invoker throw ---

// R4-F08: a thrown advance(done) must STOP the chunk immediately, not convert
// to a failure and keep advancing later siblings.
test("runDispatchedWindow: advance(done) throw stops chunk immediately, no further advances", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3), mkBundle("b", 3), mkBundle("c", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		// Advance callback: throws on advance("a", "done"); everything else OK.
		const advance: AdvanceBundleFn = async (bundleId, status) => {
			if (bundleId === "a" && status === "done") {
				throw new Error("specflow-advance-bundle exited 1");
			}
			advances.push({ bundleId, status });
		};
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: [],
		});
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance,
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures.length, 1);
			assert.equal(result.failures[0]?.bundleId, "a");
			assert.ok(
				result.failures[0]?.error.message.includes("specflow-advance-bundle"),
			);
		}
		// b and c SHALL NOT be advanced to done after a's CLI failure.
		assert.ok(
			!advances.some((e) => e.bundleId === "b" && e.status === "done"),
			"b must not be advanced to done after CLI failure on a",
		);
		assert.ok(
			!advances.some((e) => e.bundleId === "c" && e.status === "done"),
			"c must not be advanced to done after CLI failure on a",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow: subagent throw is captured as ChunkFailure with error message", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const invoker: SubagentInvoker = async () => {
			throw new Error("network dropped");
		};
		const result: DispatchOutcome = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: async () => {},
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures[0]?.bundleId, "a");
			assert.equal(result.failures[0]?.error.message, "network dropped");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
