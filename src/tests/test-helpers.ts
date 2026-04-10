import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
	copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = process.cwd();

export function makeTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDir(path: string): void {
	rmSync(path, { recursive: true, force: true });
}

export function createFixtureRepo(
	root: string,
	changeId = "test-change",
): { repoPath: string; changeId: string } {
	const repoPath = join(root, "repo");
	mkdirSync(repoPath, { recursive: true });
	spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.email", "specflow@example.com"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.name", "Specflow Tests"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync(
		"git",
		["remote", "add", "origin", "https://github.com/test/repo.git"],
		{ cwd: repoPath, stdio: "ignore" },
	);

	const changeDir = join(repoPath, "openspec/changes", changeId);
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "proposal.md"), "# Proposal\n", "utf8");
	writeFileSync(join(repoPath, "app.txt"), "before\n", "utf8");

	const workflowDir = join(repoPath, "global/workflow");
	mkdirSync(workflowDir, { recursive: true });
	copyFileSync(
		resolve(repoRoot, "dist/package/global/workflow/state-machine.json"),
		join(workflowDir, "state-machine.json"),
	);
	spawnSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["commit", "--allow-empty", "-m", "init"], {
		cwd: repoPath,
		stdio: "ignore",
	});

	return { repoPath, changeId };
}

export function createFetchIssueStub(root: string): string {
	const path = join(root, "fetch-issue-stub.sh");
	writeFileSync(
		path,
		[
			"#!/usr/bin/env bash",
			"set -euo pipefail",
			'echo \'{"number":71,"title":"Stub issue","body":"test","url":"https://github.com/test/repo/issues/71"}\'',
			"",
		].join("\n"),
		"utf8",
	);
	spawnSync("chmod", ["+x", path], { stdio: "ignore" });
	return path;
}

export function addImplementationDiff(repoPath: string): void {
	writeFileSync(join(repoPath, "app.txt"), "after\nmore\n", "utf8");
}

export function addDesignArtifacts(repoPath: string, changeId: string): void {
	const changeDir = join(repoPath, "openspec/changes", changeId);
	mkdirSync(join(changeDir, "specs", "core"), { recursive: true });
	writeFileSync(join(changeDir, "design.md"), "# Design\n", "utf8");
	writeFileSync(join(changeDir, "tasks.md"), "- [ ] Task\n", "utf8");
	writeFileSync(join(changeDir, "specs/core/spec.md"), "# Spec\n", "utf8");
}

export function createInstalledHome(root: string): string {
	const home = join(root, "home");
	const promptsTarget = join(home, ".config/specflow/global/prompts");
	const commandsTarget = join(home, ".config/specflow/global/commands");
	const templateTarget = join(home, ".config/specflow/template");
	const packageRoot = resolve(repoRoot, "dist/package");
	mkdirSync(promptsTarget, { recursive: true });
	mkdirSync(commandsTarget, { recursive: true });
	mkdirSync(templateTarget, { recursive: true });
	for (const file of readdirSync(resolve(packageRoot, "global/prompts"))) {
		copyFileSync(
			resolve(packageRoot, "global/prompts", file),
			join(promptsTarget, file),
		);
	}
	for (const file of readdirSync(resolve(packageRoot, "global/commands"))) {
		copyFileSync(
			resolve(packageRoot, "global/commands", file),
			join(commandsTarget, file),
		);
	}
	copyFileSync(
		resolve(packageRoot, "template/.mcp.json"),
		join(templateTarget, ".mcp.json"),
	);
	copyFileSync(
		resolve(packageRoot, "template/CLAUDE.md"),
		join(templateTarget, "CLAUDE.md"),
	);
	return home;
}

export function createBareHome(root: string): string {
	const home = join(root, "home");
	mkdirSync(home, { recursive: true });
	return home;
}

export function createStubDir(root: string): string {
	const stubDir = join(root, "stubs");
	mkdirSync(stubDir, { recursive: true });
	return stubDir;
}

export function writeExecutable(path: string, content: string): void {
	writeFileSync(path, content, "utf8");
	spawnSync("chmod", ["+x", path], { stdio: "ignore" });
}

export function createGhStub(root: string, responseJson: string): string {
	const stubDir = createStubDir(root);
	const path = join(stubDir, "gh");
	writeExecutable(
		path,
		[
			"#!/usr/bin/env node",
			"process.stdout.write(process.env.SPECFLOW_TEST_GH_RESPONSE || " +
				JSON.stringify(responseJson) +
				");",
			"",
		].join("\n"),
	);
	return stubDir;
}

export function createGhSubIssueStub(root: string): {
	stubDir: string;
	statePath: string;
} {
	const stubDir = createStubDir(root);
	const statePath = join(root, "gh-sub-issue-state.json");
	writeFileSync(
		statePath,
		JSON.stringify(
			{
				next_issue_number: 100,
				labels: [],
				issues: [],
				comments: [],
				fail_create_phases: [],
				fail_comment: false,
			},
			null,
			2,
		),
		"utf8",
	);
	writeExecutable(
		join(stubDir, "gh"),
		[
			"#!/usr/bin/env node",
			"const fs = require('node:fs');",
			"const statePath = process.env.SPECFLOW_TEST_GH_STATE;",
			"const args = process.argv.slice(2);",
			"const state = statePath && fs.existsSync(statePath)",
			"  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))",
			"  : { next_issue_number: 100, labels: [], issues: [], comments: [], fail_create_phases: [], fail_comment: false };",
			"const save = () => { if (statePath) fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); };",
			"const argValue = (name) => { const index = args.indexOf(name); return index === -1 ? '' : String(args[index + 1] || ''); };",
			"if (args[0] === 'label' && args[1] === 'create') {",
			"  const name = args[2] || '';",
			"  const repo = argValue('--repo');",
			"  const color = argValue('--color');",
			"  const description = argValue('--description');",
			"  state.labels = (state.labels || []).filter((label) => label.name !== name);",
			"  state.labels.push({ name, repo, color, description });",
			"  save();",
			"  process.exit(0);",
			"}",
			"if (args[0] === 'issue' && args[1] === 'list') {",
			"  const search = argValue('--search');",
			"  const match = (state.issues || []).find((issue) => issue.decomposition_id === search);",
			"  process.stdout.write(JSON.stringify(match ? [{ number: match.number, url: match.url, title: match.title }] : []));",
			"  save();",
			"  process.exit(0);",
			"}",
			"if (args[0] === 'issue' && args[1] === 'create') {",
			"  const repo = argValue('--repo');",
			"  const title = argValue('--title');",
			"  const body = argValue('--body');",
			"  const label = argValue('--label');",
			"  const phaseMatch = title.match(/^Phase (\\d+):/);",
			"  const phase = phaseMatch ? Number(phaseMatch[1]) : 0;",
			"  if ((state.fail_create_phases || []).includes(phase)) {",
			"    process.stderr.write(`phase $" + "{phase} failed`);",
			"    save();",
			"    process.exit(1);",
			"  }",
			"  const decompositionMatch = body.match(/\\*\\*Decomposition ID\\*\\*: (.+)/);",
			"  const decompositionId = decompositionMatch ? decompositionMatch[1].trim() : '';",
			"  const number = Number(state.next_issue_number || 100);",
			"  state.next_issue_number = number + 1;",
			"  const url = `https://github.com/$" + "{repo}/issues/$" + "{number}`;",
			"  state.issues.push({ number, url, title, body, label, repo, decomposition_id: decompositionId });",
			"  save();",
			"  process.stdout.write(`$" + "{url}\\n`);",
			"  process.exit(0);",
			"}",
			"if (args[0] === 'issue' && args[1] === 'comment') {",
			"  if (state.fail_comment) {",
			"    process.stderr.write('comment failed');",
			"    save();",
			"    process.exit(1);",
			"  }",
			"  state.comments.push({ issue_number: args[2], repo: argValue('--repo'), body: argValue('--body') });",
			"  save();",
			"  process.exit(0);",
			"}",
			"process.stderr.write(`unsupported gh args: $" + "{args.join(' ')}`);",
			"save();",
			"process.exit(1);",
			"",
		].join("\n"),
	);
	return { stubDir, statePath };
}

export function createOpenspecStub(root: string, scriptBody: string): string {
	const stubDir = createStubDir(root);
	writeExecutable(join(stubDir, "openspec"), scriptBody);
	return stubDir;
}

export function createCodexStub(root: string): string {
	const stubDir = createStubDir(root);
	const path = join(stubDir, "codex");
	writeExecutable(
		path,
		[
			"#!/usr/bin/env node",
			"const fs = require('node:fs');",
			"const args = process.argv.slice(2);",
			"const outputIndex = args.indexOf('-o');",
			"const outputPath = outputIndex === -1 ? '' : args[outputIndex + 1];",
			"const responsesPath = process.env.SPECFLOW_TEST_CODEX_RESPONSES;",
			"const statePath = process.env.SPECFLOW_TEST_CODEX_STATE;",
			"const responses = responsesPath ? JSON.parse(fs.readFileSync(responsesPath, 'utf8')) : [];",
			"let index = 0;",
			"if (statePath && fs.existsSync(statePath)) index = Number(fs.readFileSync(statePath, 'utf8') || '0');",
			"const response = responses[index] || responses[responses.length - 1] || { exitCode: 0, output: '{}' };",
			"if (statePath) fs.writeFileSync(statePath, String(index + 1));",
			"if (outputPath && response.output !== undefined) fs.writeFileSync(outputPath, String(response.output), 'utf8');",
			"process.exit(Number(response.exitCode || 0));",
			"",
		].join("\n"),
	);
	return stubDir;
}

export function prependPath(
	env: NodeJS.ProcessEnv,
	stubDir: string,
): NodeJS.ProcessEnv {
	return {
		...env,
		PATH: `${stubDir}:${env.PATH ?? process.env.PATH ?? ""}`,
	};
}

export function runNodeCli(
	cliName: string,
	args: readonly string[],
	cwd: string,
	extraEnv: NodeJS.ProcessEnv = {},
	stdin?: string,
) {
	return spawnSync(
		process.execPath,
		[resolve(repoRoot, "dist/bin", `${cliName}.js`), ...args],
		{
			cwd,
			encoding: "utf8",
			input: stdin,
			env: { ...process.env, ...extraEnv },
		},
	);
}

export function normalizeRunState(raw: string): unknown {
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	delete parsed.created_at;
	delete parsed.updated_at;
	delete parsed.repo_path;
	delete parsed.worktree_path;
	if (Array.isArray(parsed.history)) {
		parsed.history = parsed.history.map((entry) => {
			const next = { ...(entry as Record<string, unknown>) };
			delete next.timestamp;
			return next;
		});
	}
	return parsed;
}

export function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function fixturePath(relativePath: string): string {
	return resolve(repoRoot, "src/tests/fixtures/legacy-final", relativePath);
}

export function readFixtureText(relativePath: string): string {
	return readFileSync(fixturePath(relativePath), "utf8");
}

export function readFixtureJson<T>(relativePath: string): T {
	return JSON.parse(readFixtureText(relativePath)) as T;
}
