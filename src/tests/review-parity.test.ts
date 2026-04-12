import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	addDesignArtifacts,
	addImplementationDiff,
	createCodexStub,
	createFixtureRepo,
	createInstalledHome,
	makeTempDir,
	prependPath,
	readFixtureJson,
	readFixtureText,
	readJson,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

function writeResponses(
	root: string,
	responses: unknown[],
): {
	SPECFLOW_TEST_CODEX_RESPONSES: string;
	SPECFLOW_TEST_CODEX_STATE: string;
} {
	mkdirSync(root, { recursive: true });
	const responsesPath = join(root, "codex-responses.json");
	const statePath = join(root, "codex-state.txt");
	writeFileSync(responsesPath, JSON.stringify(responses), "utf8");
	writeFileSync(statePath, "0", "utf8");
	return {
		SPECFLOW_TEST_CODEX_RESPONSES: responsesPath,
		SPECFLOW_TEST_CODEX_STATE: statePath,
	};
}

test("specflow-review-apply matches archived output and side-effect fixtures", () => {
	const tempRoot = makeTempDir("review-apply-fixture-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		const home = createInstalledHome(tempRoot);
		const stubDir = createCodexStub(tempRoot);
		const responses = [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "REVIEWED",
					summary: "looks good",
					findings: [
						{
							title: "Needs guard",
							file: "app.txt",
							category: "logic",
							severity: "high",
						},
					],
				}),
			},
		];
		const env = prependPath(
			{
				HOME: home,
				...writeResponses(join(tempRoot, "node"), responses),
			},
			stubDir,
		);

		const nodeResult = runNodeCli(
			"specflow-review-apply",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(nodeResult.status, 0, nodeResult.stderr);
		assert.deepEqual(
			JSON.parse(nodeResult.stdout),
			readFixtureJson("review-apply/output.json"),
		);
		assert.deepEqual(
			readJson(
				join(repoPath, "openspec/changes", changeId, "review-ledger.json"),
			),
			readFixtureJson("review-apply/ledger.json"),
		);
		assert.equal(
			readFileSync(
				join(repoPath, "openspec/changes", changeId, "current-phase.md"),
				"utf8",
			).trim(),
			readFixtureText("review-apply/current-phase.md").trim(),
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design matches archived output and side-effect fixtures", () => {
	const tempRoot = makeTempDir("review-design-fixture-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const home = createInstalledHome(tempRoot);
		const stubDir = createCodexStub(tempRoot);
		const responses = [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "REVIEWED",
					summary: "design reviewed",
					findings: [
						{
							title: "Clarify data flow",
							file: "design.md",
							category: "design",
							severity: "high",
						},
					],
				}),
			},
		];
		const env = prependPath(
			{
				HOME: home,
				...writeResponses(join(tempRoot, "node"), responses),
			},
			stubDir,
		);

		const nodeResult = runNodeCli(
			"specflow-review-design",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(nodeResult.status, 0, nodeResult.stderr);
		assert.deepEqual(
			JSON.parse(nodeResult.stdout),
			readFixtureJson("review-design/output.json"),
		);
		assert.deepEqual(
			readJson(
				join(
					repoPath,
					"openspec/changes",
					changeId,
					"review-ledger-design.json",
				),
			),
			readFixtureJson("review-design/ledger.json"),
		);
		assert.equal(
			readFileSync(
				join(repoPath, "openspec/changes", changeId, "current-phase.md"),
				"utf8",
			).trim(),
			readFixtureText("review-design/current-phase.md").trim(),
		);
	} finally {
		removeTempDir(tempRoot);
	}
});
