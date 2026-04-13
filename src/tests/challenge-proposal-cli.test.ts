import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateSchemaValue } from "../lib/schemas.js";
import type { ChallengeResult } from "../types/contracts.js";
import {
	createClaudeStub,
	createCodexStub,
	createFixtureRepo,
	createInstalledHome,
	makeTempDir,
	prependPath,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

function createCodexEnv(root: string, responses: unknown[]) {
	const stubDir = createCodexStub(root);
	const responsesPath = join(root, "codex-responses.json");
	const statePath = join(root, "codex-state.txt");
	writeFileSync(responsesPath, JSON.stringify(responses), "utf8");
	writeFileSync(statePath, "0", "utf8");
	return prependPath(
		{
			HOME: createInstalledHome(root),
			SPECFLOW_TEST_CODEX_RESPONSES: responsesPath,
			SPECFLOW_TEST_CODEX_STATE: statePath,
			SPECFLOW_MAIN_AGENT: "codex",
		},
		stubDir,
	);
}

function createClaudeEnv(root: string, responses: unknown[]) {
	const stubDir = createClaudeStub(root);
	const responsesPath = join(root, "claude-responses.json");
	const statePath = join(root, "claude-state.txt");
	writeFileSync(responsesPath, JSON.stringify(responses), "utf8");
	writeFileSync(statePath, "0", "utf8");
	return prependPath(
		{
			HOME: createInstalledHome(root),
			SPECFLOW_TEST_CLAUDE_RESPONSES: responsesPath,
			SPECFLOW_TEST_CLAUDE_STATE: statePath,
			SPECFLOW_REVIEW_AGENT: "claude",
		},
		stubDir,
	);
}

function assertValidChallengeResult(stdout: string): ChallengeResult {
	const json = JSON.parse(stdout) as ChallengeResult;
	assert.deepEqual(validateSchemaValue("challenge-proposal-result", json), []);
	return json;
}

test("specflow-challenge-proposal returns challenges on success", () => {
	const tempRoot = makeTempDir("challenge-proposal-success-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					challenges: [
						{
							id: "C1",
							category: "clarity",
							question: "What happens on timeout?",
							context: "No timeout behavior specified.",
						},
					],
					summary: "One clarification needed.",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = assertValidChallengeResult(result.stdout);
		assert.equal(json.status, "success");
		assert.equal(json.action, "challenge");
		assert.equal(json.change_id, changeId);
		assert.equal(json.challenges.length, 1);
		assert.equal(json.challenges[0].id, "C1");
		assert.equal(json.challenges[0].category, "clarity");
		assert.equal(json.challenges[0].question, "What happens on timeout?");
		assert.equal(json.summary, "One clarification needed.");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-challenge-proposal returns empty challenges when proposal is clear", () => {
	const tempRoot = makeTempDir("challenge-proposal-empty-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					challenges: [],
					summary: "Proposal is clear and ready for design.",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = assertValidChallengeResult(result.stdout);
		assert.equal(json.status, "success");
		assert.equal(json.challenges.length, 0);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-challenge-proposal handles parse error gracefully", () => {
	const tempRoot = makeTempDir("challenge-proposal-parse-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: "This is not JSON at all",
			},
		]);
		const result = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as ChallengeResult;
		assert.equal(json.status, "success");
		assert.equal(json.parse_error, true);
		assert.equal(json.challenges.length, 0);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-challenge-proposal errors on missing proposal", () => {
	const tempRoot = makeTempDir("challenge-proposal-missing-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, []);
		const result = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", "nonexistent-change"],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as ChallengeResult;
		assert.equal(json.status, "error");
		assert.equal(json.error, "missing_proposal");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-challenge-proposal works with claude agent", () => {
	const tempRoot = makeTempDir("challenge-proposal-claude-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createClaudeEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					challenges: [
						{
							id: "C1",
							category: "scope",
							question: "Should this include admin users?",
							context: "User roles are not specified.",
						},
					],
					summary: "Scope clarification needed.",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = assertValidChallengeResult(result.stdout);
		assert.equal(json.status, "success");
		assert.equal(json.challenges.length, 1);
	} finally {
		removeTempDir(tempRoot);
	}
});
