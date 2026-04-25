// Real-git integration tests for apply-worktree-isolation.
//
// The rest of the test suite uses injected WorktreeRuntime fakes. This file
// spawns actual `git` against a temp repository to verify the production
// `defaultGit` / `defaultApplier` paths — the code paths that use
// `git apply --binary --index` (R1-F01) and the full materialize + snapshot
// sequence end-to-end. Without this, a regression in the production-only
// branches (e.g., dropping `--index`) would not be caught by the injected-
// runner tests.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	computeDiff,
	createWorktree,
	importPatch,
	removeWorktree,
} from "../lib/apply-worktree/worktree.js";

function git(args: readonly string[], cwd: string): string {
	return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}

function initRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "specflow-realgit-"));
	git(["init", "--quiet"], root);
	git(["config", "user.email", "test@specflow.local"], root);
	git(["config", "user.name", "specflow-test"], root);
	git(["config", "commit.gpgsign", "false"], root);
	writeFileSync(join(root, "README.md"), "initial\n", "utf8");
	git(["add", "README.md"], root);
	git(["commit", "-q", "-m", "initial"], root);
	return root;
}

test("createWorktree (real git): later worktree inherits earlier imported bundle changes (R1-F01)", () => {
	const root = initRepo();
	try {
		// Simulate the full multi-bundle apply-run flow:
		//
		// 1. Bundle A "imports" a patch into the main workspace via importPatch.
		//    Production uses `git apply --binary --index` so the change is staged
		//    and will be visible to later `git diff HEAD` calls.
		// 2. Bundle B's worktree is created. The materialize step picks up A's
		//    staged change and applies it into B's worktree. The snapshot step
		//    commits it in the worktree so baseSha points at the post-A commit.
		// 3. The subagent for B makes its own edit. `computeDiff` captures ONLY
		//    B's delta, not A's already-materialized change.

		const patchFromBundleA = [
			"diff --git a/bundle-a-output.txt b/bundle-a-output.txt",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/bundle-a-output.txt",
			"@@ -0,0 +1 @@",
			"+written by bundle A",
			"",
		].join("\n");

		importPatch(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			Buffer.from(patchFromBundleA, "utf8"),
		);

		// Verify A's new file is staged (R1-F01: --index flag effect).
		const stagedFiles = git(["diff", "--name-only", "--cached", "HEAD"], root);
		assert.ok(
			stagedFiles.split("\n").includes("bundle-a-output.txt"),
			`bundle-a-output.txt must be staged in main workspace index; staged: ${stagedFiles}`,
		);

		// Also verify it would show up in git diff HEAD (the input to materialize).
		const diffHead = git(["diff", "--name-only", "HEAD"], root);
		assert.ok(
			diffHead.split("\n").includes("bundle-a-output.txt"),
			`bundle-a-output.txt must be visible to git diff HEAD; diff --name-only HEAD: ${diffHead}`,
		);

		// Now create bundle B's worktree. The materialize+snapshot sequence must
		// pull A's change into B's worktree.
		const handle = createWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			"run-1",
			"bundle-b",
		);

		// Bundle B's worktree must contain A's imported file.
		const materializedFile = readFileSync(
			join(handle.path, "bundle-a-output.txt"),
			"utf8",
		);
		assert.equal(
			materializedFile,
			"written by bundle A\n",
			"bundle B's worktree must contain bundle A's imported changes",
		);

		// baseSha must point at the snapshot commit, not the pre-A HEAD.
		const mainHead = git(["rev-parse", "HEAD"], root);
		assert.notEqual(
			handle.baseSha,
			mainHead,
			"handle.baseSha must point at the snapshot commit, not the main-workspace HEAD",
		);

		// Now simulate bundle B's subagent making its own edit in the worktree.
		writeFileSync(
			join(handle.path, "bundle-b-output.txt"),
			"written by bundle B\n",
			"utf8",
		);

		// computeDiff must capture ONLY B's delta (not A's already-materialized content).
		const bDiff = computeDiff(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			handle,
		).toString("utf8");
		assert.ok(
			bDiff.includes("bundle-b-output.txt"),
			"B's diff must include B's own file",
		);
		assert.ok(
			!bDiff.includes("bundle-a-output.txt"),
			"B's diff MUST NOT include A's already-materialized file (would cause double-apply at main root)",
		);

		// Clean up the worktree explicitly so the temp dir can be removed.
		removeWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			handle,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("createWorktree (real git): untracked files in main workspace are materialized into the worktree (R4-F10)", () => {
	const root = initRepo();
	try {
		// Create an untracked file in the main workspace (NOT staged, NOT committed).
		writeFileSync(join(root, "untracked-new.txt"), "I am untracked\n", "utf8");

		// Verify the file is truly untracked.
		const lsFiles = git(["ls-files", "--others", "--exclude-standard"], root);
		assert.ok(
			lsFiles.split("\n").includes("untracked-new.txt"),
			`untracked-new.txt must be listed as untracked; got: ${lsFiles}`,
		);

		// Create a worktree — materialize must include the untracked file.
		const handle = createWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			"run-1",
			"bundle-ut",
		);

		// The untracked file must be present in the worktree.
		const materialized = readFileSync(
			join(handle.path, "untracked-new.txt"),
			"utf8",
		);
		assert.equal(
			materialized,
			"I am untracked\n",
			"untracked file must be materialized into the worktree",
		);

		// The main workspace's untracked file must STILL be untracked after
		// materialization (the intent-to-add + reset must leave the index clean).
		const lsFilesAfter = git(
			["ls-files", "--others", "--exclude-standard"],
			root,
		);
		assert.ok(
			lsFilesAfter.split("\n").includes("untracked-new.txt"),
			`untracked-new.txt must remain untracked in main workspace after materialization; got: ${lsFilesAfter}`,
		);

		removeWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			handle,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("createWorktree (real git): clean workspace — no materialize, baseSha equals main HEAD", () => {
	const root = initRepo();
	try {
		const mainHead = git(["rev-parse", "HEAD"], root);
		const handle = createWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			"run-1",
			"bundle-a",
		);

		// With no uncommitted changes, the snapshot step is a no-op and baseSha
		// stays at the main HEAD.
		assert.equal(handle.baseSha, mainHead);
		// Worktree tree matches main HEAD exactly.
		const wtReadme = readFileSync(join(handle.path, "README.md"), "utf8");
		assert.equal(wtReadme, "initial\n");

		removeWorktree(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			handle,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("importPatch (real git): newly created file is staged in the index (R1-F01)", () => {
	const root = initRepo();
	try {
		const patch = [
			"diff --git a/new-file.txt b/new-file.txt",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/new-file.txt",
			"@@ -0,0 +1 @@",
			"+hello",
			"",
		].join("\n");

		importPatch(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			Buffer.from(patch, "utf8"),
		);

		// Under --index, the new file must be staged (not just in the working tree).
		// Without --index, `git diff --cached HEAD` would be empty for untracked files.
		const staged = git(["diff", "--name-only", "--cached", "HEAD"], root);
		assert.ok(
			staged.split("\n").includes("new-file.txt"),
			`new-file.txt must be staged; actually staged: '${staged}'`,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("importPatch (real git): binary-safe patch applies cleanly", () => {
	const root = initRepo();
	try {
		// Create a binary file, commit it, then compute a real binary-safe patch
		// that replaces it. This exercises `git apply --binary`.
		const originalBytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
		writeFileSync(join(root, "img.bin"), originalBytes);
		git(["add", "img.bin"], root);
		git(["commit", "-q", "-m", "add binary"], root);

		// Modify the binary and capture the diff.
		const modifiedBytes = Buffer.from([0x10, 0x20, 0x30, 0x40, 0x50]);
		writeFileSync(join(root, "img.bin"), modifiedBytes);
		const diffOutput = execFileSync("git", ["diff", "--binary", "HEAD"], {
			cwd: root,
		});

		// Reset and re-apply via importPatch.
		git(["checkout", "--", "img.bin"], root);
		const current = readFileSync(join(root, "img.bin"));
		assert.deepEqual(
			Buffer.from(current),
			originalBytes,
			"reset must restore original bytes",
		);

		importPatch(
			{ repoRoot: root, mainWorkspacePath: root, changeId: "test-change" },
			diffOutput,
		);

		// The binary file must now match the modified bytes.
		const applied = readFileSync(join(root, "img.bin"));
		assert.deepEqual(Buffer.from(applied), modifiedBytes);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
