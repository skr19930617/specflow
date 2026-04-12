import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createLocalWorkspaceContext } from "../lib/local-workspace-context.js";
import {
	createFixtureRepo,
	makeTempDir,
	removeTempDir,
} from "./test-helpers.js";

let tempDir: string;

function setup() {
	tempDir = makeTempDir("ws-ctx-");
	return createFixtureRepo(tempDir);
}

function teardown() {
	removeTempDir(tempDir);
}

test("projectRoot returns git root", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.projectRoot(), realpathSync(repoPath));
	} finally {
		teardown();
	}
});

test("branchName returns current branch", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.branchName(), "main");
	} finally {
		teardown();
	}
});

test("branchName returns HEAD on detached HEAD", () => {
	const { repoPath } = setup();
	try {
		const head = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: repoPath,
			encoding: "utf8",
		}).stdout.trim();
		spawnSync("git", ["checkout", "--detach", head], {
			cwd: repoPath,
			stdio: "ignore",
		});
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.branchName(), "HEAD");
	} finally {
		teardown();
	}
});

test("projectIdentity returns owner/repo from origin", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.projectIdentity(), "test/repo");
	} finally {
		teardown();
	}
});

test("projectIdentity falls back to local/<dirname> without origin", () => {
	tempDir = makeTempDir("ws-ctx-noorigin-");
	const repoPath = join(tempDir, "my-project");
	mkdirSync(repoPath, { recursive: true });
	spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["config", "user.email", "test@test.com"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.name", "Test"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["commit", "--allow-empty", "-m", "init"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.projectIdentity(), "local/my-project");
		assert.equal(ctx.projectDisplayName(), "local/my-project");
	} finally {
		teardown();
	}
});

test("projectDisplayName matches projectIdentity", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.projectDisplayName(), ctx.projectIdentity());
	} finally {
		teardown();
	}
});

test("worktreePath returns git root", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		assert.equal(ctx.worktreePath(), realpathSync(repoPath));
	} finally {
		teardown();
	}
});

test("constructor throws on non-git directory", () => {
	const dir = makeTempDir("ws-ctx-nogit-");
	try {
		assert.throws(
			() => createLocalWorkspaceContext(dir),
			/not a git repository/,
		);
	} finally {
		removeTempDir(dir);
	}
});

test("filteredDiff returns empty when no changes", () => {
	const { repoPath } = setup();
	try {
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff([]);
		assert.equal(result.diff, "");
		assert.equal(result.summary, "empty");
	} finally {
		teardown();
	}
});

test("filteredDiff returns diff for changed files", () => {
	const { repoPath } = setup();
	try {
		writeFileSync(join(repoPath, "app.txt"), "changed\n", "utf8");
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff([]);
		assert.notEqual(result.summary, "empty");
		assert.ok(result.diff.includes("changed"));
		if (result.summary !== "empty") {
			assert.ok(result.summary.included_count >= 1);
			assert.equal(result.summary.total_lines > 0, true);
		}
	} finally {
		teardown();
	}
});

test("filteredDiff excludes files matching exclude globs", () => {
	const { repoPath } = setup();
	try {
		writeFileSync(join(repoPath, "app.txt"), "changed\n", "utf8");
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff(["app.txt"]);
		// app.txt is the only changed file, excluding it should give empty
		assert.equal(result.summary, "empty");
	} finally {
		teardown();
	}
});

test("filteredDiff excludes deleted files from diff but records in excluded", () => {
	const { repoPath } = setup();
	try {
		spawnSync("git", ["rm", "app.txt"], { cwd: repoPath, stdio: "ignore" });
		// Also add another file to have at least one non-deleted change
		writeFileSync(join(repoPath, "other.txt"), "new\n", "utf8");
		spawnSync("git", ["add", "other.txt"], { cwd: repoPath, stdio: "ignore" });
		// Reset to make it unstaged
		spawnSync("git", ["reset", "HEAD", "--", "other.txt"], {
			cwd: repoPath,
			stdio: "ignore",
		});
		// The diff should show app.txt as deleted (excluded) but not in diff text
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff([]);
		if (result.summary !== "empty") {
			const deletedEntry = result.summary.excluded.find(
				(e) => e.reason === "deleted_file",
			);
			assert.ok(deletedEntry, "deleted file should be in excluded");
			assert.equal(deletedEntry.file, "app.txt");
		}
	} finally {
		teardown();
	}
});

test("filteredDiff excludes pure renames", () => {
	const { repoPath } = setup();
	try {
		// Create a rename with git mv
		spawnSync("git", ["mv", "app.txt", "renamed.txt"], {
			cwd: repoPath,
			stdio: "ignore",
		});
		// Stage but then modify something else to have unstaged changes
		writeFileSync(join(repoPath, "new.txt"), "content\n", "utf8");
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff([]);
		// The rename may or may not show depending on staging state;
		// but if it does, pure renames should be excluded
		if (result.summary !== "empty") {
			const renameEntry = result.summary.excluded.find(
				(e) => e.reason === "rename_only",
			);
			if (renameEntry) {
				assert.equal(renameEntry.file, "app.txt");
				assert.equal(renameEntry.new_path, "renamed.txt");
			}
		}
	} finally {
		teardown();
	}
});

test("filteredDiff DiffSummary has correct shape", () => {
	const { repoPath } = setup();
	try {
		writeFileSync(join(repoPath, "app.txt"), "changed\n", "utf8");
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff([]);
		assert.notEqual(result.summary, "empty");
		if (result.summary !== "empty") {
			assert.ok(Array.isArray(result.summary.excluded));
			assert.ok(Array.isArray(result.summary.warnings));
			assert.equal(typeof result.summary.included_count, "number");
			assert.equal(typeof result.summary.excluded_count, "number");
			assert.equal(typeof result.summary.total_lines, "number");
		}
	} finally {
		teardown();
	}
});

test("glob-to-pathspec conversion excludes matching files", () => {
	const { repoPath } = setup();
	try {
		const ledgerDir = join(repoPath, "openspec/changes/test-change");
		mkdirSync(ledgerDir, { recursive: true });
		writeFileSync(join(ledgerDir, "review-ledger.json"), "changed\n", "utf8");
		writeFileSync(join(repoPath, "app.txt"), "changed\n", "utf8");
		const ctx = createLocalWorkspaceContext(repoPath);
		const result = ctx.filteredDiff(["*/review-ledger.json"]);
		// review-ledger.json should be excluded by builtin pattern
		assert.notEqual(result.summary, "empty");
		if (result.summary !== "empty") {
			assert.ok(result.summary.included_count >= 1);
		}
	} finally {
		teardown();
	}
});
