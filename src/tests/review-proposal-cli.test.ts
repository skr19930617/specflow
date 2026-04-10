import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createCodexStub,
	createFixtureRepo,
	createInstalledHome,
	makeTempDir,
	prependPath,
	readJson,
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
		},
		stubDir,
	);
}

test("specflow-review-proposal supports initial review success", () => {
	const tempRoot = makeTempDir("review-proposal-success-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "proposal ready",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-proposal",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			handoff: { actionable_count: number };
		};
		assert.equal(json.status, "success");
		assert.equal(json.handoff.actionable_count, 0);
		assert.ok(
			existsSync(
				join(
					repoPath,
					"openspec/changes",
					changeId,
					"review-ledger-proposal.json",
				),
			),
		);
		const currentPhase = readFileSync(
			join(repoPath, "openspec/changes", changeId, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Phase: proposal-review"));
		assert.ok(currentPhase.includes("- Actionable Findings: 0"));
		assert.ok(currentPhase.includes("- Next Recommended Action: /specflow.design"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal applies rereview classification and updates current-phase", () => {
	const tempRoot = makeTempDir("review-proposal-rereview-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const changeDir = join(repoPath, "openspec/changes", changeId);
		writeFileSync(
			join(changeDir, "review-ledger-proposal.json"),
			JSON.stringify(
				{
					feature_id: changeId,
					phase: "proposal",
					current_round: 1,
					status: "has_open_high",
					max_finding_id: 1,
					findings: [
						{
							id: "R1-F01",
							title: "Clarify acceptance criteria",
							file: "proposal.md",
							category: "clarity",
							severity: "high",
							status: "open",
							notes: "",
						},
					],
					round_summaries: [],
				},
				null,
				2,
			),
			"utf8",
		);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "REQUEST_CHANGES",
					summary: "still needs work",
					findings: [],
					resolved_previous_findings: [],
					still_open_previous_findings: [{ id: "R1-F01", severity: "medium" }],
					new_findings: [
						{
							title: "Capture dependency assumption",
							file: "proposal.md",
							category: "risk",
							severity: "low",
						},
					],
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-proposal",
			["fix-review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			rereview_classification: { still_open: string[]; new_findings: string[] };
		};
		assert.deepEqual(json.rereview_classification.still_open, ["R1-F01"]);
		const ledger = readJson<{
			findings: { id: string; severity: string; status: string }[];
		}>(join(changeDir, "review-ledger-proposal.json"));
		assert.equal(ledger.findings[0].severity, "medium");
		assert.ok(
			ledger.findings.some((finding) => /^R2-F0[12]$/.test(finding.id)),
		);
		const currentPhase = readFileSync(join(changeDir, "current-phase.md"), "utf8");
		assert.ok(currentPhase.includes("- Phase: proposal-fix-review"));
		assert.ok(currentPhase.includes("- Actionable Findings: 2"));
		assert.ok(currentPhase.includes("- Next Recommended Action: /specflow"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal reports ledger recovery prompt on corrupt ledger without backup", () => {
	const tempRoot = makeTempDir("review-proposal-recovery-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		writeFileSync(
			join(
				repoPath,
				"openspec/changes",
				changeId,
				"review-ledger-proposal.json",
			),
			"{",
			"utf8",
		);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "ok",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-proposal",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as { ledger_recovery: string };
		assert.equal(json.ledger_recovery, "prompt_user");
		assert.ok(
			existsSync(
				join(
					repoPath,
					"openspec/changes",
					changeId,
					"review-ledger-proposal.json.corrupt",
				),
			),
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal surfaces parse errors without mutating ledger", () => {
	const tempRoot = makeTempDir("review-proposal-parse-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [{ exitCode: 0, output: "not-json" }]);
		const result = runNodeCli(
			"specflow-review-proposal",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			review: { parse_error: boolean };
			ledger: { round: number };
		};
		assert.equal(json.review.parse_error, true);
		assert.equal(json.ledger.round, 0);
		assert.equal(
			existsSync(
				join(
					repoPath,
					"openspec/changes",
					changeId,
					"review-ledger-proposal.json",
				),
			),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});
