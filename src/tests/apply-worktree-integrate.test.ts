import assert from "node:assert/strict";
import test from "node:test";
import {
	formatRejectionCause,
	integrateBundle,
} from "../lib/apply-worktree/integrate.js";
import type {
	GitApplier,
	GitCommandResult,
	GitRunner,
	WorktreeHandle,
	WorktreeRuntime,
} from "../lib/apply-worktree/worktree.js";

const CHANGE_ID = "my-change";

function handle(overrides: Partial<WorktreeHandle> = {}): WorktreeHandle {
	return {
		path: "/repo/.specflow/worktrees/run-1/bundle-a",
		baseSha: "base-sha",
		runId: "run-1",
		bundleId: "bundle-a",
		...overrides,
	};
}

function ok(stdout: string | Buffer = ""): GitCommandResult {
	return {
		status: 0,
		stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "utf8"),
		stderr: "",
	};
}

function failGit(stderr: string, status = 1): GitCommandResult {
	return { status, stdout: Buffer.alloc(0), stderr };
}

function fakeRuntime(opts: {
	readonly diffOutput: string;
	readonly applyResult?: GitCommandResult;
	readonly onApply?: (patch: Buffer) => void;
}): WorktreeRuntime {
	const git: GitRunner = (args) => {
		// `git add -N .` is invoked by computeDiff to surface untracked files
		// in the subsequent `git diff`. Return success as a no-op.
		if (args[0] === "add" && args[1] === "-N") {
			return ok();
		}
		if (args[0] === "diff") {
			return ok(opts.diffOutput);
		}
		throw new Error(
			`unexpected git call in integration test: ${args.join(" ")}`,
		);
	};
	const applyPatch: GitApplier = (patch) => {
		if (opts.onApply) opts.onApply(patch);
		return opts.applyResult ?? ok();
	};
	return { repoRoot: "/repo", git, applyPatch };
}

// --- Success path ---

test("integrateBundle: success when every touched path is declared and apply succeeds", () => {
	let appliedPatch: Buffer | null = null;
	const diff = [
		"diff --git a/src/a.ts b/src/a.ts",
		"--- a/src/a.ts",
		"+++ b/src/a.ts",
		"",
	].join("\n");
	const runtime = fakeRuntime({
		diffOutput: diff,
		onApply: (p) => {
			appliedPatch = p;
		},
	});
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["src/a.ts"],
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.deepEqual(result.touched, ["src/a.ts"]);
	assert.deepEqual(result.overDeclared, []);
	assert.ok(appliedPatch, "patch must be applied on success");
});

test("integrateBundle: success emits overDeclared warning list for non-touched declared paths", () => {
	const diff = [
		"diff --git a/a.ts b/a.ts",
		"--- a/a.ts",
		"+++ b/a.ts",
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["a.ts", "b.ts", "c.ts"],
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.deepEqual(result.touched, ["a.ts"]);
	assert.deepEqual(result.overDeclared, ["b.ts", "c.ts"]);
});

test("integrateBundle: success with a rename matches new path against produced_artifacts", () => {
	const diff = [
		"diff --git a/old.ts b/new.ts",
		"rename from old.ts",
		"rename to new.ts",
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["new.ts"], // new path declared; old not declared
		},
	});
	assert.equal(result.ok, true, "rename must match by new path");
});

// --- Rejection: empty_diff_on_success ---

test("integrateBundle: rejects with empty_diff_on_success when diff is empty", () => {
	const runtime = fakeRuntime({ diffOutput: "" });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["a.ts"],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "empty_diff_on_success");
	assert.deepEqual(result.touched, []);
});

// --- Rejection: protected_path ---

test("integrateBundle: rejects with protected_path when diff touches task-graph.json", () => {
	const diff = [
		`diff --git a/openspec/changes/${CHANGE_ID}/task-graph.json b/openspec/changes/${CHANGE_ID}/task-graph.json`,
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: [`openspec/changes/${CHANGE_ID}/task-graph.json`],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "protected_path");
	if (result.cause.kind === "protected_path") {
		assert.equal(
			result.cause.path,
			`openspec/changes/${CHANGE_ID}/task-graph.json`,
		);
	}
});

test("integrateBundle: rejects with protected_path when diff touches tasks.md", () => {
	const diff = [
		`diff --git a/openspec/changes/${CHANGE_ID}/tasks.md b/openspec/changes/${CHANGE_ID}/tasks.md`,
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: [`openspec/changes/${CHANGE_ID}/tasks.md`],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "protected_path");
});

test("integrateBundle: rejects with protected_path when diff touches any path under .specflow/", () => {
	const diff = [
		"diff --git a/.specflow/runs/r/state.json b/.specflow/runs/r/state.json",
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: [".specflow/runs/r/state.json"],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "protected_path");
});

test("integrateBundle: protected-path rejection takes precedence over undeclared-path rejection", () => {
	const diff = [
		`diff --git a/openspec/changes/${CHANGE_ID}/task-graph.json b/openspec/changes/${CHANGE_ID}/task-graph.json`,
		"diff --git a/other.ts b/other.ts", // also undeclared
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: [], // both are undeclared, BUT task-graph is protected
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "protected_path");
});

// --- Rejection: undeclared_path ---

test("integrateBundle: rejects with undeclared_path on touched path not in produced_artifacts", () => {
	const diff = [
		"diff --git a/declared.ts b/declared.ts",
		"diff --git a/sneaky.ts b/sneaky.ts", // undeclared
		"",
	].join("\n");
	const runtime = fakeRuntime({ diffOutput: diff });
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["declared.ts"],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.cause.kind, "undeclared_path");
	if (result.cause.kind === "undeclared_path") {
		assert.equal(result.cause.path, "sneaky.ts");
	}
});

// --- Rejection: patch_apply_failure ---

test("integrateBundle: rejects with patch_apply_failure when git apply returns non-zero", () => {
	let applyCalled = false;
	const diff = ["diff --git a/a.ts b/a.ts", ""].join("\n");
	const runtime: WorktreeRuntime = {
		repoRoot: "/repo",
		git: () => ok(diff),
		applyPatch: () => {
			applyCalled = true;
			return failGit("error: patch failed at line 1", 1);
		},
	};
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: ["a.ts"],
		},
	});
	assert.equal(result.ok, false);
	assert.equal(applyCalled, true, "git apply must be invoked");
	if (result.ok) return;
	assert.equal(result.cause.kind, "patch_apply_failure");
	if (result.cause.kind === "patch_apply_failure") {
		assert.ok(result.cause.stderr.includes("patch failed"));
	}
});

test("integrateBundle: patch_apply_failure is checked LAST (after declaration and protected-path checks)", () => {
	// Valid diff, undeclared path. Apply would fail if invoked, but
	// undeclared-path check should fire first and short-circuit.
	let applyInvoked = false;
	const diff = "diff --git a/undeclared.ts b/undeclared.ts\n";
	const runtime: WorktreeRuntime = {
		repoRoot: "/repo",
		git: () => ok(diff),
		applyPatch: () => {
			applyInvoked = true;
			return failGit("would have failed", 1);
		},
	};
	const result = integrateBundle({
		runtime,
		handle: handle(),
		changeId: CHANGE_ID,
		subagentResult: {
			status: "success",
			produced_artifacts: [],
		},
	});
	assert.equal(result.ok, false);
	assert.equal(applyInvoked, false, "apply must not run before check passes");
	if (result.ok) return;
	assert.equal(result.cause.kind, "undeclared_path");
});

// --- formatRejectionCause ---

test("formatRejectionCause: includes the cause kind and context for each cause", () => {
	assert.ok(
		formatRejectionCause({ kind: "empty_diff_on_success" }).includes(
			"empty_diff_on_success",
		),
	);
	assert.ok(
		formatRejectionCause({
			kind: "protected_path",
			path: ".specflow/x",
		}).includes(".specflow/x"),
	);
	assert.ok(
		formatRejectionCause({
			kind: "undeclared_path",
			path: "sneaky.ts",
		}).includes("sneaky.ts"),
	);
	assert.ok(
		formatRejectionCause({
			kind: "patch_apply_failure",
			stderr: "hunk failed",
		}).includes("hunk failed"),
	);
});
