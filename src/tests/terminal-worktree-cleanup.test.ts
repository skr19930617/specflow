// Tests for the terminal-phase cleanup gate.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { evaluateAndCleanup } from "../lib/terminal-worktree-cleanup.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function initRepo(repoPath: string): void {
	mkdirSync(repoPath, { recursive: true });
	spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.email", "tw@example.com"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.name", "Worktree Cleanup Tests"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	writeFileSync(join(repoPath, "seed.txt"), "seed\n", "utf8");
	spawnSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["commit", "-m", "init"], {
		cwd: repoPath,
		stdio: "ignore",
	});
}

function addWorktree(repoPath: string, changeId: string): string {
	const wtPath = join(repoPath, ".specflow/worktrees", changeId, "main");
	mkdirSync(join(repoPath, ".specflow/worktrees", changeId), {
		recursive: true,
	});
	const result = spawnSync(
		"git",
		["worktree", "add", "-b", changeId, wtPath, "HEAD"],
		{ cwd: repoPath, stdio: "ignore" },
	);
	if (result.status !== 0) {
		throw new Error(`git worktree add failed: ${result.status}`);
	}
	return wtPath;
}

test("evaluateAndCleanup removes the per-change parent when clean and complete", () => {
	const tempRoot = makeTempDir("twc-clean-");
	try {
		const repoPath = join(tempRoot, "repo");
		initRepo(repoPath);
		const changeId = "wt-clean";
		const wtPath = addWorktree(repoPath, changeId);
		assert.ok(existsSync(wtPath));

		const decision = evaluateAndCleanup({
			repoPath,
			changeId,
			successFull: true,
		});

		assert.equal(decision.action, "remove");
		assert.equal(existsSync(wtPath), false);
		assert.equal(
			existsSync(join(repoPath, ".specflow/worktrees", changeId)),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("evaluateAndCleanup defers when terminal action did not succeed fully", () => {
	const tempRoot = makeTempDir("twc-partial-");
	try {
		const repoPath = join(tempRoot, "repo");
		initRepo(repoPath);
		const changeId = "wt-partial";
		const wtPath = addWorktree(repoPath, changeId);

		const decision = evaluateAndCleanup({
			repoPath,
			changeId,
			successFull: false,
			partialFailureCause: "PR creation failed",
		});

		assert.equal(decision.action, "defer");
		if (decision.action === "defer") {
			assert.ok(decision.reasons.some((r) => r.kind === "partial_failure"));
			assert.ok(
				decision.reasons.some((r) => r.detail.includes("PR creation failed")),
			);
		}
		// Worktree still on disk because cleanup deferred.
		assert.ok(existsSync(wtPath));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("evaluateAndCleanup defers when a worktree is dirty", () => {
	const tempRoot = makeTempDir("twc-dirty-");
	try {
		const repoPath = join(tempRoot, "repo");
		initRepo(repoPath);
		const changeId = "wt-dirty";
		const wtPath = addWorktree(repoPath, changeId);
		// Make the worktree dirty.
		writeFileSync(join(wtPath, "uncommitted.txt"), "scribble\n", "utf8");

		const decision = evaluateAndCleanup({
			repoPath,
			changeId,
			successFull: true,
		});

		assert.equal(decision.action, "defer");
		if (decision.action === "defer") {
			assert.ok(
				decision.reasons.some(
					(r) => r.kind === "dirty_worktree" && r.worktreePath === wtPath,
				),
			);
		}
		assert.ok(existsSync(wtPath));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("evaluateAndCleanup is a no-op when nothing exists at the per-change parent", () => {
	const tempRoot = makeTempDir("twc-nothing-");
	try {
		const repoPath = join(tempRoot, "repo");
		initRepo(repoPath);

		const decision = evaluateAndCleanup({
			repoPath,
			changeId: "never-existed",
			successFull: true,
		});

		assert.equal(decision.action, "remove");
		if (decision.action === "remove") {
			assert.deepEqual(decision.removed, []);
		}
	} finally {
		removeTempDir(tempRoot);
	}
});

test("evaluateAndCleanup retry: cleanup succeeds after the dirty state is resolved", () => {
	const tempRoot = makeTempDir("twc-retry-");
	try {
		const repoPath = join(tempRoot, "repo");
		initRepo(repoPath);
		const changeId = "wt-retry";
		const wtPath = addWorktree(repoPath, changeId);
		writeFileSync(join(wtPath, "uncommitted.txt"), "scribble\n", "utf8");

		// First attempt: dirty → defer.
		const first = evaluateAndCleanup({
			repoPath,
			changeId,
			successFull: true,
		});
		assert.equal(first.action, "defer");
		assert.ok(existsSync(wtPath));

		// User commits the dirty file.
		spawnSync("git", ["-C", wtPath, "add", "."], { stdio: "ignore" });
		spawnSync("git", ["-C", wtPath, "commit", "-m", "fix"], {
			stdio: "ignore",
		});

		// Retry: clean → remove.
		const second = evaluateAndCleanup({
			repoPath,
			changeId,
			successFull: true,
		});
		assert.equal(second.action, "remove");
		assert.equal(existsSync(wtPath), false);
		assert.equal(
			existsSync(join(repoPath, ".specflow/worktrees", changeId)),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});
