import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	createBareHome,
	createFixtureRepo,
	createSourceFile,
	makeTempDir,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

interface StartResult {
	run_id: string;
	change_name: string | null;
	current_phase: string;
	status: string;
	allowed_events: string[];
	source?: { provider: string; reference: string } | null;
	run_kind?: string;
	previous_run_id?: string | null;
}

function startRun(
	repoPath: string,
	changeId: string,
	extraArgs: string[] = [],
): StartResult {
	const result = runNodeCli(
		"specflow-run",
		["start", changeId, ...extraArgs],
		repoPath,
	);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as StartResult;
}

function advancePhase(
	repoPath: string,
	runId: string,
	event: string,
): { current_phase: string; allowed_events: string[]; status: string } {
	const result = runNodeCli(
		"specflow-run",
		["advance", runId, event],
		repoPath,
	);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as {
		current_phase: string;
		allowed_events: string[];
		status: string;
	};
}

// --- Phase 9 Tests ---

test("specflow-run start generates run_id as change_id-1 for first run", () => {
	const tempRoot = makeTempDir("specflow-run-genid-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		assert.equal(state.run_id, `${changeId}-1`);
		assert.equal(state.change_name, changeId);
		assert.equal(state.status, "active");
		assert.equal(state.previous_run_id, null);
		assert.ok(state.allowed_events.includes("propose"));
		assert.ok(state.allowed_events.includes("suspend"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports lifecycle, source metadata, and update-field", () => {
	const tempRoot = makeTempDir("specflow-run-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/71",
			title: "Stub issue",
		});

		const startJson = startRun(repoPath, changeId, [
			"--source-file",
			sourceFile,
		]);
		const runId = startJson.run_id;
		assert.equal(startJson.current_phase, "start");
		assert.equal(startJson.source?.provider, "github");
		assert.equal(
			startJson.source?.reference,
			"https://github.com/test/repo/issues/71",
		);
		assert.ok(startJson.allowed_events.includes("propose"));

		const advanceJson = advancePhase(repoPath, runId, "propose");
		assert.equal(advanceJson.current_phase, "proposal_draft");

		const update = runNodeCli(
			"specflow-run",
			["update-field", runId, "last_summary_path", "/tmp/summary.md"],
			repoPath,
		);
		assert.equal(update.status, 0, update.stderr);
		const updateJson = JSON.parse(update.stdout) as {
			last_summary_path: string;
		};
		assert.equal(updateJson.last_summary_path, "/tmp/summary.md");

		const getField = runNodeCli(
			"specflow-run",
			["get-field", runId, "current_phase"],
			repoPath,
		);
		assert.equal(getField.status, 0, getField.stderr);
		assert.equal(JSON.parse(getField.stdout), "proposal_draft");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects change directories that lack proposal.md", () => {
	const tempRoot = makeTempDir("specflow-run-missing-proposal-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		rmSync(join(repoPath, "openspec/changes", changeId, "proposal.md"), {
			force: true,
		});
		writeFileSync(
			join(repoPath, "openspec/changes", changeId, ".openspec.yaml"),
			"schema: spec-driven\ncreated: 2026-04-10\n",
			"utf8",
		);

		const start = runNodeCli("specflow-run", ["start", changeId], repoPath);
		assert.notEqual(start.status, 0);
		assert.match(start.stderr, /no OpenSpec proposal found/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run start rejects removed --issue-url option", () => {
	const tempRoot = makeTempDir("specflow-run-issue-url-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const start = runNodeCli(
			"specflow-run",
			[
				"start",
				changeId,
				"--issue-url",
				"https://github.com/test/repo/issues/71",
			],
			repoPath,
		);
		assert.notEqual(start.status, 0);
		assert.match(start.stderr, /unknown option '--issue-url'/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run start returns not_in_git_repo JSON outside git", () => {
	const tempRoot = makeTempDir("specflow-run-nogit-");
	try {
		const result = runNodeCli(
			"specflow-run",
			["start", "test-change"],
			tempRoot,
		);
		assert.notEqual(result.status, 0);
		assert.equal(
			result.stdout.trim(),
			'{"status":"error","error":"not_in_git_repo"}',
		);
		assert.equal(result.stderr, "");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports the full happy path from start to approved", () => {
	const tempRoot = makeTempDir("specflow-run-happy-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		const sequence: Array<[string, string]> = [
			["propose", "proposal_draft"],
			["check_scope", "proposal_scope"],
			["continue_proposal", "proposal_clarify"],
			["challenge_proposal", "proposal_challenge"],
			["reclarify", "proposal_reclarify"],
			["accept_proposal", "spec_draft"],
			["validate_spec", "spec_validate"],
			["spec_validated", "spec_ready"],
			["accept_spec", "design_draft"],
			["review_design", "design_review"],
			["design_review_approved", "design_ready"],
			["accept_design", "apply_draft"],
			["review_apply", "apply_review"],
			["apply_review_approved", "apply_ready"],
			["accept_apply", "approved"],
		];
		let current = "start";
		for (const [event, expectedPhase] of sequence) {
			const json = advancePhase(repoPath, runId, event);
			assert.equal(
				json.current_phase,
				expectedPhase,
				`${current} --${event}--> ${expectedPhase}`,
			);
			current = expectedPhase;
		}
		const status = runNodeCli("specflow-run", ["status", runId], repoPath);
		assert.equal(status.status, 0, status.stderr);
		const statusJson = JSON.parse(status.stdout) as {
			current_phase: string;
			allowed_events: string[];
			status: string;
			history: { event: string }[];
		};
		assert.equal(statusJson.current_phase, "approved");
		assert.deepEqual(statusJson.allowed_events, []);
		assert.equal(statusJson.status, "terminal");
		assert.equal(statusJson.history.length, sequence.length);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports proposal linear flow, spec_draft reclarify, and design/apply loops", () => {
	const tempRoot = makeTempDir("specflow-run-loops-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		// proposal linear flow: clarify → challenge → reclarify → spec_draft
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");
		advancePhase(repoPath, runId, "continue_proposal");
		advancePhase(repoPath, runId, "challenge_proposal");
		advancePhase(repoPath, runId, "reclarify");
		advancePhase(repoPath, runId, "accept_proposal");
		// spec_draft → reclarify → proposal_reclarify → accept_proposal → spec_draft
		assert.equal(
			advancePhase(repoPath, runId, "reclarify").current_phase,
			"proposal_reclarify",
		);
		assert.equal(
			advancePhase(repoPath, runId, "accept_proposal").current_phase,
			"spec_draft",
		);
		// spec validation loop
		advancePhase(repoPath, runId, "validate_spec");
		assert.equal(
			advancePhase(repoPath, runId, "revise_spec").current_phase,
			"spec_draft",
		);
		advancePhase(repoPath, runId, "validate_spec");
		advancePhase(repoPath, runId, "spec_validated");
		advancePhase(repoPath, runId, "accept_spec");
		// design review loop
		advancePhase(repoPath, runId, "review_design");
		assert.equal(
			advancePhase(repoPath, runId, "revise_design").current_phase,
			"design_draft",
		);
		advancePhase(repoPath, runId, "review_design");
		advancePhase(repoPath, runId, "design_review_approved");
		advancePhase(repoPath, runId, "accept_design");
		// apply review loop
		advancePhase(repoPath, runId, "review_apply");
		const applyLoop = advancePhase(repoPath, runId, "revise_apply");
		assert.equal(applyLoop.current_phase, "apply_draft");
		assert.ok(applyLoop.allowed_events.includes("review_apply"));
		assert.ok(applyLoop.allowed_events.includes("reject"));
		assert.ok(applyLoop.allowed_events.includes("suspend"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports decomposition as a terminal path", () => {
	const tempRoot = makeTempDir("specflow-run-decompose-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");
		const json = advancePhase(repoPath, runId, "decompose");
		assert.equal(json.current_phase, "decomposed");
		assert.deepEqual(json.allowed_events, []);
		assert.equal(json.status, "terminal");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects invalid transitions and reports allowed events for detailed states", () => {
	const tempRoot = makeTempDir("specflow-run-invalid-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");
		const invalid = runNodeCli(
			"specflow-run",
			["advance", runId, "spec_validated"],
			repoPath,
		);
		assert.notEqual(invalid.status, 0);
		assert.match(
			invalid.stderr,
			/Allowed events: continue_proposal, decompose, reject, suspend/,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports synthetic runs without OpenSpec change directories", () => {
	const tempRoot = makeTempDir("specflow-run-synthetic-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const start = runNodeCli(
			"specflow-run",
			["start", "_explore_20260409-010203", "--run-kind", "synthetic"],
			repoPath,
		);
		assert.equal(start.status, 0, start.stderr);
		const startJson = JSON.parse(start.stdout) as StartResult;
		assert.equal(startJson.run_kind, "synthetic");
		assert.equal(startJson.change_name, null);
		assert.equal(startJson.previous_run_id, null);
		assert.ok(startJson.allowed_events.includes("propose"));

		const advance = runNodeCli(
			"specflow-run",
			["advance", "_explore_20260409-010203", "explore_start"],
			repoPath,
		);
		assert.equal(advance.status, 0, advance.stderr);
		const advanceJson = JSON.parse(advance.stdout) as { current_phase: string };
		assert.equal(advanceJson.current_phase, "explore");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run synthetic runs reject --retry", () => {
	const tempRoot = makeTempDir("specflow-run-synthetic-retry-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const start = runNodeCli(
			"specflow-run",
			["start", "_syn_test", "--run-kind", "synthetic", "--retry"],
			repoPath,
		);
		assert.notEqual(start.status, 0);
		assert.match(start.stderr, /--retry is not supported for synthetic runs/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run synthetic runs reject duplicate run_id", () => {
	const tempRoot = makeTempDir("specflow-run-synthetic-dup-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const start1 = runNodeCli(
			"specflow-run",
			["start", "_syn_dup", "--run-kind", "synthetic"],
			repoPath,
		);
		assert.equal(start1.status, 0, start1.stderr);
		const start2 = runNodeCli(
			"specflow-run",
			["start", "_syn_dup", "--run-kind", "synthetic"],
			repoPath,
		);
		assert.notEqual(start2.status, 0);
		assert.match(start2.stderr, /already exists/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects old run schema", () => {
	const tempRoot = makeTempDir("specflow-run-schema-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const runDir = join(repoPath, ".specflow/runs", `${changeId}-1`);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(
			join(runDir, "run.json"),
			JSON.stringify(
				{
					run_id: `${changeId}-1`,
					change_name: changeId,
					current_phase: "design",
					status: "active",
					allowed_events: ["accept_design", "revise_design", "reject"],
					issue: null,
					created_at: "2025-01-01T00:00:00Z",
					updated_at: "2025-01-01T00:00:00Z",
					history: [],
				},
				null,
				2,
			),
			"utf8",
		);

		const oldSchema = runNodeCli(
			"specflow-run",
			["status", `${changeId}-1`],
			repoPath,
		);
		assert.notEqual(oldSchema.status, 0);
		assert.match(oldSchema.stderr, /missing required fields/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run falls back to module-local workflow when project and installed copies are absent", () => {
	const tempRoot = makeTempDir("specflow-run-module-workflow-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		rmSync(join(repoPath, "global"), { recursive: true, force: true });
		const start = runNodeCli("specflow-run", ["start", changeId], repoPath, {
			HOME: createBareHome(tempRoot),
		});
		assert.equal(start.status, 0, start.stderr);
		const startJson = JSON.parse(start.stdout) as StartResult;
		assert.equal(startJson.current_phase, "start");
		assert.ok(startJson.allowed_events.includes("propose"));
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- New identity model tests ---

test("specflow-run rejects start when active run exists for same change", () => {
	const tempRoot = makeTempDir("specflow-run-active-reject-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		startRun(repoPath, changeId);
		const second = runNodeCli("specflow-run", ["start", changeId], repoPath);
		assert.notEqual(second.status, 0);
		assert.match(second.stderr, /Active run already exists/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects plain start when all prior runs are terminal", () => {
	const tempRoot = makeTempDir("specflow-run-terminal-reject-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");
		advancePhase(repoPath, runId, "decompose"); // terminal
		const second = runNodeCli("specflow-run", ["start", changeId], repoPath);
		assert.notEqual(second.status, 0);
		assert.match(second.stderr, /prior runs exist.*--retry/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run retry creates new run with incremented sequence", () => {
	const tempRoot = makeTempDir("specflow-run-retry-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const first = startRun(repoPath, changeId);
		assert.equal(first.run_id, `${changeId}-1`);
		advancePhase(repoPath, first.run_id, "propose");
		advancePhase(repoPath, first.run_id, "check_scope");
		advancePhase(repoPath, first.run_id, "decompose");

		const retry = startRun(repoPath, changeId, ["--retry"]);
		assert.equal(retry.run_id, `${changeId}-2`);
		assert.equal(retry.change_name, changeId);
		assert.equal(retry.previous_run_id, `${changeId}-1`);
		assert.equal(retry.current_phase, "start");
		assert.equal(retry.status, "active");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run retry rejects when latest run is rejected", () => {
	const tempRoot = makeTempDir("specflow-run-retry-rejected-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const first = startRun(repoPath, changeId);
		advancePhase(repoPath, first.run_id, "propose");
		advancePhase(repoPath, first.run_id, "check_scope");
		advancePhase(repoPath, first.run_id, "reject");

		const retry = runNodeCli(
			"specflow-run",
			["start", changeId, "--retry"],
			repoPath,
		);
		assert.notEqual(retry.status, 0);
		assert.match(retry.stderr, /Rejected changes cannot be retried/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run retry copies source and agents from prior run", () => {
	const tempRoot = makeTempDir("specflow-run-retry-copy-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/99",
			title: "Original source",
		});

		const first = startRun(repoPath, changeId, [
			"--source-file",
			sourceFile,
			"--agent-main",
			"myagent",
			"--agent-review",
			"myreviewer",
		]);
		advancePhase(repoPath, first.run_id, "propose");
		advancePhase(repoPath, first.run_id, "check_scope");
		advancePhase(repoPath, first.run_id, "decompose");

		const retry = startRun(repoPath, changeId, ["--retry"]);
		assert.equal(
			retry.source?.reference,
			"https://github.com/test/repo/issues/99",
		);
		// Read the full run state
		const status = runNodeCli(
			"specflow-run",
			["status", retry.run_id],
			repoPath,
		);
		const retryState = JSON.parse(status.stdout) as {
			agents: { main: string; review: string };
		};
		assert.equal(retryState.agents.main, "myagent");
		assert.equal(retryState.agents.review, "myreviewer");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Suspend/Resume tests ---

test("specflow-run suspend preserves current phase", () => {
	const tempRoot = makeTempDir("specflow-run-suspend-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");

		const suspend = runNodeCli("specflow-run", ["suspend", runId], repoPath);
		assert.equal(suspend.status, 0, suspend.stderr);
		const suspendJson = JSON.parse(suspend.stdout) as {
			current_phase: string;
			status: string;
			allowed_events: string[];
		};
		assert.equal(suspendJson.status, "suspended");
		assert.equal(suspendJson.current_phase, "proposal_draft");
		assert.deepEqual(suspendJson.allowed_events, ["resume"]);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run suspend rejects terminal runs", () => {
	const tempRoot = makeTempDir("specflow-run-suspend-terminal-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");
		advancePhase(repoPath, runId, "decompose");

		const suspend = runNodeCli("specflow-run", ["suspend", runId], repoPath);
		assert.notEqual(suspend.status, 0);
		assert.match(suspend.stderr, /Cannot suspend a terminal run/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run resume restores allowed events", () => {
	const tempRoot = makeTempDir("specflow-run-resume-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		advancePhase(repoPath, runId, "check_scope");

		runNodeCli("specflow-run", ["suspend", runId], repoPath);

		const resume = runNodeCli("specflow-run", ["resume", runId], repoPath);
		assert.equal(resume.status, 0, resume.stderr);
		const resumeJson = JSON.parse(resume.stdout) as {
			current_phase: string;
			status: string;
			allowed_events: string[];
		};
		assert.equal(resumeJson.status, "active");
		assert.equal(resumeJson.current_phase, "proposal_scope");
		assert.ok(resumeJson.allowed_events.includes("continue_proposal"));
		assert.ok(resumeJson.allowed_events.includes("suspend"));
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run advance rejects events when suspended", () => {
	const tempRoot = makeTempDir("specflow-run-advance-suspended-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");

		runNodeCli("specflow-run", ["suspend", runId], repoPath);

		const advance = runNodeCli(
			"specflow-run",
			["advance", runId, "check_scope"],
			repoPath,
		);
		assert.notEqual(advance.status, 0);
		assert.match(advance.stderr, /Run is suspended/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run start rejects when suspended run exists for change", () => {
	const tempRoot = makeTempDir("specflow-run-start-suspended-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");
		runNodeCli("specflow-run", ["suspend", runId], repoPath);

		const second = runNodeCli("specflow-run", ["start", changeId], repoPath);
		assert.notEqual(second.status, 0);
		assert.match(second.stderr, /Suspended run exists/);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Backward compatibility ---

test("specflow-run reads legacy run.json without run_id and previous_run_id", () => {
	const tempRoot = makeTempDir("specflow-run-legacy-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const legacyRunId = `${changeId}-1`;
		const runDir = join(repoPath, ".specflow/runs", legacyRunId);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(
			join(runDir, "run.json"),
			JSON.stringify(
				{
					change_name: changeId,
					current_phase: "proposal_draft",
					status: "active",
					allowed_events: ["check_scope", "reject"],
					source: null,
					project_id: "test/repo",
					repo_name: "test/repo",
					repo_path: repoPath,
					branch_name: "main",
					worktree_path: repoPath,
					agents: { main: "claude", review: "codex" },
					last_summary_path: null,
					created_at: "2025-01-01T00:00:00Z",
					updated_at: "2025-01-01T00:00:00Z",
					history: [],
				},
				null,
				2,
			),
			"utf8",
		);

		const status = runNodeCli(
			"specflow-run",
			["status", legacyRunId],
			repoPath,
		);
		assert.equal(status.status, 0, status.stderr);
		const statusJson = JSON.parse(status.stdout) as {
			run_id: string;
			previous_run_id: string | null;
			status: string;
		};
		assert.equal(statusJson.run_id, legacyRunId);
		assert.equal(statusJson.previous_run_id, null);
		assert.equal(statusJson.status, "active");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run reads legacy run.json and infers terminal status", () => {
	const tempRoot = makeTempDir("specflow-run-legacy-terminal-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const legacyRunId = `${changeId}-1`;
		const runDir = join(repoPath, ".specflow/runs", legacyRunId);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(
			join(runDir, "run.json"),
			JSON.stringify(
				{
					change_name: changeId,
					current_phase: "approved",
					allowed_events: [],
					source: null,
					project_id: "test/repo",
					repo_name: "test/repo",
					repo_path: repoPath,
					branch_name: "main",
					worktree_path: repoPath,
					agents: { main: "claude", review: "codex" },
					last_summary_path: null,
					created_at: "2025-01-01T00:00:00Z",
					updated_at: "2025-01-01T00:00:00Z",
					history: [],
				},
				null,
				2,
			),
			"utf8",
		);

		const status = runNodeCli(
			"specflow-run",
			["status", legacyRunId],
			repoPath,
		);
		assert.equal(status.status, 0, status.stderr);
		const statusJson = JSON.parse(status.stdout) as {
			run_id: string;
			status: string;
		};
		assert.equal(statusJson.run_id, legacyRunId);
		assert.equal(statusJson.status, "terminal");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Lifecycle event metadata ---

test("specflow-run suspend and resume appear in history", () => {
	const tempRoot = makeTempDir("specflow-run-lifecycle-history-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");

		runNodeCli("specflow-run", ["suspend", runId], repoPath);
		runNodeCli("specflow-run", ["resume", runId], repoPath);

		const status = runNodeCli("specflow-run", ["status", runId], repoPath);
		assert.equal(status.status, 0, status.stderr);
		const state = JSON.parse(status.stdout) as {
			history: { event: string; from: string; to: string }[];
		};
		const events = state.history.map((h) => h.event);
		assert.ok(events.includes("suspend"));
		assert.ok(events.includes("resume"));
		const suspendEntry = state.history.find((h) => h.event === "suspend")!;
		assert.equal(suspendEntry.from, "proposal_draft");
		assert.equal(suspendEntry.to, "proposal_draft");
	} finally {
		removeTempDir(tempRoot);
	}
});
