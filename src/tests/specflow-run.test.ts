import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createBareHome,
	createFetchIssueStub,
	createFixtureRepo,
	makeTempDir,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

function advancePhase(
	repoPath: string,
	changeId: string,
	event: string,
): { current_phase: string; allowed_events: string[] } {
	const result = runNodeCli(
		"specflow-run",
		["advance", changeId, event],
		repoPath,
	);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as {
		current_phase: string;
		allowed_events: string[];
	};
}

test("specflow-run supports lifecycle, issue metadata, and update-field", () => {
	const tempRoot = makeTempDir("specflow-run-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const stubPath = createFetchIssueStub(tempRoot);

		const start = runNodeCli(
			"specflow-run",
			[
				"start",
				changeId,
				"--issue-url",
				"https://github.com/test/repo/issues/71",
			],
			repoPath,
			{ SPECFLOW_FETCH_ISSUE: stubPath },
		);
		assert.equal(start.status, 0, start.stderr);
		const startJson = JSON.parse(start.stdout) as {
			current_phase: string;
			issue: { repo: string };
			allowed_events: string[];
		};
		assert.equal(startJson.current_phase, "start");
		assert.equal(startJson.issue.repo, "test/repo");
		assert.ok(startJson.allowed_events.includes("propose"));

		const advance = runNodeCli(
			"specflow-run",
			["advance", changeId, "propose"],
			repoPath,
		);
		assert.equal(advance.status, 0, advance.stderr);
		const advanceJson = JSON.parse(advance.stdout) as {
			current_phase: string;
			history: { event: string }[];
		};
		assert.equal(advanceJson.current_phase, "proposal_draft");
		assert.equal(advanceJson.history[0]?.event, "propose");

		const update = runNodeCli(
			"specflow-run",
			["update-field", changeId, "last_summary_path", "/tmp/summary.md"],
			repoPath,
		);
		assert.equal(update.status, 0, update.stderr);
		const updateJson = JSON.parse(update.stdout) as {
			last_summary_path: string;
		};
		assert.equal(updateJson.last_summary_path, "/tmp/summary.md");

		const getField = runNodeCli(
			"specflow-run",
			["get-field", changeId, "current_phase"],
			repoPath,
		);
		assert.equal(getField.status, 0, getField.stderr);
		assert.equal(JSON.parse(getField.stdout), "proposal_draft");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports the full happy path from start to approved", () => {
	const tempRoot = makeTempDir("specflow-run-happy-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const start = runNodeCli("specflow-run", ["start", changeId], repoPath);
		assert.equal(start.status, 0, start.stderr);
		const sequence: Array<[string, string]> = [
			["propose", "proposal_draft"],
			["check_scope", "proposal_scope"],
			["continue_proposal", "proposal_clarify"],
			["review_proposal", "proposal_review"],
			["proposal_review_approved", "proposal_validate"],
			["proposal_validated", "proposal_ready"],
			["accept_proposal", "design_draft"],
			["validate_design", "design_validate"],
			["design_validated", "design_review"],
			["design_review_approved", "design_ready"],
			["accept_design", "apply_draft"],
			["review_apply", "apply_review"],
			["apply_review_approved", "apply_ready"],
			["accept_apply", "approved"],
		];
		let current = "start";
		for (const [event, expectedPhase] of sequence) {
			const json = advancePhase(repoPath, changeId, event);
			assert.equal(
				json.current_phase,
				expectedPhase,
				`${current} --${event}--> ${expectedPhase}`,
			);
			current = expectedPhase;
		}
		const status = runNodeCli("specflow-run", ["status", changeId], repoPath);
		assert.equal(status.status, 0, status.stderr);
		const statusJson = JSON.parse(status.stdout) as {
			current_phase: string;
			allowed_events: string[];
			history: { event: string }[];
		};
		assert.equal(statusJson.current_phase, "approved");
		assert.deepEqual(statusJson.allowed_events, []);
		assert.equal(statusJson.history.length, sequence.length);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports proposal, design, and apply loop transitions", () => {
	const tempRoot = makeTempDir("specflow-run-loops-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		assert.equal(
			runNodeCli("specflow-run", ["start", changeId], repoPath).status,
			0,
		);
		advancePhase(repoPath, changeId, "propose");
		advancePhase(repoPath, changeId, "check_scope");
		advancePhase(repoPath, changeId, "continue_proposal");
		advancePhase(repoPath, changeId, "review_proposal");
		assert.equal(
			advancePhase(repoPath, changeId, "revise_proposal").current_phase,
			"proposal_clarify",
		);
		advancePhase(repoPath, changeId, "review_proposal");
		advancePhase(repoPath, changeId, "proposal_review_approved");
		assert.equal(
			advancePhase(repoPath, changeId, "revise_proposal").current_phase,
			"proposal_clarify",
		);
		advancePhase(repoPath, changeId, "review_proposal");
		advancePhase(repoPath, changeId, "proposal_review_approved");
		advancePhase(repoPath, changeId, "proposal_validated");
		advancePhase(repoPath, changeId, "accept_proposal");
		advancePhase(repoPath, changeId, "validate_design");
		assert.equal(
			advancePhase(repoPath, changeId, "revise_design").current_phase,
			"design_draft",
		);
		advancePhase(repoPath, changeId, "validate_design");
		advancePhase(repoPath, changeId, "design_validated");
		assert.equal(
			advancePhase(repoPath, changeId, "revise_design").current_phase,
			"design_draft",
		);
		advancePhase(repoPath, changeId, "validate_design");
		advancePhase(repoPath, changeId, "design_validated");
		advancePhase(repoPath, changeId, "design_review_approved");
		advancePhase(repoPath, changeId, "accept_design");
		advancePhase(repoPath, changeId, "review_apply");
		const applyLoop = advancePhase(repoPath, changeId, "revise_apply");
		assert.equal(applyLoop.current_phase, "apply_draft");
		assert.deepEqual(applyLoop.allowed_events, ["review_apply", "reject"]);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run supports decomposition as a terminal path", () => {
	const tempRoot = makeTempDir("specflow-run-decompose-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		assert.equal(
			runNodeCli("specflow-run", ["start", changeId], repoPath).status,
			0,
		);
		advancePhase(repoPath, changeId, "propose");
		advancePhase(repoPath, changeId, "check_scope");
		const json = advancePhase(repoPath, changeId, "decompose");
		assert.equal(json.current_phase, "decomposed");
		assert.deepEqual(json.allowed_events, []);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects invalid transitions and reports allowed events for detailed states", () => {
	const tempRoot = makeTempDir("specflow-run-invalid-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		assert.equal(
			runNodeCli("specflow-run", ["start", changeId], repoPath).status,
			0,
		);
		advancePhase(repoPath, changeId, "propose");
		advancePhase(repoPath, changeId, "check_scope");
		const invalid = runNodeCli(
			"specflow-run",
			["advance", changeId, "proposal_validated"],
			repoPath,
		);
		assert.notEqual(invalid.status, 0);
		assert.match(
			invalid.stderr,
			/Allowed events: continue_proposal, decompose, reject/,
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
		const startJson = JSON.parse(start.stdout) as {
			run_kind?: string;
			change_name: string | null;
			allowed_events: string[];
		};
		assert.equal(startJson.run_kind, "synthetic");
		assert.equal(startJson.change_name, null);
		assert.ok(startJson.allowed_events.includes("propose"));

		const advance = runNodeCli(
			"specflow-run",
			["advance", "_explore_20260409-010203", "explore_start"],
			repoPath,
		);
		assert.equal(advance.status, 0, advance.stderr);
		const advanceJson = JSON.parse(advance.stdout) as { current_phase: string };
		assert.equal(advanceJson.current_phase, "explore");

		const status = runNodeCli(
			"specflow-run",
			["status", "_explore_20260409-010203"],
			repoPath,
		);
		assert.equal(status.status, 0, status.stderr);
		const statusJson = JSON.parse(status.stdout) as { current_phase: string };
		assert.equal(statusJson.current_phase, "explore");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run rejects old run schema and removed revise event", () => {
	const tempRoot = makeTempDir("specflow-run-schema-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const runDir = join(repoPath, ".specflow/runs", changeId);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(
			join(runDir, "run.json"),
			JSON.stringify(
				{
					run_id: changeId,
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
			["status", changeId],
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
		const startJson = JSON.parse(start.stdout) as {
			current_phase: string;
			allowed_events: string[];
		};
		assert.equal(startJson.current_phase, "start");
		assert.ok(startJson.allowed_events.includes("propose"));
	} finally {
		removeTempDir(tempRoot);
	}
});
