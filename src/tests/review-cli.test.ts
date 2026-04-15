import assert from "node:assert/strict";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	addDesignArtifacts,
	addImplementationDiff,
	createBareHome,
	createClaudeStub,
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
			SPECFLOW_MAIN_AGENT: "codex",
			SPECFLOW_REVIEW_AGENT: "codex",
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

test("specflow-review-apply returns diff warning before codex", () => {
	const tempRoot = makeTempDir("review-apply-warning-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		writeFileSync(
			join(repoPath, "openspec/config.yaml"),
			"diff_warn_threshold: 1\n",
			"utf8",
		);
		const env = createCodexEnv(tempRoot, []);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			warning: string;
			diff_total_lines: number;
		};
		assert.equal(json.status, "warning");
		assert.equal(json.warning, "diff_threshold_exceeded");
		assert.ok(json.diff_total_lines > 1);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply defaults diff warning threshold to 1000 when config key is absent", () => {
	const tempRoot = makeTempDir("review-apply-default-threshold-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "safe under default threshold",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
			diff_summary: { diff_warning: boolean; threshold: number };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "safe under default threshold");
		assert.equal(json.diff_summary.diff_warning, false);
		assert.equal(json.diff_summary.threshold, 1000);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply review --skip-diff-check continues review while preserving warning metadata", () => {
	const tempRoot = makeTempDir("review-apply-skip-diff-check-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		writeFileSync(
			join(repoPath, "openspec/config.yaml"),
			"diff_warn_threshold: 1\n",
			"utf8",
		);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "continued after warning",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId, "--skip-diff-check"],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
			diff_summary: { diff_warning: boolean; threshold: number };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "continued after warning");
		assert.equal(json.diff_summary.diff_warning, true);
		assert.equal(json.diff_summary.threshold, 1);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply surfaces parse errors without mutating ledger", () => {
	const tempRoot = makeTempDir("review-apply-parse-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		const env = createCodexEnv(tempRoot, [{ exitCode: 0, output: "not-json" }]);
		const result = runNodeCli(
			"specflow-review-apply",
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
				join(repoPath, "openspec/changes", changeId, "review-ledger.json"),
			),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply returns no_changes for deleted-file-only diffs", () => {
	const tempRoot = makeTempDir("review-apply-deleted-only-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		unlinkSync(join(repoPath, "app.txt"));
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "should not run",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), {
			status: "error",
			action: "review",
			change_id: changeId,
			error: "no_changes",
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		});
		assert.equal(
			existsSync(
				join(repoPath, "openspec/changes", changeId, "review-ledger.json"),
			),
			false,
		);
		assert.equal(
			existsSync(
				join(repoPath, "openspec/changes", changeId, "current-phase.md"),
			),
			false,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design reports ledger recovery prompt on corrupt ledger without backup", () => {
	const tempRoot = makeTempDir("review-design-recovery-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, "review-ledger-design.json"),
			"{",
			"utf8",
		);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "OK",
					findings: [],
					summary: "done",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as { ledger_recovery: string };
		assert.equal(json.ledger_recovery, "prompt_user");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design applies rereview classification and severity updates", () => {
	const tempRoot = makeTempDir("review-design-rereview-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const changeDir = join(repoPath, "openspec/changes", changeId);
		writeFileSync(
			join(changeDir, "review-ledger-design.json"),
			JSON.stringify(
				{
					feature_id: changeId,
					phase: "design",
					current_round: 1,
					status: "has_open_high",
					max_finding_id: 1,
					findings: [
						{
							id: "R1-F01",
							title: "Clarify flow",
							file: "design.md",
							category: "design",
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
					decision: "UPDATED",
					summary: "classified",
					findings: [],
					resolved_previous_findings: [],
					still_open_previous_findings: [{ id: "R1-F01", severity: "medium" }],
					new_findings: [
						{
							title: "Add example",
							file: "tasks.md",
							category: "design",
							severity: "low",
						},
					],
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
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
		}>(join(changeDir, "review-ledger-design.json"));
		assert.equal(ledger.findings[0].severity, "medium");
		assert.ok(
			ledger.findings.some(
				(finding) => finding.id === "R2-F02" || finding.id === "R2-F01",
			),
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design autofix-loop stops with no_progress after unchanged fixes", () => {
	const tempRoot = makeTempDir("review-design-autofix-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const changeDir = join(repoPath, "openspec/changes", changeId);
		writeFileSync(
			join(changeDir, "review-ledger-design.json"),
			JSON.stringify(
				{
					feature_id: changeId,
					phase: "design",
					current_round: 1,
					status: "has_open_high",
					max_finding_id: 1,
					findings: [
						{
							id: "R1-F01",
							title: "Clarify flow",
							file: "design.md",
							category: "design",
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
			{ exitCode: 0, output: "{}" },
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "REVIEWED",
					summary: "still open",
					findings: [],
					still_open_previous_findings: ["R1-F01"],
					resolved_previous_findings: [],
					new_findings: [],
				}),
			},
			{ exitCode: 0, output: "{}" },
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "REVIEWED",
					summary: "still open",
					findings: [],
					still_open_previous_findings: ["R1-F01"],
					resolved_previous_findings: [],
					new_findings: [],
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["autofix-loop", changeId, "--max-rounds", "3"],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			autofix: { result: string; total_rounds: number };
		};
		assert.equal(json.autofix.result, "no_progress");
		assert.equal(json.autofix.total_rounds, 2);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design falls back to module-local prompts when no installed prompts exist", () => {
	const tempRoot = makeTempDir("review-design-module-prompts-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const stubDir = createCodexStub(tempRoot);
		const responsesPath = join(tempRoot, "codex-responses.json");
		const statePath = join(tempRoot, "codex-state.txt");
		writeFileSync(
			responsesPath,
			JSON.stringify([
				{
					exitCode: 0,
					output: JSON.stringify({
						decision: "OK",
						findings: [],
						summary: "done",
					}),
				},
			]),
			"utf8",
		);
		writeFileSync(statePath, "0", "utf8");
		const env = prependPath(
			{
				HOME: createBareHome(tempRoot),
				SPECFLOW_TEST_CODEX_RESPONSES: responsesPath,
				SPECFLOW_TEST_CODEX_STATE: statePath,
			},
			stubDir,
		);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "done");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Claude agent tests ---

test("specflow-review-apply works with claude as review agent via --review-agent flag", () => {
	const tempRoot = makeTempDir("review-apply-claude-flag-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		const env = createClaudeEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "all good via claude",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId, "--review-agent", "claude"],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "all good via claude");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply works with claude as review agent via env var", () => {
	const tempRoot = makeTempDir("review-apply-claude-env-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addImplementationDiff(repoPath);
		const env = createClaudeEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "all good via claude env",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "all good via claude env");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design works with claude as review agent", () => {
	const tempRoot = makeTempDir("review-design-claude-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const env = createClaudeEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "OK",
					findings: [],
					summary: "design ok via claude",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId, "--review-agent", "claude"],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			review: { summary: string };
		};
		assert.equal(json.status, "success");
		assert.equal(json.review.summary, "design ok via claude");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design injects task-plannable findings for design missing planning sections", () => {
	const tempRoot = makeTempDir("review-design-tp-missing-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		// Overwrite design.md with no planning sections
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, "design.md"),
			"# Design\n\nSome content without planning sections.\n",
			"utf8",
		);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "looks fine",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			ledger: { counts: { new: number } };
			handoff: { actionable_count: number };
		};
		assert.equal(json.status, "success");
		// 7 missing planning sections → 7 task-plannable findings
		assert.ok(
			json.ledger.counts.new >= 7,
			`Expected at least 7 new findings for missing planning sections, got ${json.ledger.counts.new}`,
		);
		assert.ok(
			json.handoff.actionable_count >= 7,
			`Expected at least 7 actionable findings, got ${json.handoff.actionable_count}`,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design does not inject task-plannable findings for design with all planning sections", () => {
	const tempRoot = makeTempDir("review-design-tp-present-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		// Default addDesignArtifacts now includes planning sections
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [],
					summary: "all good",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			ledger: { counts: { new: number } };
			handoff: { actionable_count: number; state: string };
		};
		assert.equal(json.status, "success");
		assert.equal(json.ledger.counts.new, 0);
		assert.equal(json.handoff.actionable_count, 0);
		assert.equal(json.handoff.state, "review_no_findings");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-design does not inject task-plannable findings in rereview mode", () => {
	const tempRoot = makeTempDir("review-design-tp-rereview-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		// Overwrite design.md with no planning sections
		const changeDir = join(repoPath, "openspec/changes", changeId);
		writeFileSync(
			join(changeDir, "design.md"),
			"# Design\n\nNo planning sections here.\n",
			"utf8",
		);
		// Create a pre-existing ledger (simulating prior review)
		writeFileSync(
			join(changeDir, "review-ledger-design.json"),
			JSON.stringify(
				{
					feature_id: changeId,
					phase: "design",
					current_round: 1,
					status: "has_open_high",
					max_finding_id: 1,
					findings: [
						{
							id: "P1",
							title: "Some issue",
							severity: "high",
							category: "completeness",
							status: "open",
							origin_round: 1,
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
					decision: "APPROVE",
					resolved_previous_findings: [{ id: "P1" }],
					still_open_previous_findings: [],
					new_findings: [],
					summary: "fixed",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["fix-review", changeId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			ledger: { counts: { new: number; resolved: number } };
		};
		assert.equal(json.status, "success");
		// In rereview mode, no task-plannable findings are injected
		assert.equal(json.ledger.counts.new, 0);
		assert.equal(json.ledger.counts.resolved, 1);
	} finally {
		removeTempDir(tempRoot);
	}
});
