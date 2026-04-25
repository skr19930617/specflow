// End-to-end smoke tests + regression guards for worktree-mode invariants.
//
// These tests cover Completion Conditions C-1..C-7 from
// `openspec/changes/worktree/design.md`:
//   C-1 user repo HEAD/branch/dirty state are untouched after prepare-change
//   C-2 LocalRunState carries base_commit / base_branch / cleanup_pending
//   C-3 phase-command cwd routing — main-session worktree is the integration target
//   C-4 subagent patches land in the main-session worktree, not the user repo
//   C-5 approve PR base resolution from base_branch with default-branch fallback
//   C-6 terminal cleanup gate (clean+complete vs deferred)
//   C-7 legacy run-state guard (with synthetic-run exemption)
//
// The C-1/C-2/C-7 invariants are verified directly here; C-3/C-4/C-5/C-6 are
// covered by per-bundle tests already added in this change. This file also
// locks in a grep guard against forbidden write paths.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	createFixtureRepo,
	createOpenspecStub,
	createSourceFile,
	makeTempDir,
	prependPath,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

function captureStrict(cwd: string, args: readonly string[]): string {
	const r = spawnSync("git", [...args], { cwd, encoding: "utf8" });
	if (r.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed in ${cwd}: ${r.stderr || r.stdout}`,
		);
	}
	return r.stdout.trim();
}

/**
 * `git status --porcelain` filtered for invariant comparison: drop entries for
 * the `.specflow/` admin subtree, which is expected to appear after
 * prepare-change creates the worktree (and would normally be gitignored in a
 * real project, but the fixture does not write a project-wide gitignore).
 */
function userTrackedDirtyState(cwd: string): string {
	return captureStrict(cwd, ["status", "--porcelain"])
		.split("\n")
		.filter(
			(line) => !line.includes(" .specflow/") && !line.endsWith(" .specflow"),
		)
		.join("\n");
}

function buildDefaultStub(tempRoot: string): string {
	return createOpenspecStub(
		tempRoot,
		[
			"#!/usr/bin/env node",
			"const fs = require('node:fs');",
			"const path = require('node:path');",
			"const args = process.argv.slice(2);",
			"if (args[0] === 'new' && args[1] === 'change') {",
			"  const changeId = args[2] || '';",
			"  const changeDir = path.join(process.cwd(), 'openspec', 'changes', changeId);",
			"  fs.mkdirSync(changeDir, { recursive: true });",
			"  fs.writeFileSync(path.join(changeDir, '.openspec.yaml'), 'schema: spec-driven\\n', 'utf8');",
			"  process.exit(0);",
			"}",
			"if (args[0] === 'instructions' && args[1] === 'proposal') {",
			"  process.stdout.write(JSON.stringify({ outputPath: 'proposal.md', template: '# Proposal', instruction: 'Seed' }));",
			"  process.exit(0);",
			"}",
			"process.exit(0);",
			"",
		].join("\n"),
	);
}

// --- C-1: user repo HEAD/branch/dirty state unchanged ---

test("worktree invariant C-1: prepare-change leaves user-repo HEAD, branch, and dirty state untouched", () => {
	const tempRoot = makeTempDir("inv-c1-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		// Set up dirty state in the user repo: stage a change AND leave an
		// untracked file alongside.
		writeFileSync(join(repoPath, "untracked.txt"), "untracked!\n", "utf8");
		writeFileSync(join(repoPath, "app.txt"), "modified\n", "utf8");
		spawnSync("git", ["add", "app.txt"], { cwd: repoPath, stdio: "ignore" });

		const headBefore = captureStrict(repoPath, ["rev-parse", "HEAD"]);
		const branchBefore = captureStrict(repoPath, ["branch", "--show-current"]);
		const dirtyBefore = userTrackedDirtyState(repoPath);

		const stubDir = buildDefaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["my-feature", "Add my feature"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);

		// Invariants:
		assert.equal(captureStrict(repoPath, ["rev-parse", "HEAD"]), headBefore);
		assert.equal(
			captureStrict(repoPath, ["branch", "--show-current"]),
			branchBefore,
		);
		assert.equal(userTrackedDirtyState(repoPath), dirtyBefore);
		// The change branch lives ONLY inside the worktree.
		assert.ok(
			existsSync(join(repoPath, ".specflow/worktrees/my-feature/main")),
			"main-session worktree should exist",
		);
		const wtBranch = captureStrict(
			join(repoPath, ".specflow/worktrees/my-feature/main"),
			["branch", "--show-current"],
		);
		assert.equal(wtBranch, "my-feature");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- C-2: run-state carries the new fields ---

test("worktree invariant C-2: persisted run.json carries base_commit, base_branch, cleanup_pending", () => {
	const tempRoot = makeTempDir("inv-c2-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = buildDefaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["foo-feature", "Foo"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const stateRaw = readFileSync(
			join(repoPath, ".specflow/runs/foo-feature-1/run.json"),
			"utf8",
		);
		const state = JSON.parse(stateRaw) as Record<string, unknown>;
		assert.ok(typeof state.base_commit === "string");
		assert.ok(state.base_commit !== "", "base_commit should be populated");
		assert.equal(state.base_branch, "main");
		assert.equal(state.cleanup_pending, false);
		assert.notEqual(state.repo_path, state.worktree_path);
		const expectedWtPath = join(
			realpathSync(repoPath),
			".specflow/worktrees/foo-feature/main",
		);
		assert.equal(state.worktree_path, expectedWtPath);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- C-7: legacy guard with synthetic exemption ---

test("worktree invariant C-7: prepare-change refuses legacy non-synthetic run-state and never mutates the user repo", () => {
	const tempRoot = makeTempDir("inv-c7-");
	try {
		const changeId = "legacy-c7";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		const runDir = join(repoPath, ".specflow/runs", `${changeId}-1`);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(
			join(runDir, "run.json"),
			JSON.stringify(
				{
					run_id: `${changeId}-1`,
					change_name: changeId,
					current_phase: "spec_ready",
					status: "active",
					allowed_events: [],
					source: null,
					project_id: "fixture",
					repo_name: "fixture",
					repo_path: repoPath,
					branch_name: changeId,
					worktree_path: repoPath,
					agents: { main: "claude", review: "codex" },
					last_summary_path: null,
					created_at: "2026-04-25T00:00:00Z",
					updated_at: "2026-04-25T00:00:00Z",
					history: [],
					previous_run_id: null,
					run_kind: "change",
				},
				null,
				2,
			),
			"utf8",
		);
		const headBefore = captureStrict(repoPath, ["rev-parse", "HEAD"]);
		const branchBefore = captureStrict(repoPath, ["branch", "--show-current"]);
		const stubDir = buildDefaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "resume"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /legacy in-flight run/);
		// Non-mutating.
		assert.equal(captureStrict(repoPath, ["rev-parse", "HEAD"]), headBefore);
		assert.equal(
			captureStrict(repoPath, ["branch", "--show-current"]),
			branchBefore,
		);
		// And no worktree was created.
		assert.equal(
			existsSync(join(repoPath, ".specflow/worktrees", changeId)),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Locking grep guard: no `git checkout -b` or `git checkout` against the user repo from prepare-change. ---

test("regression guard: specflow-prepare-change does not contain `git checkout` invocations against the user repo", () => {
	const file = readFileSync("src/bin/specflow-prepare-change.ts", "utf8");
	// The legacy ensureBranch helper must be gone.
	assert.ok(
		!/function\s+ensureBranch\b/.test(file),
		"ensureBranch was removed in favor of ensureMainSessionWorktree",
	);
	// No literal `git checkout -b` argument arrays should remain.
	assert.ok(
		!/"checkout",\s*"-b"/.test(file),
		"`git checkout -b` is forbidden in prepare-change under worktree mode",
	);
	assert.ok(
		!/git\s+checkout\s+-b/.test(file),
		"`git checkout -b` is forbidden in prepare-change under worktree mode",
	);
});

test("regression guard: ensureMainSessionWorktree is the sole worktree creation entry in prepare-change", () => {
	const file = readFileSync("src/bin/specflow-prepare-change.ts", "utf8");
	assert.ok(
		/function\s+ensureMainSessionWorktree\b/.test(file),
		"ensureMainSessionWorktree must exist in prepare-change",
	);
	assert.ok(
		/git\s+worktree\s+add/.test(file) || /"worktree",\s*"add"/.test(file),
		"prepare-change must use `git worktree add` to create the main-session worktree",
	);
});

// --- Locking grep guard: no `git worktree prune` calls in any specflow source. ---

test("regression guard: specflow does not invoke `git worktree prune` automatically", () => {
	for (const file of [
		"src/bin/specflow-prepare-change.ts",
		"src/lib/apply-worktree/worktree.ts",
		"src/lib/terminal-worktree-cleanup.ts",
	]) {
		const content = readFileSync(file, "utf8");
		assert.ok(
			!/"worktree",\s*"prune"/.test(content),
			`${file} must not invoke 'git worktree prune' automatically (per design D5).`,
		);
		assert.ok(
			!/git\s+worktree\s+prune/.test(content),
			`${file} must not invoke 'git worktree prune' automatically (per design D5).`,
		);
	}
});
