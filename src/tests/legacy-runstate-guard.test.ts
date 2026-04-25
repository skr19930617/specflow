// Tests for the legacy-runstate guard in specflow-prepare-change.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

function writeRunStateRecord(
	repoPath: string,
	runId: string,
	state: Record<string, unknown>,
): void {
	const dir = join(repoPath, ".specflow/runs", runId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "run.json"), JSON.stringify(state, null, 2), "utf8");
}

function legacyState(repoPath: string, changeId: string, runKind = "change") {
	return {
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
		// Legacy: worktree_path equals repo_path.
		worktree_path: repoPath,
		base_commit: "",
		base_branch: null,
		cleanup_pending: false,
		agents: { main: "claude", review: "codex" },
		last_summary_path: null,
		created_at: "2026-04-25T00:00:00Z",
		updated_at: "2026-04-25T00:00:00Z",
		history: [],
		previous_run_id: null,
		run_kind: runKind,
	};
}

function minimalOpenspecStub(tempRoot: string): string {
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

test("legacy-runstate guard refuses prepare-change resume when worktree_path == repo_path for a non-synthetic run", () => {
	const tempRoot = makeTempDir("legacy-guard-block-");
	try {
		const changeId = "legacy-resume";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		writeRunStateRecord(
			repoPath,
			`${changeId}-1`,
			legacyState(repoPath, changeId),
		);
		const stubDir = minimalOpenspecStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "resume"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /legacy in-flight run/);
		// Guard MUST be non-mutating.
		const branchAfter = spawnSync("git", ["branch", "--show-current"], {
			cwd: repoPath,
			encoding: "utf8",
		}).stdout.trim();
		assert.equal(branchAfter, "main");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("legacy-runstate guard exempts synthetic runs even when worktree_path == repo_path", () => {
	const tempRoot = makeTempDir("legacy-guard-synthetic-");
	try {
		const changeId = "legacy-synthetic";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		// Synthetic run should NOT trigger the guard.
		writeRunStateRecord(
			repoPath,
			`${changeId}-1`,
			legacyState(repoPath, changeId, "synthetic"),
		);
		const stubDir = minimalOpenspecStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "resume"],
			repoPath,
			prependPath({}, stubDir),
		);
		// Guard must NOT block synthetic runs. The CLI may still exit non-zero
		// for unrelated reasons (e.g., missing scaffold), but the error must NOT
		// mention the legacy guard.
		if (result.status !== 0) {
			assert.doesNotMatch(result.stderr, /legacy in-flight run/);
		}
	} finally {
		removeTempDir(tempRoot);
	}
});

test("legacy-runstate guard does not fire when run-state has distinct repo_path/worktree_path", () => {
	const tempRoot = makeTempDir("legacy-guard-new-layout-");
	try {
		const changeId = "new-layout";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		const wtPath = join(repoPath, ".specflow/worktrees", changeId, "main");
		writeRunStateRecord(repoPath, `${changeId}-1`, {
			...legacyState(repoPath, changeId),
			worktree_path: wtPath,
		});
		const stubDir = minimalOpenspecStub(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "resume"],
			repoPath,
			prependPath({}, stubDir),
		);
		// CLI may succeed or fail for other reasons, but it must NOT cite the
		// legacy guard.
		if (result.status !== 0) {
			assert.doesNotMatch(result.stderr, /legacy in-flight run/);
		}
	} finally {
		removeTempDir(tempRoot);
	}
});
