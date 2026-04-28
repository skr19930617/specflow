import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	type AdvanceBundleFn,
	type DispatchOutcome,
	LocalSubagentRuntimeError,
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

// Minimal pass-through WorktreeRuntime for tests that exercise orchestration
// logic but not worktree-specific behavior. Every git call succeeds with an
// empty diff, so integration accepts (empty_diff_on_success is only triggered
// when the subagent returned "success" — for failure paths it's irrelevant,
// and for success paths we return empty produced_artifacts matching empty diff).
// The WorktreeRuntime and GitCommandResult types are imported further down
// alongside the worktree-mode tests. TypeScript hoists all import statements
// to module scope, so they are available here.

// Deterministic diff returned by noop runtime for computeDiff. The path
// "src/__noop__.ts" MUST match `NOOP_PRODUCED_ARTIFACTS` so integration
// passes the undeclared-path check.
const NOOP_DIFF = Buffer.from(
	"diff --git a/src/__noop__.ts b/src/__noop__.ts\n--- a/src/__noop__.ts\n+++ b/src/__noop__.ts\n@@ -1 +1 @@\n-old\n+new\n",
	"utf8",
);
const NOOP_PRODUCED_ARTIFACTS = ["src/__noop__.ts"];

function noopWorktreeRuntime(
	repoRoot: string,
	changeId = "orch-test",
): WorktreeRuntime {
	const noop: GitCommandResult = {
		status: 0,
		stdout: Buffer.alloc(0),
		stderr: "",
	};
	const okBuf = (s: string): GitCommandResult => ({
		status: 0,
		stdout: Buffer.from(s, "utf8"),
		stderr: "",
	});
	return {
		repoRoot,
		mainWorkspacePath: repoRoot,
		changeId,
		git: (args, cwd) => {
			if (args[0] === "rev-parse") return okBuf("0000000\n");
			if (args[0] === "worktree") return noop;
			// R4-F10: ls-files for untracked enumeration → empty (no untracked files).
			if (args[0] === "ls-files") return noop;
			// R4-F10: reset after intent-to-add → no-op.
			if (args[0] === "reset") return noop;
			// Materialize (diff HEAD at repoRoot): empty → no workspace changes.
			// Snapshot check (diff HEAD in worktree): also empty → no snapshot commit.
			// computeDiff (diff baseSha in worktree): deterministic diff.
			if (args[0] === "diff") {
				if (args.includes("HEAD")) return noop; // materialize or snapshot check
				return { status: 0, stdout: NOOP_DIFF, stderr: "" }; // computeDiff
			}
			// Snapshot steps (add -A, commit) — no-op since materialize is empty.
			if (args[0] === "add") return noop;
			if (args[0] === "commit") return noop;
			return noop;
		},
		applyPatch: () => noop,
		fs: {
			existsSync: () => false,
			mkdirSync: () => {},
			rmSync: () => {},
		},
	};
}

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
			return {
				status: "success",
				produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
			};
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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
			produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
		});
		const result = await runDispatchedWindow({
			window,
			config: { enabled: true, threshold: 0, maxConcurrency: 2 },
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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

test("runDispatchedWindow: on failure, drains chunk and records done for successful siblings; failed bundle transitions to subagent_failed (apply-worktree-isolation)", async () => {
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
			return {
				status: "success",
				produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
			};
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures.length, 1);
			assert.equal(result.failures[0]?.bundleId, "b");
			assert.equal(result.failures[0]?.error.message, "B crashed");
			// New: terminal status is classified at the failure site.
			assert.equal(result.failures[0]?.terminalStatus, "subagent_failed");
		}
		// a, b, c all advanced to in_progress. a and c to done. b to subagent_failed.
		const ids = advances.map((e) => `${e.bundleId}:${e.status}`).sort();
		assert.deepEqual(
			ids,
			[
				"a:done",
				"a:in_progress",
				"b:in_progress",
				"b:subagent_failed",
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
			return {
				status: "success",
				produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
			};
		};
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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
			return {
				status: "success",
				produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
			};
		};
		const result = await runDispatchedWindow({
			window,
			config: { enabled: true, threshold: 0, maxConcurrency: 2 },
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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
				worktreeRuntime: noopWorktreeRuntime(root),
				runId: "test-run",
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
			produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
		});
		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance,
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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
			worktreeRuntime: noopWorktreeRuntime(root),
			runId: "test-run",
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

// --- R1-F02: subagent-shared mode is NOT supported ---

test("runDispatchedWindow: throws when window is subagent-dispatched but worktreeRuntime is omitted (subagent-shared forbidden)", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: [],
		});
		await assert.rejects(
			runDispatchedWindow({
				window,
				config: dispatchAll,
				changeId,
				taskGraph: graph,
				repoRoot: root,
				invoke: invoker,
				advance: async () => {},
				// worktreeRuntime intentionally omitted
			}),
			(err: Error) => {
				assert.ok(
					err.message.includes("subagent-shared"),
					`expected 'subagent-shared' in error, got: ${err.message}`,
				);
				return true;
			},
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- apply-worktree-isolation: worktree mode end-to-end ---
// These tests inject a fake WorktreeRuntime so we don't have to spawn real
// `git worktree` processes. The runtime records every git call so we can
// assert worktree lifecycle: add → diff → apply → remove (on success), or
// add → diff → apply → retain (on failure/rejection).

import type {
	GitApplier,
	GitCommandResult,
	GitRunner,
	WorktreeRuntime,
} from "../lib/apply-worktree/worktree.js";
import { WorktreeError } from "../lib/apply-worktree/worktree.js";

interface GitCall {
	readonly cmd: "run" | "apply";
	readonly args: readonly string[];
	readonly cwd: string;
}

function makeFakeFs(): {
	existsSync: (p: string) => boolean;
	mkdirSync: (p: string, opts?: { recursive?: boolean }) => void;
	rmSync: (p: string) => void;
	_paths: Set<string>;
} {
	const paths = new Set<string>();
	return {
		_paths: paths,
		existsSync: (p) => paths.has(p),
		mkdirSync: (p) => {
			paths.add(p);
		},
		rmSync: (p) => {
			paths.delete(p);
		},
	};
}

function wtOk(stdout: string | Buffer = ""): GitCommandResult {
	return {
		status: 0,
		stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "utf8"),
		stderr: "",
	};
}

function wtFail(stderr: string, status = 1): GitCommandResult {
	return { status, stdout: Buffer.alloc(0), stderr };
}

/**
 * A WorktreeRuntime that fakes every git call but tracks which worktrees
 * currently "exist" via the fake fs. The `diffFor(bundleId)` map decides
 * what the worktree diff looks like per bundle.
 */
function makeWorktreeRuntime(opts: {
	readonly repoRoot: string;
	readonly changeId?: string;
	readonly diffFor: (bundleId: string) => string;
	readonly onApply?: (bundleId: string, patch: Buffer) => void;
	readonly applyResultFor?: (bundleId: string) => GitCommandResult;
	readonly failCreateFor?: (bundleId: string) => string | undefined;
	readonly calls?: GitCall[];
}): {
	runtime: WorktreeRuntime;
	calls: GitCall[];
	fs: ReturnType<typeof makeFakeFs>;
} {
	const fs = makeFakeFs();
	const calls: GitCall[] = opts.calls ?? [];
	let currentBundleId: string | null = null;

	const git: GitRunner = (args, cwd) => {
		calls.push({ cmd: "run", args, cwd });
		if (args[0] === "rev-parse" && args[1] === "HEAD") {
			return wtOk("basesha\n");
		}
		if (args[0] === "worktree" && args[1] === "add") {
			// args includes --detach <path> <sha>. Extract bundle-id from path.
			const path = args.find((a) => a.includes(".specflow/worktrees"));
			const bundleId = path?.split("/").pop() ?? "";
			currentBundleId = bundleId;
			const failReason = opts.failCreateFor?.(bundleId);
			if (failReason) {
				return wtFail(failReason, 128);
			}
			if (path) fs._paths.add(path);
			return wtOk();
		}
		// R4-F10: ls-files for untracked enumeration → empty (no untracked files).
		if (args[0] === "ls-files") return wtOk("");
		// R4-F10: reset after intent-to-add → no-op.
		if (args[0] === "reset") return wtOk();
		if (args[0] === "diff") {
			// Materialize (diff HEAD at repoRoot): empty → no workspace changes.
			// Snapshot check (diff HEAD in worktree): also empty → no snapshot.
			// computeDiff (diff baseSha in worktree): per-bundle diff.
			if (args.includes("HEAD")) {
				return wtOk(""); // materialize or snapshot check: no workspace changes
			}
			const bundleId = cwd.split("/").pop() ?? "";
			return wtOk(opts.diffFor(bundleId));
		}
		if (args[0] === "worktree" && args[1] === "remove") {
			const path = args[args.length - 1];
			if (path) fs._paths.delete(path);
			return wtOk();
		}
		// Snapshot steps (add -A, commit) — no-op since materialize is empty.
		if (args[0] === "add") return wtOk();
		if (args[0] === "commit") return wtOk();
		void currentBundleId;
		return wtFail(`unexpected git call: ${args.join(" ")}`);
	};

	const applyPatch: GitApplier = (patch, cwd) => {
		calls.push({ cmd: "apply", args: [], cwd });
		// Recover bundle id from the most recent diff call's cwd — approximate.
		// We use the patch's first `diff --git` line to infer a bundle identity.
		const header = patch.toString("utf8").split("\n")[0] ?? "";
		const match = header.match(/\.(bundle-\w+)\./);
		const bundleId = match?.[1] ?? "";
		if (opts.onApply) opts.onApply(bundleId, patch);
		if (opts.applyResultFor) {
			return opts.applyResultFor(bundleId);
		}
		return wtOk();
	};

	return {
		runtime: {
			repoRoot: opts.repoRoot,
			mainWorkspacePath: opts.repoRoot,
			changeId: opts.changeId ?? "orch-test",
			git,
			applyPatch,
			fs,
		},
		calls,
		fs,
	};
}

test("runDispatchedWindow (worktree): success path creates worktree, applies patch, removes worktree, advances done", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const { runtime, calls, fs } = makeWorktreeRuntime({
			repoRoot: root,
			diffFor: () =>
				"diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n",
		});
		const invoker: SubagentInvoker = async (_pkg, handle) => {
			assert.ok(handle, "worktree handle must be passed in worktree mode");
			return { status: "success", produced_artifacts: ["src/a.ts"] };
		};

		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: runtime,
			runId: "run-1",
		});
		assert.equal(result.outcome, "ok");
		assert.deepEqual(
			advances.map((a) => `${a.bundleId}:${a.status}`),
			["a:in_progress", "a:done"],
		);

		// Worktree lifecycle: add → diff → apply → remove. Fs reflects removal.
		assert.ok(
			calls.some((c) => c.args.includes("add")),
			"git worktree add must be invoked",
		);
		assert.ok(
			calls.some((c) => c.cmd === "apply"),
			"git apply must be invoked",
		);
		assert.ok(
			calls.some((c) => c.args.includes("remove")),
			"git worktree remove must be invoked on success",
		);
		const wtPath = `${root}/.specflow/worktrees/orch-test/run-1/a`;
		assert.ok(!fs._paths.has(wtPath), "worktree path must be cleaned up");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow (worktree): subagent failure advances to subagent_failed and RETAINS worktree", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const { runtime, calls, fs } = makeWorktreeRuntime({
			repoRoot: root,
			diffFor: () => "", // irrelevant on failure path
		});
		const invoker: SubagentInvoker = async () => ({
			status: "failure",
			produced_artifacts: [],
			error: { message: "subagent exploded" },
		});

		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: runtime,
			runId: "run-1",
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures[0]?.terminalStatus, "subagent_failed");
		}
		assert.deepEqual(
			advances.map((a) => `${a.bundleId}:${a.status}`),
			["a:in_progress", "a:subagent_failed"],
		);

		// Worktree created but NOT removed (retention on failure).
		assert.ok(calls.some((c) => c.args.includes("add")));
		assert.ok(
			!calls.some((c) => c.args.includes("remove")),
			"worktree must be retained on subagent_failed",
		);
		const wtPath = `${root}/.specflow/worktrees/orch-test/run-1/a`;
		assert.ok(fs._paths.has(wtPath), "worktree path must persist on failure");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow (worktree): integration rejection advances to integration_rejected and RETAINS worktree", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		// Diff touches an undeclared path → integration rejection.
		const { runtime, calls, fs } = makeWorktreeRuntime({
			repoRoot: root,
			diffFor: () =>
				"diff --git a/undeclared.ts b/undeclared.ts\n--- a/undeclared.ts\n+++ b/undeclared.ts\n",
		});
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: ["declared-only.ts"], // undeclared.ts NOT listed
		});

		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: runtime,
			runId: "run-1",
		});
		assert.equal(result.outcome, "failed");
		if (result.outcome === "failed") {
			assert.equal(result.failures[0]?.terminalStatus, "integration_rejected");
			assert.equal(
				result.failures[0]?.integrationCause?.kind,
				"undeclared_path",
			);
		}
		assert.deepEqual(
			advances.map((a) => `${a.bundleId}:${a.status}`),
			["a:in_progress", "a:integration_rejected"],
		);

		// Apply must not have run; worktree retained.
		assert.ok(
			!calls.some((c) => c.cmd === "apply"),
			"apply must be skipped on undeclared_path rejection",
		);
		assert.ok(
			!calls.some((c) => c.args.includes("remove")),
			"worktree retained on integration_rejected",
		);
		const wtPath = `${root}/.specflow/worktrees/orch-test/run-1/a`;
		assert.ok(fs._paths.has(wtPath));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow (worktree): fail-fast when createWorktree fails — no advance, no subagent invocation", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const { runtime } = makeWorktreeRuntime({
			repoRoot: root,
			diffFor: () => "",
			failCreateFor: (id) =>
				id === "a" ? "fatal: 'path' already exists" : undefined,
		});
		let invokerCalled = false;
		const invoker: SubagentInvoker = async () => {
			invokerCalled = true;
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
				worktreeRuntime: runtime,
				runId: "run-1",
			}),
			(err: unknown) => err instanceof WorktreeError,
		);

		assert.equal(invokerCalled, false, "subagent must NOT be invoked");
		assert.equal(advances.length, 0, "no advance calls on fail-fast");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("runDispatchedWindow (worktree): create failure on second bundle rolls back first bundle's worktree", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3), mkBundle("b", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];
		const { runtime, fs } = makeWorktreeRuntime({
			repoRoot: root,
			diffFor: () => "",
			failCreateFor: (id) =>
				id === "b" ? "fatal: permission denied" : undefined,
		});
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: [],
		});

		await assert.rejects(
			runDispatchedWindow({
				window,
				config: dispatchAll,
				changeId,
				taskGraph: graph,
				repoRoot: root,
				invoke: invoker,
				advance: recordingAdvance(advances),
				worktreeRuntime: runtime,
				runId: "run-1",
			}),
			(err: unknown) => err instanceof WorktreeError,
		);

		// Rollback: the worktree for 'a' must not be left on disk after 'b' fails.
		const aPath = `${root}/.specflow/worktrees/orch-test/run-1/a`;
		assert.ok(
			!fs._paths.has(aPath),
			"first bundle's worktree must be cleaned up when a later bundle fails create",
		);
		assert.equal(advances.length, 0, "no advance calls before rollback");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R4-F12: cleanup warnings are surfaced, not silently swallowed ---

test("runDispatchedWindow (worktree): worktree remove failure surfaces a cleanupWarning instead of silently swallowing (R4-F12)", async () => {
	const { root, changeId } = setupRepo();
	try {
		const window = [mkBundle("a", 3)];
		const graph = mkGraph(window);
		const advances: AdvanceCall[] = [];

		// Custom runtime where `git worktree remove` fails.
		const noop: GitCommandResult = {
			status: 0,
			stdout: Buffer.alloc(0),
			stderr: "",
		};
		const okBuf = (s: string): GitCommandResult => ({
			status: 0,
			stdout: Buffer.from(s, "utf8"),
			stderr: "",
		});
		const runtime: WorktreeRuntime = {
			repoRoot: root,
			mainWorkspacePath: root,
			changeId,
			git: (args) => {
				if (args[0] === "rev-parse") return okBuf("0000000\n");
				if (args[0] === "worktree" && args[1] === "add") return noop;
				if (args[0] === "worktree" && args[1] === "remove") {
					// Simulate removal failure (e.g., filesystem lock).
					return {
						status: 1,
						stdout: Buffer.alloc(0),
						stderr: "fatal: cannot remove",
					};
				}
				if (args[0] === "ls-files") return noop;
				if (args[0] === "reset") return noop;
				if (args[0] === "diff") {
					if (args.includes("HEAD")) return noop;
					return { status: 0, stdout: NOOP_DIFF, stderr: "" };
				}
				if (args[0] === "add") return noop;
				if (args[0] === "commit") return noop;
				return noop;
			},
			applyPatch: () => noop,
			fs: {
				existsSync: () => false,
				mkdirSync: () => {},
				rmSync: () => {},
			},
		};
		const invoker: SubagentInvoker = async () => ({
			status: "success",
			produced_artifacts: NOOP_PRODUCED_ARTIFACTS,
		});

		const result = await runDispatchedWindow({
			window,
			config: dispatchAll,
			changeId,
			taskGraph: graph,
			repoRoot: root,
			invoke: invoker,
			advance: recordingAdvance(advances),
			worktreeRuntime: runtime,
			runId: "test-run",
		});

		// The bundle should still succeed (done) — cleanup failure is non-fatal.
		assert.equal(result.outcome, "ok");
		// But the cleanup warning must be surfaced, not silently swallowed.
		if (result.outcome === "ok") {
			assert.ok(
				result.cleanupWarnings && result.cleanupWarnings.length > 0,
				"cleanup warning must be surfaced when worktree removal fails",
			);
			assert.equal(result.cleanupWarnings![0]!.bundleId, "a");
			assert.ok(
				result.cleanupWarnings![0]!.message.includes("cannot remove"),
				`warning message must include the git error; got: ${result.cleanupWarnings![0]!.message}`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- Default-engaged dispatch fail-fast on missing local subagent runtime ---

test("runDispatchedWindow: missing local subagent runtime throws BEFORE any mutation", async () => {
	const { root, changeId } = setupRepo();
	// Force the verifyLocalSubagentRuntime check to fail by pointing PATH at
	// an empty directory and clearing all SPECFLOW_<AGENT> overrides.
	const emptyDir = mkdtempSync(join(tmpdir(), "rt-empty-"));
	const origEnv = {
		PATH: process.env.PATH,
		MAIN: process.env.SPECFLOW_MAIN_AGENT,
		REVIEW: process.env.SPECFLOW_REVIEW_AGENT,
		CLAUDE: process.env.SPECFLOW_CLAUDE,
		CODEX: process.env.SPECFLOW_CODEX,
		COPILOT: process.env.SPECFLOW_COPILOT,
	};
	const callLog: GitCall[] = [];
	const advanceLog: AdvanceCall[] = [];
	const subagentInvocations: string[] = [];
	try {
		process.env.PATH = emptyDir;
		delete process.env.SPECFLOW_MAIN_AGENT;
		delete process.env.SPECFLOW_REVIEW_AGENT;
		delete process.env.SPECFLOW_CLAUDE;
		delete process.env.SPECFLOW_CODEX;
		delete process.env.SPECFLOW_COPILOT;

		const window = [mkBundle("a", 9)]; // size_score > threshold(0) → subagent
		const graph = mkGraph(window);
		const advance: AdvanceBundleFn = async (bundleId, status) => {
			advanceLog.push({ bundleId, status });
		};
		const invoke: SubagentInvoker = async (pkg, _wt) => {
			subagentInvocations.push(pkg.bundleId);
			return { status: "success" } as SubagentResult;
		};
		const { runtime } = makeWorktreeRuntime({
			repoRoot: root,
			changeId,
			diffFor: () => "",
			calls: callLog,
		});

		await assert.rejects(
			runDispatchedWindow({
				window,
				config: dispatchAll,
				changeId,
				taskGraph: graph,
				repoRoot: root,
				invoke,
				advance,
				worktreeRuntime: runtime,
				runId: "run-1",
			}),
			(err: unknown) => err instanceof LocalSubagentRuntimeError,
			"runDispatchedWindow must throw LocalSubagentRuntimeError before any mutation",
		);

		assert.equal(advanceLog.length, 0, "no advance() call must occur");
		assert.equal(
			subagentInvocations.length,
			0,
			"no subagent invocation must occur",
		);
		const worktreeAdds = callLog.filter(
			(c) => c.args[0] === "worktree" && c.args[1] === "add",
		);
		assert.equal(
			worktreeAdds.length,
			0,
			"no `git worktree add` must occur on runtime-prereq failure",
		);
	} finally {
		const restore = (key: string, value: string | undefined): void => {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		};
		restore("PATH", origEnv.PATH);
		restore("SPECFLOW_MAIN_AGENT", origEnv.MAIN);
		restore("SPECFLOW_REVIEW_AGENT", origEnv.REVIEW);
		restore("SPECFLOW_CLAUDE", origEnv.CLAUDE);
		restore("SPECFLOW_CODEX", origEnv.CODEX);
		restore("SPECFLOW_COPILOT", origEnv.COPILOT);
		rmSync(emptyDir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});
