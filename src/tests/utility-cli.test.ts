import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
	addImplementationDiff,
	createFixtureRepo,
	createGhStub,
	createInstalledHome,
	createOpenspecStub,
	makeTempDir,
	prependPath,
	removeTempDir,
	repoRoot,
	runNodeCli,
} from "./test-helpers.js";

test("specflow-fetch-issue returns the expected issue payload", () => {
	const tempRoot = makeTempDir("fetch-issue-");
	try {
		const stubDir = createGhStub(
			tempRoot,
			'{"number":71,"title":"Stub issue","body":"test","url":"https://github.com/test/repo/issues/71","labels":[],"assignees":[],"author":{"login":"bot"},"state":"OPEN"}\n',
		);
		const env = prependPath({ HOME: createInstalledHome(tempRoot) }, stubDir);
		const args = ["https://github.com/test/repo/issues/71"];
		const result = runNodeCli("specflow-fetch-issue", args, repoRoot, env);
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), {
			number: 71,
			title: "Stub issue",
			body: "test",
			url: "https://github.com/test/repo/issues/71",
			labels: [],
			assignees: [],
			author: { login: "bot" },
			state: "OPEN",
		});
		assert.equal(result.stderr, "");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-fetch-issue fails on invalid metadata contract", () => {
	const tempRoot = makeTempDir("fetch-issue-invalid-");
	try {
		const stubDir = createGhStub(
			tempRoot,
			'{"number":71,"url":"https://github.com/test/repo/issues/71"}\n',
		);
		const env = prependPath({ HOME: createInstalledHome(tempRoot) }, stubDir);
		const result = runNodeCli(
			"specflow-fetch-issue",
			["https://github.com/test/repo/issues/71"],
			repoRoot,
			env,
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /does not satisfy schema 'issue-metadata'/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-filter-diff returns the expected diff and summary", () => {
	const tempRoot = makeTempDir("filter-diff-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		writeFileSync(join(repoPath, "deleted.txt"), "gone\n", "utf8");
		writeFileSync(join(repoPath, "rename-me.txt"), "same\n", "utf8");
		writeFileSync(join(repoPath, "keep.lock"), "lock\n", "utf8");
		const add = (args: string[]) =>
			spawnSync("git", args, { cwd: repoPath, stdio: "ignore" });
		add(["add", "."]);
		add(["commit", "-m", "fixtures"]);
		add(["mv", "rename-me.txt", "renamed.txt"]);
		unlinkSync(join(repoPath, "deleted.txt"));
		addImplementationDiff(repoPath);
		writeFileSync(join(repoPath, "review-ledger.json"), "{}\n", "utf8");
		const env = { DIFF_EXCLUDE_PATTERNS: "*.lock" };
		const args = ["--", "."];
		const result = runNodeCli("specflow-filter-diff", args, repoPath, env);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(
			result.stdout,
			[
				"diff --git a/app.txt b/app.txt",
				"index 90be1f3..9d35b45 100644",
				"--- a/app.txt",
				"+++ b/app.txt",
				"@@ -1 +1,2 @@",
				"-before",
				"+after",
				"+more",
				"",
			].join("\n"),
		);
		assert.deepEqual(JSON.parse(result.stderr.trim()), {
			excluded: [{ file: "deleted.txt", reason: "deleted_file" }],
			warnings: [],
			included_count: 1,
			excluded_count: 1,
			total_lines: 8,
		});
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-design-artifacts wraps openspec next and validate", () => {
	const tempRoot = makeTempDir("design-artifacts-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecStub(
			tempRoot,
			[
				"#!/usr/bin/env node",
				"const args = process.argv.slice(2);",
				"if (args[0] === 'status') {",
				"  process.stdout.write(JSON.stringify({ isComplete: false, artifacts: [{ id: 'design', status: 'ready' }] }));",
				"  process.exit(0);",
				"}",
				"if (args[0] === 'instructions') {",
				"  process.stdout.write(JSON.stringify({ artifactId: 'design', outputPath: 'openspec/changes/test/design.md', template: '# T', instruction: 'Do it', dependencies: [] }));",
				"  process.exit(0);",
				"}",
				"if (args[0] === 'validate') {",
				"  process.stdout.write(JSON.stringify({ items: [{ valid: true }] }));",
				"  process.exit(0);",
				"}",
				"process.exit(1);",
				"",
			].join("\n"),
		);
		const env = prependPath({}, stubDir);
		const nextResult = runNodeCli(
			"specflow-design-artifacts",
			["next", changeId],
			repoPath,
			env,
		);
		assert.equal(nextResult.status, 0, nextResult.stderr);
		assert.equal(JSON.parse(nextResult.stdout).status, "ready");

		const validateResult = runNodeCli(
			"specflow-design-artifacts",
			["validate", changeId],
			repoPath,
			env,
		);
		assert.equal(validateResult.status, 0, validateResult.stderr);
		assert.equal(JSON.parse(validateResult.stdout).status, "valid");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-analyze returns structured project metadata", () => {
	const result = runNodeCli("specflow-analyze", [repoRoot], repoRoot);
	assert.equal(result.status, 0, result.stderr);
	const json = JSON.parse(result.stdout) as {
		project_name: string;
		languages: string[];
		package_manager: string | null;
	};
	assert.equal(json.project_name, basename(repoRoot));
	assert.ok(json.languages.includes("TypeScript"));
	assert.equal(json.package_manager, "npm");
});

test("specflow-init --update refreshes installed commands from manifest", () => {
	const tempRoot = makeTempDir("specflow-init-update-");
	try {
		const home = createInstalledHome(tempRoot);
		const repoPath = join(tempRoot, "repo");
		mkdirSync(repoPath, { recursive: true });
		spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
		writeFileSync(join(repoPath, "CLAUDE.md"), "custom\n", "utf8");
		const result = runNodeCli(
			"specflow-init",
			["--update"],
			repoPath,
			{ HOME: home },
			"n\n",
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			mode: string;
			location: string;
			installed_commands: string[];
		};
		assert.equal(json.mode, "update");
		assert.equal(realpathSync(json.location), realpathSync(repoPath));
		assert.ok(json.installed_commands.includes("specflow"));
		assert.ok(existsSync(join(repoPath, ".mcp.json")));
		assert.ok(existsSync(join(home, ".claude/commands/specflow.md")));
	} finally {
		removeTempDir(tempRoot);
	}
});
