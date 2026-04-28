import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
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
		mkdirSync(join(repoPath, ".specflow"), { recursive: true });
		writeFileSync(
			join(repoPath, ".specflow/config.yaml"),
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
		mkdirSync(join(repoPath, ".specflow"), { recursive: true });
		writeFileSync(
			join(repoPath, ".specflow/config.yaml"),
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

// --- Review gate issuance E2E tests (R5-F13) --------------------------------

/** Helper: start a run for the given changeId and return the run_id. */
function startRunForReview(
	repoPath: string,
	changeId: string,
): { runId: string; worktreePath: string } {
	// Commit any pending artifacts so the worktree inherits them from HEAD.
	spawnSync("git", ["add", "-A"], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["commit", "-m", "fixture artifacts", "--allow-empty"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	// Create a main-session worktree for the change.
	const wtParent = join(repoPath, ".specflow/worktrees", changeId);
	mkdirSync(wtParent, { recursive: true });
	const wtPath = join(wtParent, "main");
	spawnSync("git", ["worktree", "add", "-b", changeId, wtPath, "HEAD"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	const headSha = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: repoPath,
		encoding: "utf8",
	}).stdout.trim();
	const result = runNodeCli(
		"specflow-run",
		[
			"start",
			changeId,
			"--worktree-path",
			wtPath,
			"--base-commit",
			headSha,
			"--base-branch",
			"main",
		],
		repoPath,
	);
	assert.equal(result.status, 0, result.stderr);
	const state = JSON.parse(result.stdout) as { run_id: string };
	return { runId: state.run_id, worktreePath: wtPath };
}

/** Helper: list gate record files in a run's records directory. */
function listGateFiles(repoPath: string, runId: string): string[] {
	const dir = join(repoPath, ".specflow/runs", runId, "records");
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter(
		(f: string) => f.endsWith(".json") && !f.startsWith("."),
	);
}

/** Helper: read a gate record JSON from disk. */
function readGateFile(
	repoPath: string,
	runId: string,
	fileName: string,
): Record<string, unknown> {
	const path = resolve(repoPath, ".specflow/runs", runId, "records", fileName);
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("specflow-review-design review emits a review_decision gate when --run-id is provided", () => {
	const tempRoot = makeTempDir("review-design-gate-emit-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		addDesignArtifacts(repoPath, changeId);
		const { runId, worktreePath } = startRunForReview(repoPath, changeId);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [
						{ title: "Minor gap", severity: "medium", category: "design" },
					],
					summary: "mostly ok",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-design",
			["review", changeId, "--run-id", runId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			gate_id: string | null;
		};
		assert.equal(json.status, "success");
		// gate_id should be non-null
		assert.ok(json.gate_id, "gate_id should be set in the review result");
		assert.match(json.gate_id, /review_decision/);

		// Gate file should exist on disk
		const gateFiles = listGateFiles(repoPath, runId);
		const gateFile = gateFiles.find((f) => f.includes("design_review"));
		assert.ok(gateFile, "gate file for design_review should exist on disk");
		const gate = readGateFile(repoPath, runId, gateFile!);
		assert.equal(gate.gate_kind, "review_decision");
		assert.equal(gate.status, "pending");
		assert.equal(gate.originating_phase, "design_review");

		// Ledger is now written inside the worktree (change-artifact root).
		const ledger = readJson<{
			round_summaries: Array<{ gate_id?: string | null }>;
		}>(
			join(
				worktreePath,
				"openspec/changes",
				changeId,
				"review-ledger-design.json",
			),
		);
		assert.ok(ledger.round_summaries.length > 0);
		const lastSummary =
			ledger.round_summaries[ledger.round_summaries.length - 1];
		assert.equal(
			lastSummary.gate_id,
			json.gate_id,
			"ledger round_summary should back-reference the gate_id",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-review-apply review emits a review_decision gate when --run-id is provided", () => {
	const tempRoot = makeTempDir("review-apply-gate-emit-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		// Start the run first (commits artifacts and creates worktree), then
		// introduce the implementation diff inside the worktree so the review
		// CLI's diff filter picks it up from the correct working tree.
		const { runId, worktreePath } = startRunForReview(repoPath, changeId);
		addImplementationDiff(worktreePath);
		const env = createCodexEnv(tempRoot, [
			{
				exitCode: 0,
				output: JSON.stringify({
					decision: "APPROVE",
					findings: [
						{
							title: "Check error handling",
							severity: "medium",
							category: "correctness",
						},
					],
					summary: "review complete",
				}),
			},
		]);
		const result = runNodeCli(
			"specflow-review-apply",
			["review", changeId, "--run-id", runId],
			repoPath,
			env,
		);
		assert.equal(result.status, 0, result.stderr);
		const json = JSON.parse(result.stdout) as {
			status: string;
			gate_id: string | null;
		};
		assert.equal(json.status, "success");
		assert.ok(json.gate_id, "gate_id should be set in the review result");
		assert.match(json.gate_id, /review_decision/);

		// Gate file should exist on disk
		const gateFiles = listGateFiles(repoPath, runId);
		const gateFile = gateFiles.find((f) => f.includes("apply_review"));
		assert.ok(gateFile, "gate file for apply_review should exist on disk");
		const gate = readGateFile(repoPath, runId, gateFile!);
		assert.equal(gate.gate_kind, "review_decision");
		assert.equal(gate.status, "pending");

		// Ledger is now written inside the worktree (change-artifact root).
		const ledger = readJson<{
			round_summaries: Array<{ gate_id?: string | null }>;
		}>(join(worktreePath, "openspec/changes", changeId, "review-ledger.json"));
		assert.ok(ledger.round_summaries.length > 0);
		const lastSummary =
			ledger.round_summaries[ledger.round_summaries.length - 1];
		assert.equal(lastSummary.gate_id, json.gate_id);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-challenge-proposal emits distinct gate IDs across successive rounds", () => {
	const tempRoot = makeTempDir("challenge-gate-round-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const { runId } = startRunForReview(repoPath, changeId);
		const challengeResponse = {
			exitCode: 0,
			output: JSON.stringify({
				challenges: [
					{
						id: "C1",
						category: "scope",
						question: "Is this in scope?",
						context: "test",
					},
				],
				summary: "one challenge",
			}),
		};
		const env = createCodexEnv(tempRoot, [
			challengeResponse,
			challengeResponse,
		]);
		// Run challenge twice to verify distinct gate IDs
		const result1 = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId, "--run-id", runId],
			repoPath,
			env,
		);
		assert.equal(result1.status, 0, result1.stderr);
		const json1 = JSON.parse(result1.stdout) as {
			gate_id: string | null;
		};
		assert.ok(json1.gate_id, "first challenge should emit a gate_id");

		const result2 = runNodeCli(
			"specflow-challenge-proposal",
			["challenge", changeId, "--run-id", runId],
			repoPath,
			env,
		);
		assert.equal(result2.status, 0, result2.stderr);
		const json2 = JSON.parse(result2.stdout) as {
			gate_id: string | null;
		};
		assert.ok(json2.gate_id, "second challenge should emit a gate_id");

		// Gate IDs must be distinct (round numbering should differ)
		assert.notEqual(
			json1.gate_id,
			json2.gate_id,
			"successive challenge rounds must produce distinct gate IDs",
		);
		assert.match(json1.gate_id!, /challenge-1/);
		assert.match(json2.gate_id!, /challenge-2/);
	} finally {
		removeTempDir(tempRoot);
	}
});
