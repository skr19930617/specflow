import assert from "node:assert/strict";
import test from "node:test";
import {
	__internal_testing,
	computeDiff,
	createWorktree,
	type GitApplier,
	type GitCommandResult,
	type GitRunner,
	importPatch,
	isProtectedPath,
	listTouchedPaths,
	removeWorktree,
	WorktreeError,
	type WorktreeHandle,
	type WorktreeRuntime,
	worktreePath,
} from "../lib/apply-worktree/worktree.js";

// --- Fake git/fs runtime fixtures ---

interface FakeFs {
	readonly existsSync: (path: string) => boolean;
	readonly mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
	readonly rmSync: (path: string) => void;
	readonly _paths: Set<string>;
}

function makeFakeFs(preExisting: readonly string[] = []): FakeFs {
	const paths = new Set(preExisting);
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

function ok(stdout: string | Buffer = ""): GitCommandResult {
	return {
		status: 0,
		stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "utf8"),
		stderr: "",
	};
}

function fail(stderr: string, status = 1): GitCommandResult {
	return { status, stdout: Buffer.alloc(0), stderr };
}

function makeRuntime(opts: {
	readonly git?: GitRunner;
	readonly applyPatch?: GitApplier;
	readonly fs?: FakeFs;
	readonly repoRoot?: string;
}): WorktreeRuntime {
	return {
		repoRoot: opts.repoRoot ?? "/repo",
		git: opts.git,
		applyPatch: opts.applyPatch,
		fs: opts.fs ?? makeFakeFs(),
	};
}

// --- createWorktree ---

test("createWorktree: succeeds and records base SHA from HEAD when no workspace changes exist", () => {
	const invocations: Array<readonly string[]> = [];
	const runtime = makeRuntime({
		git: (args) => {
			invocations.push(args);
			if (args[0] === "rev-parse" && args[1] === "HEAD") {
				return ok("abc123\n");
			}
			if (args[0] === "worktree" && args[1] === "add") {
				return ok();
			}
			// Materialize step: `git diff --binary --find-renames HEAD` at repo root.
			// Return empty diff — no uncommitted changes to materialize.
			// Snapshot step also diffs HEAD in the worktree — also empty.
			if (args[0] === "diff" && args.includes("HEAD")) {
				return ok("");
			}
			return fail(`unexpected git call: ${args.join(" ")}`);
		},
	});
	const handle = createWorktree(runtime, "run-1", "bundle-a");
	assert.equal(handle.runId, "run-1");
	assert.equal(handle.bundleId, "bundle-a");
	// No workspace changes → snapshot is a no-op → baseSha stays as HEAD.
	assert.equal(handle.baseSha, "abc123");
	assert.equal(handle.path, "/repo/.specflow/worktrees/run-1/bundle-a");

	// HEAD was resolved BEFORE worktree add — guards against the recorded base
	// drifting from the actual worktree base if HEAD moves concurrently.
	assert.deepEqual(invocations[0], ["rev-parse", "HEAD"]);
	const addCall = invocations[1];
	assert.equal(addCall[0], "worktree");
	assert.equal(addCall[1], "add");
	assert.ok(addCall.includes("--detach"));
	assert.ok(addCall.includes("/repo/.specflow/worktrees/run-1/bundle-a"));
	assert.ok(addCall.includes("abc123"));
});

test("createWorktree: refuses to run if target path already exists", () => {
	const runtime = makeRuntime({
		fs: makeFakeFs(["/repo/.specflow/worktrees/run-1/bundle-a"]),
		git: () => {
			throw new Error("git should not be invoked when pre-check fails");
		},
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError && err.cause.operation === "create-precheck",
	);
});

test("createWorktree: propagates git worktree add failure as WorktreeError with worktree path included (R2-F06)", () => {
	const runtime = makeRuntime({
		git: (args) => {
			if (args[0] === "rev-parse") return ok("abc123\n");
			if (args[0] === "worktree" && args[1] === "add")
				return fail("fatal: 'path' already exists", 128);
			if (args[0] === "diff") return ok("");
			return fail("unexpected");
		},
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.message.includes("/repo/.specflow/worktrees/run-1/bundle-a") &&
			err.message.includes("fatal:"),
	);
});

test("createWorktree: propagates rev-parse failure as WorktreeError", () => {
	const runtime = makeRuntime({
		git: (args) => {
			if (args[0] === "rev-parse") return fail("fatal: bad revision", 128);
			return ok();
		},
	});
	assert.throws(() => createWorktree(runtime, "run-1", "bundle-a"));
});

test("createWorktree: materializes uncommitted workspace changes and snapshots them as a new baseSha", () => {
	const workspaceDiff = Buffer.from(
		"diff --git a/earlier-import.ts b/earlier-import.ts\n--- a/earlier-import.ts\n+++ b/earlier-import.ts\n",
		"utf8",
	);
	const appliedPatches: Array<{ patch: Buffer; cwd: string }> = [];
	const gitCalls: Array<{ args: readonly string[]; cwd: string }> = [];
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			gitCalls.push({ args, cwd });
			// Initial rev-parse HEAD at repo root.
			if (args[0] === "rev-parse" && args[1] === "HEAD" && cwd === "/repo")
				return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			// Materialize step (diff at repo root): return non-empty diff.
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			// Snapshot step (diff at worktree): also non-empty (changes were applied).
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return ok(workspaceDiff);
			// Snapshot: git add -A in worktree.
			if (args[0] === "add" && args[1] === "-A") return ok();
			// Snapshot: git commit in worktree.
			if (args[0] === "commit") return ok();
			// Snapshot: rev-parse HEAD in worktree → new snapshot SHA.
			if (args[0] === "rev-parse" && args[1] === "HEAD" && cwd !== "/repo")
				return ok("snapshot-sha\n");
			return fail(`unexpected: ${args.join(" ")} in ${cwd}`);
		},
		applyPatch: (patch, cwd) => {
			appliedPatches.push({ patch, cwd });
			return ok();
		},
	});
	const handle = createWorktree(runtime, "run-1", "bundle-b");
	// The materialize step should apply the workspace diff INTO the worktree.
	assert.equal(appliedPatches.length, 1);
	assert.equal(appliedPatches[0].cwd, handle.path);
	assert.deepEqual(appliedPatches[0].patch, workspaceDiff);
	// baseSha must be the snapshot commit, NOT the original HEAD — so that
	// computeDiff later captures only the subagent's delta, not the materialized
	// workspace changes that are already present at the repo root.
	assert.equal(handle.baseSha, "snapshot-sha");
	// Verify the snapshot sequence: add -A → commit → rev-parse HEAD in worktree.
	const snapshotCalls = gitCalls.filter((c) => c.cwd === handle.path);
	assert.ok(
		snapshotCalls.some((c) => c.args[0] === "add" && c.args[1] === "-A"),
	);
	assert.ok(snapshotCalls.some((c) => c.args[0] === "commit"));
});

test("createWorktree: snapshot stage failure is fatal when materialized changes exist (R2-F05)", () => {
	const workspaceDiff = Buffer.from(
		"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n",
		"utf8",
	);
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			if (args[0] === "rev-parse" && cwd === "/repo") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			// Materialize: non-empty diff at repo root.
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			// Snapshot diff check in worktree: non-empty (changes were applied).
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return ok(workspaceDiff);
			// Snapshot: git add -A FAILS.
			if (args[0] === "add" && args[1] === "-A")
				return fail("error: unable to index", 1);
			return fail("unexpected");
		},
		applyPatch: () => ok(),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError && err.cause.operation === "snapshot-stage",
	);
});

test("createWorktree: snapshot commit failure is fatal when materialized changes exist (R2-F05)", () => {
	const workspaceDiff = Buffer.from(
		"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n",
		"utf8",
	);
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			if (args[0] === "rev-parse" && cwd === "/repo") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return ok(workspaceDiff);
			if (args[0] === "add" && args[1] === "-A") return ok();
			// Snapshot: git commit FAILS.
			if (args[0] === "commit") return fail("error: unable to commit", 1);
			return fail("unexpected");
		},
		applyPatch: () => ok(),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError && err.cause.operation === "snapshot-commit",
	);
});

test("createWorktree: snapshot rev-parse failure is fatal when materialized changes exist (R2-F05)", () => {
	const workspaceDiff = Buffer.from(
		"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n",
		"utf8",
	);
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			if (args[0] === "rev-parse" && cwd === "/repo") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return ok(workspaceDiff);
			if (args[0] === "add" && args[1] === "-A") return ok();
			if (args[0] === "commit") return ok();
			// Snapshot: rev-parse HEAD in worktree FAILS.
			if (args[0] === "rev-parse" && cwd !== "/repo")
				return fail("fatal: bad object", 128);
			return fail("unexpected");
		},
		applyPatch: () => ok(),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "snapshot-rev-parse",
	);
});

test("createWorktree: snapshot diff-check failure is fatal (R2-F05)", () => {
	const workspaceDiff = Buffer.from(
		"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n",
		"utf8",
	);
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			if (args[0] === "rev-parse" && cwd === "/repo") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			// Snapshot diff check in worktree FAILS.
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return fail("error: bad index", 1);
			return fail("unexpected");
		},
		applyPatch: () => ok(),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "snapshot-diff-check",
	);
});

test("createWorktree: propagates materialize-apply failure as WorktreeError", () => {
	const runtime = makeRuntime({
		git: (args) => {
			if (args[0] === "rev-parse") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			if (args[0] === "diff" && args.includes("HEAD"))
				return ok("diff --git a/x b/x\n");
			return fail("unexpected");
		},
		applyPatch: () => fail("error: patch does not apply", 1),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "materialize-apply",
	);
});

test("createWorktree: self-cleans the just-added worktree when post-add setup fails (R3-F08)", () => {
	const removeCalls: Array<readonly string[]> = [];
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args) => {
			if (args[0] === "rev-parse") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			// Materialize diff: return non-empty so apply is attempted.
			if (args[0] === "diff" && args.includes("HEAD"))
				return ok("diff --git a/x b/x\n");
			// Self-cleanup: git worktree remove --force.
			if (args[0] === "worktree" && args[1] === "remove") {
				removeCalls.push(args);
				return ok();
			}
			return fail("unexpected");
		},
		// Materialize-apply FAILS — triggers the self-cleanup path.
		applyPatch: () => fail("error: patch does not apply", 1),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "materialize-apply",
	);
	// The just-added worktree must have been removed via git worktree remove.
	assert.equal(
		removeCalls.length,
		1,
		"self-cleanup must invoke worktree remove",
	);
	assert.ok(
		removeCalls[0].includes("/repo/.specflow/worktrees/run-1/bundle-a"),
		"self-cleanup must target the correct worktree path",
	);
});

test("createWorktree: self-cleans when snapshot fails after successful materialize (R3-F08)", () => {
	const removeCalls: Array<readonly string[]> = [];
	const workspaceDiff = Buffer.from(
		"diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n",
		"utf8",
	);
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args, cwd) => {
			if (args[0] === "rev-parse" && cwd === "/repo") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			// Materialize diff at repo root: non-empty.
			if (args[0] === "diff" && args.includes("HEAD") && cwd === "/repo")
				return ok(workspaceDiff);
			// Snapshot diff check in worktree: non-empty (changes were applied).
			if (args[0] === "diff" && args.includes("HEAD") && cwd !== "/repo")
				return ok(workspaceDiff);
			// Snapshot: git add -A succeeds.
			if (args[0] === "add" && args[1] === "-A") return ok();
			// Snapshot: git commit FAILS — triggers self-cleanup.
			if (args[0] === "commit") return fail("error: unable to commit", 1);
			// Self-cleanup: worktree remove.
			if (args[0] === "worktree" && args[1] === "remove") {
				removeCalls.push(args);
				return ok();
			}
			return fail("unexpected");
		},
		applyPatch: () => ok(),
	});
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError && err.cause.operation === "snapshot-commit",
	);
	assert.equal(
		removeCalls.length,
		1,
		"self-cleanup must invoke worktree remove on snapshot failure",
	);
});

test("createWorktree: self-cleanup failure does not mask the original error (R3-F08)", () => {
	const runtime = makeRuntime({
		repoRoot: "/repo",
		git: (args) => {
			if (args[0] === "rev-parse") return ok("abc\n");
			if (args[0] === "worktree" && args[1] === "add") return ok();
			if (args[0] === "diff" && args.includes("HEAD"))
				return ok("diff --git a/x b/x\n");
			// Self-cleanup also fails (e.g., filesystem issue).
			if (args[0] === "worktree" && args[1] === "remove")
				return fail("fatal: cannot remove", 128);
			return fail("unexpected");
		},
		// Materialize-apply FAILS — triggers self-cleanup, which also fails.
		applyPatch: () => fail("error: patch does not apply", 1),
	});
	// The ORIGINAL error (materialize-apply) must propagate, not the cleanup error.
	assert.throws(
		() => createWorktree(runtime, "run-1", "bundle-a"),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "materialize-apply",
	);
});

// --- worktreePath ---

test("worktreePath: produces the .specflow/worktrees/<run>/<bundle> convention", () => {
	assert.equal(
		worktreePath("/repo", "run-1", "bundle-a"),
		"/repo/.specflow/worktrees/run-1/bundle-a",
	);
});

// --- computeDiff ---

test("computeDiff: stages untracked files via add -N then runs git diff --binary --find-renames from the base SHA", () => {
	const invocations: Array<readonly string[]> = [];
	const handle: WorktreeHandle = {
		path: "/repo/.specflow/worktrees/r/b",
		baseSha: "abc123",
		runId: "r",
		bundleId: "b",
	};
	const runtime = makeRuntime({
		git: (args, cwd) => {
			invocations.push(args);
			assert.equal(cwd, handle.path);
			// `git add -N` (intent-to-add) is invoked first so subsequent
			// `git diff` includes untracked files. Return zero.
			if (args[0] === "add" && args[1] === "-N") return ok();
			return ok(Buffer.from("diff --git a/x b/x\n...\n", "utf8"));
		},
	});
	const patch = computeDiff(runtime, handle);
	// First call: add -N -- . (intent-to-add, captures untracked)
	const addCall = invocations[0];
	assert.equal(addCall[0], "add");
	assert.equal(addCall[1], "-N");
	// Second call: the actual diff.
	const diffCall = invocations[1];
	assert.equal(diffCall[0], "diff");
	assert.ok(diffCall.includes("--binary"));
	assert.ok(diffCall.includes("--find-renames"));
	assert.ok(diffCall.includes("abc123"));
	assert.ok(patch.toString("utf8").startsWith("diff --git a/x b/x"));
});

test("computeDiff: propagates git add -N failure as WorktreeError", () => {
	const handle: WorktreeHandle = {
		path: "/repo/wt",
		baseSha: "abc123",
		runId: "r",
		bundleId: "b",
	};
	const runtime = makeRuntime({
		git: (args) => {
			if (args[0] === "add" && args[1] === "-N")
				return fail("error: index lock", 1);
			return ok();
		},
	});
	assert.throws(
		() => computeDiff(runtime, handle),
		(err) =>
			err instanceof WorktreeError && err.cause.operation === "diff-intent-add",
	);
});

test("computeDiff: returns raw binary buffer so NUL bytes survive", () => {
	const handle: WorktreeHandle = {
		path: "/repo/wt",
		baseSha: "abc123",
		runId: "r",
		bundleId: "b",
	};
	const binary = Buffer.concat([
		Buffer.from("diff --git a/img.png b/img.png\n", "utf8"),
		Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0xab]),
	]);
	const runtime = makeRuntime({
		git: (args) => {
			if (args[0] === "add" && args[1] === "-N") return ok();
			return ok(binary);
		},
	});
	const patch = computeDiff(runtime, handle);
	assert.equal(patch.length, binary.length);
	assert.equal(patch[binary.length - 1], 0xab);
	assert.equal(patch[binary.length - 2], 0x00);
});

// --- importPatch ---

test("importPatch: short-circuits on empty patch with no git invocation", () => {
	let called = false;
	const runtime = makeRuntime({
		applyPatch: () => {
			called = true;
			return ok();
		},
	});
	importPatch(runtime, Buffer.alloc(0));
	assert.equal(called, false);
});

test("importPatch: applies non-empty patch at repoRoot and succeeds", () => {
	interface Captured {
		patch: Buffer;
		cwd: string;
	}
	const captured: Captured[] = [];
	const runtime = makeRuntime({
		applyPatch: (patch, cwd) => {
			captured.push({ patch, cwd });
			return ok();
		},
	});
	const patch = Buffer.from("diff --git a/x b/x\n--- a/x\n+++ b/x\n", "utf8");
	importPatch(runtime, patch);
	assert.equal(captured.length, 1);
	assert.equal(captured[0].cwd, "/repo");
	assert.equal(captured[0].patch.toString("utf8"), patch.toString("utf8"));
});

test("importPatch: throws WorktreeError with apply operation on failure", () => {
	const runtime = makeRuntime({
		applyPatch: () => fail("error: patch does not apply", 1),
	});
	const patch = Buffer.from("not-a-valid-patch", "utf8");
	assert.throws(
		() => importPatch(runtime, patch),
		(err) =>
			err instanceof WorktreeError &&
			err.cause.operation === "apply" &&
			err.message.includes("patch does not apply"),
	);
});

// --- removeWorktree ---

test("removeWorktree: invokes git worktree remove --force to handle dirty trees", () => {
	const invocations: Array<readonly string[]> = [];
	const handle: WorktreeHandle = {
		path: "/repo/.specflow/worktrees/r/b",
		baseSha: "abc123",
		runId: "r",
		bundleId: "b",
	};
	const runtime = makeRuntime({
		git: (args) => {
			invocations.push(args);
			return ok();
		},
	});
	removeWorktree(runtime, handle);
	const call = invocations[0];
	assert.equal(call[0], "worktree");
	assert.equal(call[1], "remove");
	assert.ok(call.includes("--force"));
	assert.ok(call.includes(handle.path));
});

test("removeWorktree: propagates git failure", () => {
	const handle: WorktreeHandle = {
		path: "/repo/wt",
		baseSha: "abc123",
		runId: "r",
		bundleId: "b",
	};
	const runtime = makeRuntime({
		git: () => fail("fatal: not a working tree", 128),
	});
	assert.throws(() => removeWorktree(runtime, handle));
});

// --- listTouchedPaths ---

test("listTouchedPaths: extracts paths from simple modify diff", () => {
	const patch = [
		"diff --git a/src/a.ts b/src/a.ts",
		"index 0000..1111 100644",
		"--- a/src/a.ts",
		"+++ b/src/a.ts",
		"@@ -1 +1 @@",
		"-old",
		"+new",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths].sort(), ["src/a.ts"]);
});

test("listTouchedPaths: extracts new-path on rename", () => {
	const patch = [
		"diff --git a/old/name.ts b/new/name.ts",
		"similarity index 95%",
		"rename from old/name.ts",
		"rename to new/name.ts",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["new/name.ts"]);
	assert.ok(!paths.has("old/name.ts"));
});

test("listTouchedPaths: extracts path on delete", () => {
	const patch = [
		"diff --git a/gone.ts b/gone.ts",
		"deleted file mode 100644",
		"--- a/gone.ts",
		"+++ /dev/null",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["gone.ts"]);
});

test("listTouchedPaths: extracts path on new file", () => {
	const patch = [
		"diff --git a/new.ts b/new.ts",
		"new file mode 100644",
		"index 0000000..abc1234",
		"--- /dev/null",
		"+++ b/new.ts",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["new.ts"]);
});

test("listTouchedPaths: extracts path on mode-only change", () => {
	const patch = [
		"diff --git a/bin/run.sh b/bin/run.sh",
		"old mode 100644",
		"new mode 100755",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["bin/run.sh"]);
});

test("listTouchedPaths: extracts path on binary-file change (no text hunks)", () => {
	const patch = [
		"diff --git a/img.png b/img.png",
		"index 1111..2222 100644",
		"GIT binary patch",
		"literal 10",
		"Hcmeyu...",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["img.png"]);
});

test("listTouchedPaths: extracts multiple paths across a combined patch", () => {
	const patch = [
		"diff --git a/a.ts b/a.ts",
		"--- a/a.ts",
		"+++ b/a.ts",
		"diff --git a/old.ts b/new.ts",
		"rename from old.ts",
		"rename to new.ts",
		"diff --git a/bin.sh b/bin.sh",
		"old mode 100644",
		"new mode 100755",
		"diff --git a/gone.ts b/gone.ts",
		"deleted file mode 100644",
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths].sort(), ["a.ts", "bin.sh", "gone.ts", "new.ts"]);
	assert.ok(!paths.has("old.ts"));
});

test("listTouchedPaths: handles git-quoted paths with spaces", () => {
	const patch = [
		'diff --git "a/src/has space.ts" "b/src/has space.ts"',
		'--- "a/src/has space.ts"',
		'+++ "b/src/has space.ts"',
		"",
	].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["src/has space.ts"]);
});

test("listTouchedPaths: handles git-quoted paths with backslash escapes", () => {
	const patch = ['diff --git "a/weird\\tpath" "b/weird\\tpath"', ""].join("\n");
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["weird\tpath"]);
});

test("listTouchedPaths: accepts Buffer input (binary patch bytes)", () => {
	const patch = Buffer.concat([
		Buffer.from("diff --git a/img.png b/img.png\n", "utf8"),
		Buffer.from([0x00, 0x01, 0x02]),
		Buffer.from("\nmore\n", "utf8"),
	]);
	const paths = listTouchedPaths(patch);
	assert.deepEqual([...paths], ["img.png"]);
});

test("listTouchedPaths: returns empty set on empty patch", () => {
	const paths = listTouchedPaths("");
	assert.equal(paths.size, 0);
});

// --- isProtectedPath ---

test("isProtectedPath: task-graph.json under the change dir is protected", () => {
	assert.equal(
		isProtectedPath("openspec/changes/my-change/task-graph.json", "my-change"),
		true,
	);
});

test("isProtectedPath: tasks.md under the change dir is protected", () => {
	assert.equal(
		isProtectedPath("openspec/changes/my-change/tasks.md", "my-change"),
		true,
	);
});

test("isProtectedPath: any path under .specflow/ is protected", () => {
	assert.equal(isProtectedPath(".specflow/runs/r/state.json", "ch"), true);
	assert.equal(isProtectedPath(".specflow/worktrees/r/b/foo.ts", "ch"), true);
});

test("isProtectedPath: openspec/specs is not protected (only the change's own graph/tasks are)", () => {
	assert.equal(
		isProtectedPath("openspec/specs/some-cap/spec.md", "my-change"),
		false,
	);
});

test("isProtectedPath: another change's task-graph is not protected under this change", () => {
	assert.equal(
		isProtectedPath(
			"openspec/changes/other-change/task-graph.json",
			"my-change",
		),
		false,
	);
});

test("isProtectedPath: unrelated source file is not protected", () => {
	assert.equal(isProtectedPath("src/foo.ts", "my-change"), false);
});

// --- internal parsing guards ---

test("parseDiffGitLine: returns null for non-matching input", () => {
	assert.equal(__internal_testing.parseDiffGitLine("not a diff header"), null);
	assert.equal(__internal_testing.parseDiffGitLine("diff --git "), null);
	assert.equal(
		__internal_testing.parseDiffGitLine("diff --git onlyone/path"),
		null,
	);
});

test("dequoteGitPath: decodes common C-style escapes", () => {
	assert.equal(__internal_testing.dequoteGitPath("plain"), "plain");
	assert.equal(__internal_testing.dequoteGitPath("a\\tb"), "a\tb");
	assert.equal(__internal_testing.dequoteGitPath("a\\nb"), "a\nb");
	assert.equal(__internal_testing.dequoteGitPath("a\\\\b"), "a\\b");
	assert.equal(__internal_testing.dequoteGitPath('say\\"hi'), 'say"hi');
});
