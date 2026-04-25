// Conflict-path coverage for ensureMainSessionWorktree in
// specflow-prepare-change. Complements the happy-path tests by exercising the
// fail-fast branches that the design's D5 nails down: branch already exists,
// worktree at non-conventional path, non-worktree directory occupies the
// conventional path, and reuse of an existing conventional worktree.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	createFixtureRepo,
	createOpenspecStub,
	makeTempDir,
	prependPath,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

function defaultStub(tempRoot: string): string {
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

test("conflict: prepare-change fails fast when branch <CHANGE_ID> exists without a registered worktree", () => {
	const tempRoot = makeTempDir("conflict-branch-only-");
	try {
		const changeId = "branch-only";
		const { repoPath } = createFixtureRepo(tempRoot);
		// Pre-create the same-named branch in the user repo without a worktree.
		spawnSync("git", ["branch", changeId], {
			cwd: repoPath,
			stdio: "ignore",
		});
		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "trigger"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, new RegExp(`branch '${changeId}' exists`));
		// Did NOT create the worktree.
		assert.equal(
			existsSync(join(repoPath, ".specflow/worktrees", changeId)),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("conflict: prepare-change fails fast when a worktree owns <CHANGE_ID> at a non-conventional path", () => {
	const tempRoot = makeTempDir("conflict-nonconventional-wt-");
	try {
		const changeId = "elsewhere";
		const { repoPath } = createFixtureRepo(tempRoot);
		// Create a worktree at an unconventional path.
		const otherWt = join(repoPath, "_other-wt");
		const wtResult = spawnSync(
			"git",
			["worktree", "add", "-b", changeId, otherWt, "HEAD"],
			{ cwd: repoPath, stdio: "ignore" },
		);
		assert.equal(wtResult.status, 0);

		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "trigger"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /already checked out as a worktree/);
		// Did NOT create the conventional worktree.
		assert.equal(
			existsSync(join(repoPath, ".specflow/worktrees", changeId)),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("conflict: prepare-change fails fast when the conventional path is occupied by a non-worktree directory", () => {
	const tempRoot = makeTempDir("conflict-nonworktree-dir-");
	try {
		const changeId = "occupied";
		const { repoPath } = createFixtureRepo(tempRoot);
		const conventional = join(
			repoPath,
			".specflow/worktrees",
			changeId,
			"main",
		);
		mkdirSync(conventional, { recursive: true });
		writeFileSync(join(conventional, "stale.txt"), "stale\n", "utf8");

		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "trigger"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /not a registered git worktree/);
		// Pre-existing directory must not be deleted.
		assert.ok(existsSync(join(conventional, "stale.txt")));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("reuse: prepare-change reuses an existing conventional main-session worktree without recreating it", () => {
	const tempRoot = makeTempDir("reuse-existing-wt-");
	try {
		const changeId = "reuse-me";
		const { repoPath } = createFixtureRepo(tempRoot);
		// Pre-create the conventional worktree and seed a marker file.
		const conventional = join(
			repoPath,
			".specflow/worktrees",
			changeId,
			"main",
		);
		mkdirSync(join(repoPath, ".specflow/worktrees", changeId), {
			recursive: true,
		});
		const wtResult = spawnSync(
			"git",
			["worktree", "add", "-b", changeId, conventional, "HEAD"],
			{ cwd: repoPath, stdio: "ignore" },
		);
		assert.equal(wtResult.status, 0);
		const markerPath = join(conventional, "marker.txt");
		writeFileSync(markerPath, "preserved\n", "utf8");

		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "reuse-trigger"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		// Marker file must be preserved (no recreation).
		assert.ok(existsSync(markerPath));
		// Branch is still <CHANGE_ID>.
		const wtBranch = spawnSync("git", ["branch", "--show-current"], {
			cwd: conventional,
			encoding: "utf8",
		}).stdout.trim();
		assert.equal(wtBranch, changeId);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("PR-base inputs: run.json records base_commit equal to user-repo HEAD and base_branch equal to current branch", () => {
	const tempRoot = makeTempDir("prbase-inputs-");
	try {
		const changeId = "prbase-feature";
		const { repoPath } = createFixtureRepo(tempRoot);
		const userHead = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: repoPath,
			encoding: "utf8",
		}).stdout.trim();

		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "go"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const stateRaw = JSON.parse(result.stdout) as Record<string, unknown>;
		assert.equal(
			stateRaw.base_commit,
			userHead,
			"base_commit must equal user-repo HEAD at prepare-change time",
		);
		assert.equal(stateRaw.base_branch, "main");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("cleanup_pending: persisted run.json initializes cleanup_pending to false", () => {
	const tempRoot = makeTempDir("cleanup-pending-init-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = defaultStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["cleanup-init", "go"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as Record<string, unknown>;
		assert.equal(state.cleanup_pending, false);
	} finally {
		removeTempDir(tempRoot);
	}
});
