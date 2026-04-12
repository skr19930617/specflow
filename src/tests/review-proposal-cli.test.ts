import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateSchemaValue } from "../lib/schemas.js";
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

function proposalHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function writeReviewConfig(repoPath: string, maxRounds: number): void {
	writeFileSync(
		join(repoPath, "openspec", "config.yaml"),
		`max_autofix_rounds: ${maxRounds}\n`,
		"utf8",
	);
}

function assertValidReviewResult<T>(stdout: string): T {
	const json = JSON.parse(stdout) as T;
	assert.deepEqual(validateSchemaValue("review-proposal-result", json), []);
	return json;
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
		const json = assertValidReviewResult<{
			status: string;
			handoff: {
				state: string;
				actionable_count: number;
				decision: string;
				blocking_count: number;
				max_rounds: number;
				stop_reason: string | null;
			};
		}>(result.stdout);
		assert.equal(json.status, "success");
		assert.equal(json.handoff.state, "review_approved");
		assert.equal(json.handoff.actionable_count, 0);
		assert.equal(json.handoff.decision, "APPROVE");
		assert.equal(json.handoff.blocking_count, 0);
		assert.equal(json.handoff.max_rounds, 4);
		assert.equal(json.handoff.stop_reason, null);
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
		assert.ok(currentPhase.includes("- Configured Round Cap: 4"));
		assert.ok(currentPhase.includes("- Latest Decision: APPROVE"));
		assert.ok(currentPhase.includes("- Gate Blocking Findings: 0"));
		assert.ok(currentPhase.includes("- Cap Reached: no"));
		assert.ok(currentPhase.includes("- Stop Reason: none"));
		assert.ok(currentPhase.includes("- Actionable Findings: 0"));
		assert.ok(currentPhase.includes("- Next Recommended Action: /specflow"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal allows APPROVE with only non-blocking findings", () => {
	const tempRoot = makeTempDir("review-proposal-approve-low-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [
						{
							title: "Document a rollout note",
							file: "proposal.md",
							category: "risk",
							severity: "low",
						},
					],
					summary: "good enough to proceed",
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
		const json = assertValidReviewResult<{
			handoff: {
				state: string;
				actionable_count: number;
				severity_summary: string;
				decision: string;
				blocking_count: number;
			};
		}>(result.stdout);
		assert.equal(json.handoff.state, "review_approved");
		assert.equal(json.handoff.actionable_count, 1);
		assert.equal(json.handoff.severity_summary, "LOW: 1");
		assert.equal(json.handoff.decision, "APPROVE");
		assert.equal(json.handoff.blocking_count, 0);
		const currentPhase = readFileSync(
			join(repoPath, "openspec/changes", changeId, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Gate Blocking Findings: 0"));
		assert.ok(currentPhase.includes("- Actionable Findings: 1"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal blocks APPROVE when unresolved high findings remain", () => {
	const tempRoot = makeTempDir("review-proposal-approve-high-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [
						{
							title: "Define failure behavior",
							file: "proposal.md",
							category: "clarity",
							severity: "high",
						},
					],
					summary: "not safe enough yet",
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
		const json = assertValidReviewResult<{
			handoff: {
				state: string;
				decision: string;
				blocking_count: number;
				stop_reason: string | null;
			};
		}>(result.stdout);
		assert.equal(json.handoff.state, "review_blocked");
		assert.equal(json.handoff.decision, "APPROVE");
		assert.equal(json.handoff.blocking_count, 1);
		assert.equal(json.handoff.stop_reason, null);
		const currentPhase = readFileSync(
			join(repoPath, "openspec/changes", changeId, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Latest Decision: APPROVE"));
		assert.ok(currentPhase.includes("- Gate Blocking Findings: 1"));
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
		const json = assertValidReviewResult<{
			handoff: {
				state: string;
				decision: string;
				blocking_count: number;
				max_rounds: number;
				stop_reason: string | null;
			};
			rereview_classification: { still_open: string[]; new_findings: string[] };
		}>(result.stdout);
		assert.equal(json.handoff.state, "review_changes_requested");
		assert.equal(json.handoff.decision, "REQUEST_CHANGES");
		assert.equal(json.handoff.blocking_count, 2);
		assert.equal(json.handoff.max_rounds, 4);
		assert.equal(json.handoff.stop_reason, null);
		assert.deepEqual(json.rereview_classification.still_open, ["R1-F01"]);
		const ledger = readJson<{
			findings: { id: string; severity: string; status: string }[];
		}>(join(changeDir, "review-ledger-proposal.json"));
		assert.equal(ledger.findings[0].severity, "medium");
		assert.ok(
			ledger.findings.some((finding) => /^R2-F0[12]$/.test(finding.id)),
		);
		const currentPhase = readFileSync(
			join(changeDir, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Phase: proposal-fix-review"));
		assert.ok(currentPhase.includes("- Configured Round Cap: 4"));
		assert.ok(currentPhase.includes("- Latest Decision: REQUEST_CHANGES"));
		assert.ok(currentPhase.includes("- Gate Blocking Findings: 2"));
		assert.ok(currentPhase.includes("- Actionable Findings: 2"));
		assert.ok(currentPhase.includes("- Next Recommended Action: /specflow"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal uses configured cap and stops when the last allowed round still blocks", () => {
	const tempRoot = makeTempDir("review-proposal-cap-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		writeReviewConfig(repoPath, 2);
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
							title: "Clarify rollback behavior",
							file: "proposal.md",
							category: "risk",
							severity: "high",
							status: "open",
							notes: "",
						},
					],
					round_summaries: [
						{
							round: 1,
							total: 1,
							open: 1,
							new: 0,
							resolved: 0,
							overridden: 0,
							by_severity: { high: 1 },
						},
					],
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
					summary: "still blocked",
					resolved_previous_findings: [],
					still_open_previous_findings: [{ id: "R1-F01", severity: "high" }],
					new_findings: [],
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
		const json = assertValidReviewResult<{
			ledger: { round: number };
			handoff: {
				state: string;
				max_rounds: number;
				stop_reason: string | null;
			};
		}>(result.stdout);
		assert.equal(json.ledger.round, 2);
		assert.equal(json.handoff.state, "max_rounds_reached");
		assert.equal(json.handoff.max_rounds, 2);
		assert.equal(json.handoff.stop_reason, "max_rounds_reached");
		const currentPhase = readFileSync(
			join(changeDir, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Round: 2"));
		assert.ok(currentPhase.includes("- Configured Round Cap: 2"));
		assert.ok(currentPhase.includes("- Cap Reached: yes"));
		assert.ok(currentPhase.includes("- Stop Reason: max_rounds_reached"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-proposal detects no progress after two stagnant re-reviews", () => {
	const tempRoot = makeTempDir("review-proposal-no-progress-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const changeDir = join(repoPath, "openspec/changes", changeId);
		const hash = proposalHash(
			readFileSync(join(changeDir, "proposal.md"), "utf8"),
		);
		writeFileSync(
			join(changeDir, "review-ledger-proposal.json"),
			JSON.stringify(
				{
					feature_id: changeId,
					phase: "proposal",
					current_round: 1,
					status: "in_progress",
					max_finding_id: 1,
					findings: [
						{
							id: "R1-F01",
							title: "Clarify dependency assumption",
							file: "proposal.md",
							category: "risk",
							severity: "low",
							status: "open",
							notes: "",
						},
					],
					round_summaries: [
						{
							round: 1,
							total: 1,
							open: 1,
							new: 0,
							resolved: 0,
							overridden: 0,
							by_severity: { low: 1 },
							decision: "REQUEST_CHANGES",
							proposal_hash: hash,
							blocking_count: 1,
							blocking_signature:
								"REQUEST_CHANGES||R1-F01|proposal.md|risk|low|Clarify dependency assumption",
							stagnant_rounds: 1,
							max_rounds: 4,
							stop_reason: null,
						},
					],
					latest_decision: "REQUEST_CHANGES",
					proposal_hash: hash,
					blocking_count: 1,
					blocking_signature:
						"REQUEST_CHANGES||R1-F01|proposal.md|risk|low|Clarify dependency assumption",
					stagnant_rounds: 1,
					max_rounds: 4,
					stop_reason: null,
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
					summary: "same issue remains",
					resolved_previous_findings: [],
					still_open_previous_findings: [{ id: "R1-F01", severity: "low" }],
					new_findings: [],
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
		const json = assertValidReviewResult<{
			ledger: { round: number; round_summaries: { round: number }[] };
			handoff: {
				state: string;
				stop_reason: string | null;
				blocking_count: number;
			};
		}>(result.stdout);
		assert.equal(json.ledger.round, 1);
		assert.equal(json.handoff.state, "no_progress");
		assert.equal(json.handoff.stop_reason, "no_progress");
		assert.equal(json.handoff.blocking_count, 1);
		const ledger = readJson<{
			current_round: number;
			round_summaries: { round: number }[];
			stop_reason: string;
		}>(join(changeDir, "review-ledger-proposal.json"));
		assert.equal(ledger.current_round, 1);
		assert.equal(ledger.round_summaries.length, 1);
		assert.equal(ledger.stop_reason, "no_progress");
		const currentPhase = readFileSync(
			join(changeDir, "current-phase.md"),
			"utf8",
		);
		assert.ok(currentPhase.includes("- Stop Reason: no_progress"));
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
		const json = assertValidReviewResult<{ ledger_recovery: string }>(
			result.stdout,
		);
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
		const json = assertValidReviewResult<{
			review: { parse_error: boolean };
			ledger: { round: number };
			handoff: null;
		}>(result.stdout);
		assert.equal(json.review.parse_error, true);
		assert.equal(json.ledger.round, 0);
		assert.equal(json.handoff, null);
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
