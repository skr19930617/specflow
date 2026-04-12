import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
	writeExecutable,
} from "./test-helpers.js";

function createOpenspecAndFetchStubs(tempRoot: string): string {
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
	writeExecutable(
		join(stubDir, "specflow-fetch-issue"),
		[
			"#!/usr/bin/env node",
			'process.stdout.write(JSON.stringify({number:71,title:"Stub issue title",body:"test body",url:process.argv[2]}));',
			"",
		].join("\n"),
	);
	return stubDir;
}

// --- Task 4.1: Issue URL positional argument ---

test("specflow-prepare-change with issue URL positional derives change-id from fetched title", () => {
	const tempRoot = makeTempDir("prepare-raw-url-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["https://github.com/test/repo/issues/71"],
			repoPath,
			prependPath(
				{ SPECFLOW_FETCH_ISSUE: join(stubDir, "specflow-fetch-issue") },
				stubDir,
			),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
			source: {
				kind: string;
				provider: string;
				reference: string;
				title: string;
			};
		};
		assert.equal(state.change_name, "stub-issue-title");
		assert.equal(state.current_phase, "proposal_draft");
		assert.equal(state.source.kind, "url");
		assert.equal(state.source.provider, "github");
		assert.equal(state.source.title, "Stub issue title");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change with explicit change-id and issue URL", () => {
	const tempRoot = makeTempDir("prepare-raw-url-explicit-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["my-change", "https://github.com/test/repo/issues/71"],
			repoPath,
			prependPath(
				{ SPECFLOW_FETCH_ISSUE: join(stubDir, "specflow-fetch-issue") },
				stubDir,
			),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			source: { kind: string; provider: string };
		};
		assert.equal(state.change_name, "my-change");
		assert.equal(state.source.kind, "url");
		assert.equal(state.source.provider, "github");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.2: Inline text positional argument ---

test("specflow-prepare-change with inline text positional derives change-id from text", () => {
	const tempRoot = makeTempDir("prepare-raw-inline-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["add-user-authentication"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
			source: { kind: string; provider: string; reference: string };
		};
		assert.equal(state.change_name, "add-user-authentication");
		assert.equal(state.current_phase, "proposal_draft");
		assert.equal(state.source.kind, "inline");
		assert.equal(state.source.provider, "generic");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.3: Deprecated --source-file with warning ---

test("specflow-prepare-change --source-file emits deprecation warning", () => {
	const tempRoot = makeTempDir("prepare-deprecated-");
	try {
		const changeId = "deprecated-test";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		unlinkSync(join(repoPath, "openspec/changes", changeId, "proposal.md"));
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, ".openspec.yaml"),
			"schema: spec-driven\n",
			"utf8",
		);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "inline",
			provider: "generic",
			reference: "deprecated test input",
			title: null,
			body: "deprecated test body",
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		assert.ok(
			result.stderr.includes("--source-file is deprecated"),
			"should emit deprecation warning",
		);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
		};
		assert.equal(state.change_name, changeId);
		assert.equal(state.current_phase, "proposal_draft");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.4: Rejected invocation shapes ---

test("specflow-prepare-change with no arguments exits with error", () => {
	const tempRoot = makeTempDir("prepare-no-args-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const result = runNodeCli("specflow-prepare-change", [], repoPath);
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes("Missing required input"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change with too many args exits with error", () => {
	const tempRoot = makeTempDir("prepare-too-many-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const result = runNodeCli(
			"specflow-prepare-change",
			["a", "b", "c"],
			repoPath,
		);
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes("Too many arguments"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change with --source-file and issue URL positional exits with conflicting error", () => {
	const tempRoot = makeTempDir("prepare-conflict-url-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "inline",
			provider: "generic",
			reference: "test",
			title: null,
			body: "test",
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			["https://github.com/test/repo/issues/1", "--source-file", sourceFile],
			repoPath,
		);
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes("Conflicting inputs"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change with --source-file and 2 positional args exits with conflicting error", () => {
	const tempRoot = makeTempDir("prepare-conflict-2args-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "inline",
			provider: "generic",
			reference: "test",
			title: null,
			body: "test",
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			["my-change", "some-text", "--source-file", sourceFile],
			repoPath,
		);
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes("Conflicting inputs"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-prepare-change with issue URL fetch failure reports wrapped error", () => {
	const tempRoot = makeTempDir("prepare-fetch-fail-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		// Override the fetch stub with one that fails
		writeExecutable(
			join(stubDir, "specflow-fetch-issue"),
			[
				"#!/usr/bin/env node",
				"process.stderr.write('404 not found');",
				"process.exit(1);",
				"",
			].join("\n"),
		);
		const result = runNodeCli(
			"specflow-prepare-change",
			["my-change", "https://github.com/test/repo/issues/999"],
			repoPath,
			prependPath(
				{ SPECFLOW_FETCH_ISSUE: join(stubDir, "specflow-fetch-issue") },
				stubDir,
			),
		);
		assert.notEqual(result.status, 0);
		assert.ok(
			result.stderr.includes("Issue fetch failed:"),
			"should include fetch failure prefix",
		);
		assert.ok(
			result.stderr.includes("Verify the URL and try again"),
			"should include recovery hint",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.4a: Allowed deprecated-path shapes ---

test("specflow-prepare-change with --source-file alone derives change-id", () => {
	const tempRoot = makeTempDir("prepare-deprecated-derive-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/55",
			title: "My derived change",
			body: "Change body",
		});
		const result = runNodeCli(
			"specflow-prepare-change",
			["--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		assert.ok(result.stderr.includes("--source-file is deprecated"));
		const state = JSON.parse(result.stdout) as {
			change_name: string;
		};
		assert.equal(state.change_name, "my-derived-change");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.4b: Scaffold-only change reuse ---

test("specflow-prepare-change reuses scaffold-only change without calling openspec new", () => {
	const tempRoot = makeTempDir("prepare-scaffold-reuse-");
	try {
		const changeId = "existing-scaffold";
		const { repoPath } = createFixtureRepo(tempRoot, changeId);
		unlinkSync(join(repoPath, "openspec/changes", changeId, "proposal.md"));
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, ".openspec.yaml"),
			"schema: spec-driven\n",
			"utf8",
		);
		// Use an openspec stub that fails on 'new change' to prove it's not called
		const stubDir = createOpenspecStub(
			tempRoot,
			[
				"#!/usr/bin/env node",
				"const args = process.argv.slice(2);",
				"if (args[0] === 'new' && args[1] === 'change') {",
				"  process.stderr.write('ERROR: openspec new change should not be called');",
				"  process.exit(1);",
				"}",
				"if (args[0] === 'instructions' && args[1] === 'proposal') {",
				"  process.stdout.write(JSON.stringify({ outputPath: 'proposal.md', template: '# Proposal', instruction: 'Seed' }));",
				"  process.exit(0);",
				"}",
				"process.exit(1);",
				"",
			].join("\n"),
		);
		const result = runNodeCli(
			"specflow-prepare-change",
			[changeId, "add-feature-x"],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(result.status, 0, result.stderr);
		const state = JSON.parse(result.stdout) as {
			change_name: string;
			current_phase: string;
		};
		assert.equal(state.change_name, changeId);
		assert.equal(state.current_phase, "proposal_draft");
		assert.ok(
			existsSync(join(repoPath, "openspec/changes", changeId, "proposal.md")),
			"proposal.md should be seeded",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.5: Transition test (issue URL equivalence) ---

test("--source-file and positional issue URL produce equivalent source metadata", () => {
	const tempRoot = makeTempDir("prepare-equiv-url-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const issueUrl = "https://github.com/test/repo/issues/71";

		// Deprecated path: --source-file
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: issueUrl,
			title: "Stub issue title",
			body: "test body",
		});
		const deprecatedResult = runNodeCli(
			"specflow-prepare-change",
			["equiv-url-deprecated", "--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(deprecatedResult.status, 0, deprecatedResult.stderr);
		const deprecatedState = JSON.parse(deprecatedResult.stdout) as {
			source: {
				kind: string;
				provider: string;
				reference: string;
				title: string;
			};
		};

		// New path: positional
		const newResult = runNodeCli(
			"specflow-prepare-change",
			["equiv-url-new", issueUrl],
			repoPath,
			prependPath(
				{ SPECFLOW_FETCH_ISSUE: join(stubDir, "specflow-fetch-issue") },
				stubDir,
			),
		);
		assert.equal(newResult.status, 0, newResult.stderr);
		const newState = JSON.parse(newResult.stdout) as {
			source: {
				kind: string;
				provider: string;
				reference: string;
				title: string;
			};
		};

		// Compare: both paths should produce equivalent source metadata
		assert.equal(newState.source.kind, deprecatedState.source.kind);
		assert.equal(newState.source.provider, deprecatedState.source.provider);
		assert.equal(newState.source.title, deprecatedState.source.title);
		assert.equal(newState.source.reference, deprecatedState.source.reference);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Task 4.6: Transition test (inline text equivalence) ---

test("--source-file and positional inline text produce equivalent source metadata", () => {
	const tempRoot = makeTempDir("prepare-equiv-inline-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const stubDir = createOpenspecAndFetchStubs(tempRoot);
		const inlineText = "add-user-auth-feature";

		// Deprecated path: --source-file
		const sourceFile = createSourceFile(tempRoot, {
			kind: "inline",
			provider: "generic",
			reference: inlineText,
			title: null,
			body: inlineText,
		});
		const deprecatedResult = runNodeCli(
			"specflow-prepare-change",
			["equiv-inline-deprecated", "--source-file", sourceFile],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(deprecatedResult.status, 0, deprecatedResult.stderr);
		const deprecatedState = JSON.parse(deprecatedResult.stdout) as {
			source: { kind: string; provider: string; reference: string };
		};

		// New path: positional inline
		const newResult = runNodeCli(
			"specflow-prepare-change",
			["equiv-inline-new", inlineText],
			repoPath,
			prependPath({}, stubDir),
		);
		assert.equal(newResult.status, 0, newResult.stderr);
		const newState = JSON.parse(newResult.stdout) as {
			source: { kind: string; provider: string; reference: string };
		};

		// Compare: both paths should produce equivalent source metadata
		assert.equal(newState.source.kind, deprecatedState.source.kind);
		assert.equal(newState.source.provider, deprecatedState.source.provider);
		assert.equal(newState.source.reference, deprecatedState.source.reference);
	} finally {
		removeTempDir(tempRoot);
	}
});
