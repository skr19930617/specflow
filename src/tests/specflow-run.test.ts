// specflow-run CLI smoke tests.
//
// Per `openspec/specs/workflow-run-state/spec.md` ("CLI smoke tests remain
// for wiring"), this file intentionally keeps only tests that exercise the
// CLI-layer wiring concerns: argv parsing, workflow-JSON discovery,
// process I/O mapping, and legacy on-disk run-state compatibility. All
// behavioral assertions about state-machine transitions, suspend/resume
// guards, and retry semantics live in `src/tests/core-*.test.ts` and run
// against in-memory stores.

import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import type { ObservationEvent } from "../types/observation-events.js";
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

/** Read the observation events.jsonl for a given run under a repo's .specflow/runs. */
function readRunEvents(
	repoPath: string,
	runId: string,
): readonly ObservationEvent[] {
	const path = join(repoPath, ".specflow/runs", runId, "events.jsonl");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as ObservationEvent);
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

// --- Smoke: argv routing + end-to-end stdout shape -------------------------

test("specflow-run start emits a well-formed initial run-state JSON", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-start-");
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

test("specflow-run drives the full happy path from start to approved end-to-end", () => {
	// Integration smoke: argv parsing → workflow JSON discovery → fs store →
	// core transitions → stdout JSON mapping for each of the seven commands.
	const tempRoot = makeTempDir("specflow-run-smoke-happy-");
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
			["spec_validated", "spec_verify"],
			["spec_verified", "spec_ready"],
			["accept_spec", "design_draft"],
			["review_design", "design_review"],
			["design_review_approved", "design_ready"],
			["accept_design", "apply_draft"],
			["review_apply", "apply_review"],
			["apply_review_approved", "apply_ready"],
			["accept_apply", "approved"],
		];
		for (const [event, expectedPhase] of sequence) {
			const json = advancePhase(repoPath, runId, event);
			assert.equal(json.current_phase, expectedPhase, event);
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

test("specflow-run exercises update-field and get-field via argv + stdout JSON", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-fields-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/71",
			title: "Stub issue",
		});
		const start = startRun(repoPath, changeId, ["--source-file", sourceFile]);
		const runId = start.run_id;
		assert.equal(start.source?.provider, "github");

		const update = runNodeCli(
			"specflow-run",
			["update-field", runId, "last_summary_path", "/tmp/summary.md"],
			repoPath,
		);
		assert.equal(update.status, 0, update.stderr);
		assert.equal(
			(JSON.parse(update.stdout) as { last_summary_path: string })
				.last_summary_path,
			"/tmp/summary.md",
		);

		const getField = runNodeCli(
			"specflow-run",
			["get-field", runId, "current_phase"],
			repoPath,
		);
		assert.equal(getField.status, 0, getField.stderr);
		assert.equal(JSON.parse(getField.stdout), "start");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run suspend and resume write history entries through the CLI", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-suspend-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;
		advancePhase(repoPath, runId, "propose");

		const suspend = runNodeCli("specflow-run", ["suspend", runId], repoPath);
		assert.equal(suspend.status, 0, suspend.stderr);
		const resume = runNodeCli("specflow-run", ["resume", runId], repoPath);
		assert.equal(resume.status, 0, resume.stderr);

		const status = runNodeCli("specflow-run", ["status", runId], repoPath);
		const state = JSON.parse(status.stdout) as {
			history: { event: string; from: string; to: string }[];
		};
		const events = state.history.map((h) => h.event);
		assert.ok(events.includes("suspend"));
		assert.ok(events.includes("resume"));
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Smoke: argv validation + CLI-only failures ---------------------------

test("specflow-run start rejects the removed --issue-url option with exit 1 stderr", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-issue-url-");
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

test("specflow-run start returns not_in_git_repo JSON when invoked outside git", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-nogit-");
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

test("specflow-run routes a representative core error to stderr with exit 1", () => {
	// Covers the Result→stderr+exit mapping in the wiring layer.
	const tempRoot = makeTempDir("specflow-run-smoke-missing-");
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
		assert.equal(start.status, 1);
		assert.match(start.stderr, /no OpenSpec proposal found/);
		assert.equal(start.stdout, "");
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Smoke: state-machine.json discovery fallback -------------------------

test("specflow-run falls back to module-local workflow when project and installed copies are absent", () => {
	const tempRoot = makeTempDir("specflow-run-smoke-module-workflow-");
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

// --- Legacy run.json backward compatibility -------------------------------
// These tests exercise the on-disk compatibility path handled by
// run-store-ops.readRunState — it is invoked from core but the fixtures
// are on-disk so the CLI layer is the natural place to assert the
// end-to-end path.

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

// --- Gate record persistence regression tests (F05) -----------------------

test("specflow-run writes gate records on disk when entering an approval gate phase", () => {
	const tempRoot = makeTempDir("specflow-run-gate-persist-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;

		// Advance through phases until reaching spec_ready (approval gate).
		const phasesBeforeGate: Array<[string, string]> = [
			["propose", "proposal_draft"],
			["check_scope", "proposal_scope"],
			["continue_proposal", "proposal_clarify"],
			["challenge_proposal", "proposal_challenge"],
			["reclarify", "proposal_reclarify"],
			["accept_proposal", "spec_draft"],
			["validate_spec", "spec_validate"],
			["spec_validated", "spec_verify"],
			["spec_verified", "spec_ready"],
		];
		for (const [event, expectedPhase] of phasesBeforeGate) {
			const json = advancePhase(repoPath, runId, event);
			assert.equal(json.current_phase, expectedPhase, event);
		}

		// Verify gate record files exist on disk.
		const recordsDir = join(repoPath, ".specflow/runs", runId, "records");
		assert.ok(existsSync(recordsDir), "records directory should exist");
		const files = readdirSync(recordsDir).filter(
			(f: string) => f.endsWith(".json") && !f.startsWith("."),
		);
		assert.ok(files.length > 0, "at least one gate record should be written");

		// The record file should be gate-shaped (gate_id, gate_kind) not legacy-shaped.
		const firstFile = readFileSync(resolve(recordsDir, files[0]), "utf8");
		const parsed = JSON.parse(firstFile) as Record<string, unknown>;
		assert.equal(typeof parsed.gate_id, "string", "should have gate_id");
		assert.equal(typeof parsed.gate_kind, "string", "should have gate_kind");
		assert.equal(parsed.status, "pending", "gate should be pending");
		assert.equal(parsed.gate_kind, "approval", "should be an approval gate");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run preserves gate history when approval is resolved (no physical delete)", () => {
	const tempRoot = makeTempDir("specflow-run-gate-history-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;

		// Advance to spec_ready (creates pending approval gate).
		const phases: string[] = [
			"propose",
			"check_scope",
			"continue_proposal",
			"challenge_proposal",
			"reclarify",
			"accept_proposal",
			"validate_spec",
			"spec_validated",
			"spec_verified",
		];
		for (const event of phases) {
			advancePhase(repoPath, runId, event);
		}

		const recordsDir = join(repoPath, ".specflow/runs", runId, "records");
		const filesBefore = readdirSync(recordsDir).filter(
			(f: string) => f.endsWith(".json") && !f.startsWith("."),
		);
		assert.ok(
			filesBefore.length > 0,
			"should have gate record(s) before resolve",
		);

		// Accept spec → resolves the approval gate and enters design_draft (new phase).
		advancePhase(repoPath, runId, "accept_spec");

		// All original record files should still exist (not deleted).
		for (const file of filesBefore) {
			assert.ok(
				existsSync(resolve(recordsDir, file)),
				`gate record ${file} should still exist after resolution`,
			);
		}

		// The resolved gate should have status "resolved", not be deleted.
		const resolvedContent = readFileSync(
			resolve(recordsDir, filesBefore[0]),
			"utf8",
		);
		const resolved = JSON.parse(resolvedContent) as Record<string, unknown>;
		assert.equal(
			resolved.status,
			"resolved",
			"gate should be resolved, not deleted",
		);
		assert.equal(resolved.resolved_response, "accept");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run advance rejects unmigrated legacy records with a clear error", () => {
	const tempRoot = makeTempDir("specflow-run-unmigrated-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const startJson = startRun(repoPath, changeId);
		const runId = startJson.run_id;

		// Plant a legacy-shaped record file in the records directory.
		const recordsDir = join(repoPath, ".specflow/runs", runId, "records");
		mkdirSync(recordsDir, { recursive: true });
		writeFileSync(
			join(recordsDir, "approval-legacy-1.json"),
			JSON.stringify({
				record_id: "approval-legacy-1",
				record_kind: "approval",
				run_id: runId,
				phase_from: "spec_ready",
				phase_to: "design_draft",
				status: "pending",
				requested_at: "2026-01-01T00:00:00Z",
				decided_at: null,
				decision_actor: null,
				event_ids: [],
			}),
			"utf8",
		);

		// Advance should fail because the gate store detects legacy records.
		const result = runNodeCli(
			"specflow-run",
			["advance", runId, "propose"],
			repoPath,
		);
		assert.notEqual(result.status, 0, "should fail on unmigrated records");
		assert.match(
			result.stderr,
			/specflow-migrate-records/,
			"error should mention migration command",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

// --- Integration: observation events.jsonl through CLI ---------------------

test("specflow-run start writes run_started to events.jsonl", () => {
	const tempRoot = makeTempDir("specflow-run-obs-start-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const events = readRunEvents(repoPath, state.run_id);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.event_kind, "run_started");
		assert.equal(events[0]?.run_id, state.run_id);
		assert.equal(events[0]?.sequence, 1);
		assert.equal(events[0]?.target_phase, "start");
		assert.equal(events[0]?.source_phase, null);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run advance writes phase events to events.jsonl in order", () => {
	const tempRoot = makeTempDir("specflow-run-obs-advance-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const runId = state.run_id;
		// "start" → "proposal_draft": only phase_entered (no phase_completed from start).
		advancePhase(repoPath, runId, "propose");
		const afterPropose = readRunEvents(repoPath, runId);
		const kinds1 = afterPropose.map((e) => e.event_kind);
		assert.deepEqual(kinds1, ["run_started", "phase_entered"]);
		assert.equal(afterPropose[1]?.target_phase, "proposal_draft");
		// "proposal_draft" → "proposal_scope": phase_completed + phase_entered.
		advancePhase(repoPath, runId, "check_scope");
		const afterScope = readRunEvents(repoPath, runId);
		const kinds2 = afterScope.map((e) => e.event_kind);
		assert.deepEqual(kinds2, [
			"run_started",
			"phase_entered",
			"phase_completed",
			"phase_entered",
		]);
		// Sequences are monotonically increasing.
		const seqs = afterScope.map((e) => e.sequence);
		for (let i = 1; i < seqs.length; i++) {
			assert.ok(
				(seqs[i] ?? 0) > (seqs[i - 1] ?? 0),
				`sequence ${seqs[i]} should be > ${seqs[i - 1]}`,
			);
		}
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run full happy path writes run_terminal at the end", () => {
	const tempRoot = makeTempDir("specflow-run-obs-terminal-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const runId = state.run_id;
		const sequence: string[] = [
			"propose",
			"check_scope",
			"continue_proposal",
			"challenge_proposal",
			"reclarify",
			"accept_proposal",
			"validate_spec",
			"spec_validated",
			"spec_verified",
			"accept_spec",
			"review_design",
			"design_review_approved",
			"accept_design",
			"review_apply",
			"apply_review_approved",
			"accept_apply",
		];
		for (const event of sequence) {
			advancePhase(repoPath, runId, event);
		}
		const events = readRunEvents(repoPath, runId);
		const last = events[events.length - 1];
		assert.equal(last?.event_kind, "run_terminal");
		assert.equal(last?.target_phase, "approved");
		if (last?.event_kind === "run_terminal") {
			assert.equal(last.payload.status, "approved");
		}
		// Verify all events have the twelve required envelope fields.
		const requiredFields = [
			"event_id",
			"event_kind",
			"run_id",
			"change_id",
			"sequence",
			"timestamp",
			"source_phase",
			"target_phase",
			"causal_context",
			"gate_ref",
			"artifact_ref",
			"bundle_ref",
		] as const;
		for (const evt of events) {
			for (const field of requiredFields) {
				assert.ok(
					field in evt,
					`event ${evt.event_kind} seq=${evt.sequence} missing '${field}'`,
				);
			}
		}
		// The full happy path includes gate resolution (approval gates at
		// spec_ready, design review, apply review). Verify gate events are
		// present in the observation stream.
		const kinds = events.map((e) => e.event_kind);
		assert.ok(
			kinds.includes("gate_resolved"),
			"happy path should include gate_resolved events for approval gates",
		);
		assert.ok(
			kinds.includes("gate_opened"),
			"happy path should include gate_opened events",
		);
		// gate_resolved events must carry a non-null gate_ref.
		for (const evt of events) {
			if (
				evt.event_kind === "gate_resolved" ||
				evt.event_kind === "gate_rejected"
			) {
				assert.ok(
					evt.gate_ref !== null,
					`${evt.event_kind} at seq=${evt.sequence} must have non-null gate_ref`,
				);
			}
		}
		// gate_resolved must always precede the phase_completed it causes.
		for (let i = 0; i < events.length; i++) {
			const evt = events[i];
			if (evt?.event_kind !== "gate_resolved") continue;
			// Find the next phase_completed after this gate_resolved.
			const nextPhaseCompleted = events
				.slice(i + 1)
				.find((e) => e.event_kind === "phase_completed");
			if (nextPhaseCompleted) {
				assert.ok(
					nextPhaseCompleted.sequence > evt.sequence,
					"gate_resolved must precede subsequent phase_completed",
				);
			}
		}
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run suspend + resume write observation events to events.jsonl", () => {
	const tempRoot = makeTempDir("specflow-run-obs-suspend-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const runId = state.run_id;
		advancePhase(repoPath, runId, "propose");

		runNodeCli("specflow-run", ["suspend", runId], repoPath);
		runNodeCli("specflow-run", ["resume", runId], repoPath);

		const events = readRunEvents(repoPath, runId);
		const kinds = events.map((e) => e.event_kind);
		assert.ok(kinds.includes("run_suspended"), "should include run_suspended");
		assert.ok(kinds.includes("run_resumed"), "should include run_resumed");
		// run_suspended comes before run_resumed.
		const suspIdx = kinds.indexOf("run_suspended");
		const resIdx = kinds.indexOf("run_resumed");
		assert.ok(suspIdx < resIdx, "suspended should precede resumed");
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run advance with gate resolution emits gate_resolved and threads gate_ref", () => {
	const tempRoot = makeTempDir("specflow-run-obs-gate-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const runId = state.run_id;
		// Drive to accept_spec which resolves the approval gate at spec_ready.
		const toSpec: string[] = [
			"propose",
			"check_scope",
			"continue_proposal",
			"challenge_proposal",
			"reclarify",
			"accept_proposal",
			"validate_spec",
			"spec_validated",
			"spec_verified",
		];
		for (const event of toSpec) {
			advancePhase(repoPath, runId, event);
		}
		// Now at spec_ready; accept_spec triggers approval gate resolution → advance.
		advancePhase(repoPath, runId, "accept_spec");
		const events = readRunEvents(repoPath, runId);
		const kinds = events.map((e) => e.event_kind);
		// The workflow creates an approval gate at spec_ready. accept_spec
		// resolves it. Verify gate_resolved is present and gate_ref is threaded.
		const gateResolved = events.filter((e) => e.event_kind === "gate_resolved");
		assert.ok(
			gateResolved.length > 0,
			"accept_spec should emit gate_resolved for the approval gate at spec_ready",
		);
		const gateRef = gateResolved[0]?.gate_ref;
		assert.ok(gateRef, "gate_resolved should have a gate_ref");
		// Find subsequent phase events caused by this gate resolution.
		const gateIdx = events.indexOf(gateResolved[0]!);
		const subsequent = events.slice(gateIdx + 1);
		for (const sub of subsequent) {
			if (
				sub.event_kind === "phase_completed" ||
				sub.event_kind === "phase_entered" ||
				sub.event_kind === "run_terminal"
			) {
				assert.equal(
					sub.gate_ref,
					gateRef,
					`${sub.event_kind} should carry gate_ref from causing gate`,
				);
			}
		}
		// Event stream is non-empty and well-ordered.
		assert.ok(events.length > 0, "events.jsonl should not be empty");
		assert.ok(
			kinds.includes("phase_entered"),
			"should include phase_entered events",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run advance resolves a review_decision gate and emits gate_rejected to events.jsonl", () => {
	const tempRoot = makeTempDir("specflow-run-obs-review-decision-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const state = startRun(repoPath, changeId);
		const runId = state.run_id;
		// Drive to design_review.
		const toDesignReview: string[] = [
			"propose",
			"check_scope",
			"continue_proposal",
			"challenge_proposal",
			"reclarify",
			"accept_proposal",
			"validate_spec",
			"spec_validated",
			"spec_verified",
			"accept_spec",
			"review_design",
		];
		for (const event of toDesignReview) {
			advancePhase(repoPath, runId, event);
		}
		// Manually write a review_decision gate record at design_review.
		const gateId = `review_decision-${runId}-design_review-1`;
		const gateRecord = {
			gate_id: gateId,
			gate_kind: "review_decision",
			run_id: runId,
			originating_phase: "design_review",
			status: "pending",
			reason: "Design review round completed",
			payload: {
				kind: "review_decision",
				review_round_id: "design_review-round-1",
				findings: [],
				reviewer_actor: "ai-agent",
				reviewer_actor_id: "codex",
				approval_binding: "advisory",
			},
			eligible_responder_roles: ["human-author"],
			allowed_responses: ["accept", "reject", "request_changes"],
			created_at: "2026-04-19T00:00:00Z",
			resolved_at: null,
			decision_actor: null,
			resolved_response: null,
			event_ids: [],
		};
		const recordsDir = join(repoPath, ".specflow/runs", runId, "records");
		mkdirSync(recordsDir, { recursive: true });
		writeFileSync(
			join(recordsDir, `${gateId}.json`),
			JSON.stringify(gateRecord, null, 2),
		);
		// Advance with "reject" which maps to review_decision response "reject".
		// This resolves the gate and transitions to "rejected" terminal state.
		const result = runNodeCli(
			"specflow-run",
			["advance", runId, "reject"],
			repoPath,
		);
		assert.equal(result.status, 0, result.stderr);
		const events = readRunEvents(repoPath, runId);
		const kinds = events.map((e) => e.event_kind);
		// gate_rejected must be present (review_decision + reject → gate_rejected).
		assert.ok(
			kinds.includes("gate_rejected"),
			`expected gate_rejected in events: ${kinds.join(", ")}`,
		);
		// gate_rejected must precede the phase_completed it causes.
		// Use the LAST occurrence of phase_completed (from the reject transition),
		// not the first one (from earlier advances).
		const rejIdx = kinds.indexOf("gate_rejected");
		const compIdx = kinds.lastIndexOf("phase_completed");
		assert.ok(
			compIdx === -1 || rejIdx < compIdx,
			"gate_rejected must precede its caused phase_completed",
		);
		// gate_rejected must carry the gate_ref.
		const rejEvent = events.find((e) => e.event_kind === "gate_rejected");
		assert.equal(rejEvent?.gate_ref, gateId);
		// Downstream phase/lifecycle events must also carry gate_ref.
		for (const evt of events.slice(rejIdx + 1)) {
			if (
				evt.event_kind === "phase_completed" ||
				evt.event_kind === "phase_entered" ||
				evt.event_kind === "run_terminal"
			) {
				assert.equal(
					evt.gate_ref,
					gateId,
					`${evt.event_kind} should carry gate_ref from causing review_decision gate`,
				);
			}
		}
		// run_terminal should be emitted since "rejected" is terminal.
		assert.ok(
			kinds.includes("run_terminal"),
			"rejecting via review_decision gate should produce run_terminal",
		);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("specflow-run start --run-kind synthetic writes run_started to events.jsonl", () => {
	const tempRoot = makeTempDir("specflow-run-obs-synthetic-");
	try {
		const { repoPath } = createFixtureRepo(tempRoot);
		const syntheticRunId = "synthetic-obs-test-1";
		const result = runNodeCli(
			"specflow-run",
			["start", syntheticRunId, "--run-kind", "synthetic"],
			repoPath,
		);
		assert.equal(result.status, 0, result.stderr);
		const events = readRunEvents(repoPath, syntheticRunId);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.event_kind, "run_started");
		assert.equal(events[0]?.run_id, syntheticRunId);
		assert.equal(events[0]?.sequence, 1);
	} finally {
		removeTempDir(tempRoot);
	}
});
