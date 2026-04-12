import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";
import {
	addImplementationDiff,
	createFixtureRepo,
	createGhStub,
	createInstalledHome,
	createOpenspecStub,
	createSourceFile,
	makeTempDir,
	prependPath,
	removeTempDir,
	repoRoot,
	runNodeCli,
} from "./test-helpers.js";

function createUpdateRepo(tempRoot: string): {
	home: string;
	repoPath: string;
} {
	const home = createInstalledHome(tempRoot);
	const repoPath = join(tempRoot, "repo");
	mkdirSync(repoPath, { recursive: true });
	spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
	return { home, repoPath };
}

function createProfileJson(
	overrides: Partial<{
		schemaVersion: string;
		languages: string[];
		toolchain: string;
		commands: {
			build: string | null;
			test: string | null;
			lint: string | null;
			format: string | null;
		};
		directories: {
			source: string[] | null;
			test: string[] | null;
			generated: string[] | null;
		};
		forbiddenEditZones: string[] | null;
		contractSensitiveModules: string[] | null;
		codingConventions: string[] | null;
		verificationExpectations: string[] | null;
	}> = {},
): string {
	return `${JSON.stringify(
		{
			schemaVersion: "1",
			languages: ["typescript"],
			toolchain: "npm",
			commands: {
				build: "npm run build",
				test: "npm test",
				lint: "npm run lint",
				format: "npm run format",
			},
			directories: {
				source: ["src/"],
				test: ["tests/"],
				generated: ["dist/"],
			},
			forbiddenEditZones: null,
			contractSensitiveModules: ["src/contracts/**"],
			codingConventions: ["Keep contracts explicit."],
			verificationExpectations: ["npm test"],
			...overrides,
		},
		null,
		2,
	)}\n`;
}

function writeProfileFile(repoPath: string, rawProfile: string): void {
	mkdirSync(join(repoPath, ".specflow"), { recursive: true });
	writeFileSync(join(repoPath, ".specflow/profile.json"), rawProfile, "utf8");
}

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

test("specflow-filter-diff preserves include pathspec filtering", () => {
	const tempRoot = makeTempDir("filter-diff-pathspec-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		mkdirSync(join(repoPath, "sub"), { recursive: true });
		writeFileSync(join(repoPath, "sub", "inside.txt"), "before\n", "utf8");
		writeFileSync(join(repoPath, "outside.txt"), "before\n", "utf8");
		const runGit = (args: string[]) =>
			spawnSync("git", args, { cwd: repoPath, stdio: "ignore" });
		runGit(["add", "."]);
		runGit(["commit", "-m", "add nested files"]);
		writeFileSync(join(repoPath, "sub", "inside.txt"), "after\n", "utf8");
		writeFileSync(join(repoPath, "outside.txt"), "after\n", "utf8");

		const result = runNodeCli(
			"specflow-filter-diff",
			["--", "sub"],
			repoPath,
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /diff --git a\/sub\/inside\.txt b\/sub\/inside\.txt/);
		assert.doesNotMatch(result.stdout, /outside\.txt/);
		assert.deepEqual(JSON.parse(result.stderr.trim()), {
			excluded: [],
			warnings: [],
			included_count: 1,
			excluded_count: 0,
			total_lines: 7,
		});
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-filter-diff preserves invalid exclude warnings on empty diff", () => {
	const tempRoot = makeTempDir("filter-diff-empty-warning-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const result = runNodeCli("specflow-filter-diff", [], repoPath, {
			DIFF_EXCLUDE_PATTERNS: "[",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.deepEqual(JSON.parse(result.stderr.trim()), {
			excluded: [],
			warnings: ["invalid pattern '[' — skipping"],
			included_count: 0,
			excluded_count: 0,
			total_lines: 0,
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

test("specflow-prepare-change seeds proposal.md for scaffold-only changes and enters proposal_draft", () => {
	const tempRoot = makeTempDir("prepare-change-existing-");
	try {
		const changeId = "scaffold-only-change";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		unlinkSync(join(repoPath, "openspec/changes", changeId, "proposal.md"));
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, ".openspec.yaml"),
			"schema: spec-driven\ncreated: 2026-04-10\n",
			"utf8",
		);
		const stubDir = createOpenspecStub(
			tempRoot,
			[
				"#!/usr/bin/env node",
				"const args = process.argv.slice(2);",
				"if (args[0] === 'instructions' && args[1] === 'proposal') {",
				"  process.stdout.write(JSON.stringify({ outputPath: 'proposal.md', template: '# Proposal', instruction: 'Seed proposal' }));",
				"  process.exit(0);",
				"}",
				"process.stderr.write('unexpected openspec args: ' + args.join(' '));",
				"process.exit(1);",
				"",
			].join("\n"),
		);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "inline",
			provider: "generic",
			reference: "Add enterprise SSO support",
			title: null,
			body: [
				"Add enterprise SSO support.",
				"Require SAML configuration.",
				"Capture failed login attempts in audit logs.",
			].join("\n"),
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
			branch_name: string;
			source: { provider: string; reference: string };
		};
		assert.equal(state.change_name, changeId);
		assert.equal(state.current_phase, "proposal_draft");
		assert.equal(state.branch_name, changeId);
		assert.equal(state.source.provider, "generic");
		assert.equal(state.source.reference, "Add enterprise SSO support");
		const proposal = readFileSync(
			join(repoPath, "openspec/changes", changeId, "proposal.md"),
			"utf8",
		);
		assert.ok(proposal.includes("# Proposal"));
		assert.ok(proposal.includes("Source provider: generic"));
		assert.ok(proposal.includes("Require SAML configuration."));
		assert.ok(
			proposal.includes("Capture failed login attempts in audit logs."),
		);
		assert.ok(proposal.includes("Seed proposal"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change derives change ids from GitHub sources and scaffolds missing changes", () => {
	const tempRoot = makeTempDir("prepare-change-derived-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecStub(
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
				"  process.stdout.write(JSON.stringify({ outputPath: 'proposal.md', template: '# Proposal', instruction: 'Seed proposal' }));",
				"  process.exit(0);",
				"}",
				"process.stderr.write('unexpected openspec args: ' + args.join(' '));",
				"process.exit(1);",
				"",
			].join("\n"),
		);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/89",
			title: "Repo responsibility nongoals",
			body: "Clarify what the repository owns and what it explicitly does not own.",
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			["--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
			branch_name: string;
			source: { provider: string; reference: string; title: string };
		};
		assert.equal(state.change_name, "repo-responsibility-nongoals");
		assert.equal(state.current_phase, "proposal_draft");
		assert.equal(state.branch_name, "repo-responsibility-nongoals");
		assert.equal(state.source.provider, "github");
		assert.equal(
			state.source.reference,
			"https://github.com/test/repo/issues/89",
		);
		assert.equal(state.source.title, "Repo responsibility nongoals");
		assert.ok(
			existsSync(
				join(
					repoPath,
					"openspec/changes/repo-responsibility-nongoals/.openspec.yaml",
				),
			),
		);
		const proposal = readFileSync(
			join(
				repoPath,
				"openspec/changes/repo-responsibility-nongoals/proposal.md",
			),
			"utf8",
		);
		assert.ok(proposal.includes("# Proposal"));
		assert.ok(proposal.includes("Source provider: github"));
		assert.ok(proposal.includes("Repo responsibility nongoals"));
		assert.ok(proposal.includes("https://github.com/test/repo/issues/89"));
		assert.ok(proposal.includes("Seed proposal"));
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

test("specflow-init --update refreshes installed commands and skips profile rendering when no profile exists", () => {
	const tempRoot = makeTempDir("specflow-init-update-");
	try {
		const { home, repoPath } = createUpdateRepo(tempRoot);
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
		assert.equal(readFileSync(join(repoPath, "CLAUDE.md"), "utf8"), "custom\n");
		assert.match(
			result.stderr,
			/No \.specflow\/profile\.json found\. Run `specflow\.setup` to generate a project profile\./,
		);
		assert.equal(
			result.stderr.includes("Rendered CLAUDE.md from profile"),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-init --update rerenders CLAUDE.md from a valid profile", () => {
	const tempRoot = makeTempDir("specflow-init-profile-render-");
	try {
		const { home, repoPath } = createUpdateRepo(tempRoot);
		writeProfileFile(repoPath, createProfileJson());
		writeFileSync(
			join(repoPath, "CLAUDE.md"),
			[
				"<!-- specflow:managed:start -->",
				"## Contract Discipline",
				"",
				"- stale rule",
				"<!-- specflow:managed:end -->",
				"",
				"## Manual Notes",
				"",
				"keep me",
				"",
			].join("\n"),
			"utf8",
		);

		const result = runNodeCli("specflow-init", ["--update"], repoPath, {
			HOME: home,
		});

		assert.equal(result.status, 0, result.stderr);
		assert.equal(
			result.stderr.includes("Overwrite CLAUDE.md with template?"),
			false,
		);
		assert.match(result.stderr, /Rendered CLAUDE\.md from profile/);
		const claude = readFileSync(join(repoPath, "CLAUDE.md"), "utf8");
		assert.ok(claude.startsWith("<!-- specflow:managed:start -->"));
		assert.ok(claude.includes("## Project Profile"));
		assert.ok(claude.includes("- **Toolchain:** npm"));
		assert.ok(claude.includes("- **Build:** `npm run build`"));
		assert.ok(claude.includes("## Contract-Sensitive Modules"));
		assert.ok(claude.includes("## Verification Expectations"));
		assert.ok(claude.includes("## Manual Notes\n\nkeep me"));
		const json = JSON.parse(result.stdout) as { updated_files: string[] };
		assert.ok(json.updated_files.includes("CLAUDE.md (profile-rendered)"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-init --update aborts when the profile is invalid", () => {
	const tempRoot = makeTempDir("specflow-init-invalid-profile-");
	try {
		const { home, repoPath } = createUpdateRepo(tempRoot);
		writeProfileFile(
			repoPath,
			`${JSON.stringify({ schemaVersion: "1", languages: ["typescript"] })}\n`,
		);
		writeFileSync(join(repoPath, "CLAUDE.md"), "custom\n", "utf8");

		const result = runNodeCli("specflow-init", ["--update"], repoPath, {
			HOME: home,
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Profile validation failed:/);
		assert.match(result.stderr, /Run 'specflow\.setup' to fix the profile\./);
		assert.equal(
			result.stderr.includes("Overwrite CLAUDE.md with template?"),
			false,
		);
		assert.equal(readFileSync(join(repoPath, "CLAUDE.md"), "utf8"), "custom\n");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-init --update asks for confirmation before migrating a legacy CLAUDE.md", () => {
	const tempRoot = makeTempDir("specflow-init-legacy-claude-");
	try {
		const { home, repoPath } = createUpdateRepo(tempRoot);
		writeProfileFile(repoPath, createProfileJson());
		writeFileSync(
			join(repoPath, "CLAUDE.md"),
			"# Legacy CLAUDE\n\nKeep this section.\n",
			"utf8",
		);

		const result = runNodeCli(
			"specflow-init",
			["--update"],
			repoPath,
			{ HOME: home },
			"y\n",
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stderr, /Apply profile-rendered CLAUDE\.md changes\?/);
		assert.match(result.stderr, /has no specflow markers/i);
		assert.equal(
			result.stderr.includes("Overwrite CLAUDE.md with template?"),
			false,
		);
		const claude = readFileSync(join(repoPath, "CLAUDE.md"), "utf8");
		assert.ok(claude.startsWith("<!-- specflow:managed:start -->"));
		assert.ok(claude.includes("## Project Profile"));
		assert.ok(claude.includes("# Legacy CLAUDE\n\nKeep this section."));
	} finally {
		removeTempDir(tempRoot);
	}
});
