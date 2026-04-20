import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	eventLogPath,
	tailEventsForRun,
	tailRunEvents,
} from "../lib/observation-event-reader.js";
import {
	autofixSnapshotPath,
	readAutofixSnapshotFile,
	readRunStateFile,
	readTaskGraphFile,
	runStatePath,
	selectActiveAutofixPhase,
	taskGraphPath,
} from "../lib/specflow-watch/artifact-readers.js";
import { resolveTrackedRun } from "../lib/specflow-watch/run-resolution.js";
import { parseRunJson, scanRuns } from "../lib/specflow-watch/run-scan.js";
import type { RunState } from "../types/contracts.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function run(
	overrides: Partial<RunState> & { run_id: string; change_name: string },
): RunState {
	const base = {
		current_phase: "apply_draft",
		status: "active" as const,
		allowed_events: [] as readonly string[],
		source: null,
		agents: { main: "claude", review: "codex" },
		created_at: "2026-04-19T00:00:00Z",
		updated_at: "2026-04-19T00:00:00Z",
		history: [] as readonly never[],
		project_id: "owner/repo",
		repo_name: "owner/repo",
		repo_path: "/tmp/repo",
		branch_name: overrides.change_name,
		worktree_path: "/tmp/repo",
		last_summary_path: null,
	};
	return { ...base, ...overrides } as RunState;
}

function seedRunJson(projectRoot: string, state: RunState): void {
	const dir = join(projectRoot, ".specflow/runs", state.run_id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "run.json"),
		`${JSON.stringify(state, null, 2)}\n`,
		"utf8",
	);
}

test("resolveTrackedRun: arg matches exact run_id", () => {
	const r1 = run({ run_id: "foo-1", change_name: "foo" });
	const r2 = run({ run_id: "foo-2", change_name: "foo" });
	const res = resolveTrackedRun({
		arg: "foo-1",
		branch: "foo",
		runs: [r1, r2],
	});
	assert.equal(res.ok, true);
	if (res.ok) assert.equal(res.run.run_id, "foo-1");
});

test("resolveTrackedRun: arg as change_name picks latest active by updated_at DESC", () => {
	const older = run({
		run_id: "foo-1",
		change_name: "foo",
		updated_at: "2026-04-19T10:00:00Z",
		created_at: "2026-04-19T09:00:00Z",
	});
	const newer = run({
		run_id: "foo-2",
		change_name: "foo",
		updated_at: "2026-04-19T12:00:00Z",
		created_at: "2026-04-19T09:00:00Z",
	});
	const res = resolveTrackedRun({
		arg: "foo",
		branch: null,
		runs: [older, newer],
	});
	assert.equal(res.ok, true);
	if (res.ok) assert.equal(res.run.run_id, "foo-2");
});

test("resolveTrackedRun: tie on updated_at breaks by created_at DESC", () => {
	const a = run({
		run_id: "foo-1",
		change_name: "foo",
		updated_at: "2026-04-19T12:00:00Z",
		created_at: "2026-04-19T09:00:00Z",
	});
	const b = run({
		run_id: "foo-2",
		change_name: "foo",
		updated_at: "2026-04-19T12:00:00Z",
		created_at: "2026-04-19T11:00:00Z",
	});
	const res = resolveTrackedRun({
		arg: "foo",
		branch: null,
		runs: [a, b],
	});
	assert.equal(res.ok, true);
	if (res.ok) assert.equal(res.run.run_id, "foo-2");
});

test("resolveTrackedRun: arg change_name ignores non-active runs", () => {
	const terminal = run({
		run_id: "foo-1",
		change_name: "foo",
		status: "terminal",
		updated_at: "2026-04-19T20:00:00Z",
	});
	const active = run({
		run_id: "foo-2",
		change_name: "foo",
		status: "active",
		updated_at: "2026-04-19T10:00:00Z",
	});
	const res = resolveTrackedRun({
		arg: "foo",
		branch: null,
		runs: [terminal, active],
	});
	assert.equal(res.ok, true);
	if (res.ok) assert.equal(res.run.run_id, "foo-2");
});

test("resolveTrackedRun: no arg uses branch as change_name", () => {
	const r = run({ run_id: "foo-1", change_name: "foo", status: "active" });
	const res = resolveTrackedRun({ arg: null, branch: "foo", runs: [r] });
	assert.equal(res.ok, true);
	if (res.ok) assert.equal(res.run.run_id, "foo-1");
});

test("resolveTrackedRun: unknown arg returns no_active_run_for_change", () => {
	const r = run({ run_id: "foo-1", change_name: "foo", status: "active" });
	const res = resolveTrackedRun({
		arg: "bar",
		branch: "foo",
		runs: [r],
	});
	assert.equal(res.ok, false);
	if (!res.ok) assert.equal(res.error.kind, "no_active_run_for_change");
});

test("resolveTrackedRun: empty branch with no arg errors", () => {
	const r = run({ run_id: "foo-1", change_name: "foo", status: "active" });
	const res = resolveTrackedRun({ arg: null, branch: "", runs: [r] });
	assert.equal(res.ok, false);
	if (!res.ok) assert.equal(res.error.kind, "branch_unknown");
});

test("resolveTrackedRun: branch with no matching active run", () => {
	const terminal = run({
		run_id: "foo-1",
		change_name: "foo",
		status: "terminal",
	});
	const res = resolveTrackedRun({
		arg: null,
		branch: "foo",
		runs: [terminal],
	});
	assert.equal(res.ok, false);
	if (!res.ok) assert.equal(res.error.kind, "no_active_run_for_branch");
});

test("parseRunJson: accepts valid RunState; rejects missing fields and torn JSON", () => {
	const good = JSON.stringify(run({ run_id: "x-1", change_name: "x" }));
	assert.ok(parseRunJson(good));
	assert.equal(parseRunJson("not json"), null);
	assert.equal(parseRunJson("{}"), null);
	assert.equal(parseRunJson('{"run_id":"x-1"}'), null);
});

test("scanRuns: reads every parseable run.json and skips unreadable / malformed ones", () => {
	const root = makeTempDir("specflow-watch-scan-");
	try {
		const base = join(root, ".specflow/runs");
		mkdirSync(base, { recursive: true });

		const a = run({ run_id: "a-1", change_name: "a" });
		seedRunJson(root, a);

		const b = run({ run_id: "b-1", change_name: "b" });
		seedRunJson(root, b);

		const brokenDir = join(base, "broken-1");
		mkdirSync(brokenDir, { recursive: true });
		writeFileSync(join(brokenDir, "run.json"), "not json", "utf8");

		const missingDir = join(base, "no-run-json-1");
		mkdirSync(missingDir, { recursive: true });

		const scanned = scanRuns(root);
		const ids = scanned.map((r) => r.run_id).sort();
		assert.deepEqual(ids, ["a-1", "b-1"]);
	} finally {
		removeTempDir(root);
	}
});

test("scanRuns: returns empty array when runs dir is absent", () => {
	const root = makeTempDir("specflow-watch-scan-empty-");
	try {
		assert.deepEqual(scanRuns(root), []);
	} finally {
		removeTempDir(root);
	}
});

test("readRunStateFile: absent / unreadable / ok", () => {
	const root = makeTempDir("specflow-watch-read-run-");
	try {
		const absent = readRunStateFile(root, "missing-1");
		assert.equal(absent.kind, "absent");

		const state = run({ run_id: "x-1", change_name: "x" });
		seedRunJson(root, state);
		const ok = readRunStateFile(root, "x-1");
		assert.equal(ok.kind, "ok");
		if (ok.kind === "ok") assert.equal(ok.value.run_id, "x-1");

		assert.ok(runStatePath(root, "x-1").endsWith("x-1/run.json"));

		const broken = join(root, ".specflow/runs/broken-1");
		mkdirSync(broken, { recursive: true });
		writeFileSync(join(broken, "run.json"), "{not json", "utf8");
		const bad = readRunStateFile(root, "broken-1");
		assert.equal(bad.kind, "malformed");
	} finally {
		removeTempDir(root);
	}
});

test("readAutofixSnapshotFile: absent when file missing, malformed when broken, ok when valid", () => {
	const root = makeTempDir("specflow-watch-autofix-");
	try {
		const absent = readAutofixSnapshotFile(root, "x-1", "design_review");
		assert.equal(absent.kind, "absent");

		const p = autofixSnapshotPath(root, "x-1", "design_review");
		mkdirSync(join(root, ".specflow/runs/x-1"), { recursive: true });
		writeFileSync(p, "not json", "utf8");
		const mal = readAutofixSnapshotFile(root, "x-1", "design_review");
		assert.equal(mal.kind, "malformed");

		const snap = {
			schema_version: 1,
			run_id: "x-1",
			change_id: "x",
			phase: "design_review",
			round_index: 1,
			max_rounds: 4,
			loop_state: "awaiting_review",
			terminal_outcome: null,
			counters: {
				unresolvedCriticalHigh: 0,
				totalOpen: 0,
				resolvedThisRound: 0,
				newThisRound: 0,
				severitySummary: {},
			},
			heartbeat_at: "2026-04-19T00:00:00Z",
			ledger_round_id: "round-1",
		};
		writeFileSync(p, JSON.stringify(snap), "utf8");
		const ok = readAutofixSnapshotFile(root, "x-1", "design_review");
		assert.equal(ok.kind, "ok");
	} finally {
		removeTempDir(root);
	}
});

test("selectActiveAutofixPhase: maps review gates only, else null", () => {
	assert.equal(selectActiveAutofixPhase("design_review"), "design_review");
	assert.equal(selectActiveAutofixPhase("apply_review"), "apply_review");
	assert.equal(selectActiveAutofixPhase("apply_draft"), null);
	assert.equal(selectActiveAutofixPhase("design_ready"), null);
	assert.equal(selectActiveAutofixPhase("terminal"), null);
});

test("readTaskGraphFile: absent / malformed / ok", () => {
	const root = makeTempDir("specflow-watch-task-graph-");
	try {
		const absent = readTaskGraphFile(root, "x");
		assert.equal(absent.kind, "absent");

		const p = taskGraphPath(root, "x");
		mkdirSync(join(root, "openspec/changes/x"), { recursive: true });
		writeFileSync(p, "not json", "utf8");
		const mal = readTaskGraphFile(root, "x");
		assert.equal(mal.kind, "malformed");

		const graph = {
			version: "1.0",
			change_id: "x",
			bundles: [
				{
					id: "b1",
					title: "B1",
					goal: "goal",
					depends_on: [],
					inputs: [],
					outputs: [],
					status: "pending",
					tasks: [{ id: "1", title: "t1", status: "pending" }],
					owner_capabilities: [],
				},
			],
			generated_at: "2026-04-19T00:00:00Z",
			generated_from: "design.md",
		};
		writeFileSync(p, JSON.stringify(graph), "utf8");
		const ok = readTaskGraphFile(root, "x");
		assert.equal(ok.kind, "ok");
		if (ok.kind === "ok") assert.equal(ok.value.bundles.length, 1);
	} finally {
		removeTempDir(root);
	}
});

test("tailEventsForRun: empty / missing log returns []", () => {
	const root = makeTempDir("specflow-watch-events-");
	try {
		assert.deepEqual(tailEventsForRun(eventLogPath(root, "x-1"), "x-1", 5), []);
	} finally {
		removeTempDir(root);
	}
});

test("tailEventsForRun: filters by run_id and returns last N in order", () => {
	const root = makeTempDir("specflow-watch-events-filter-");
	try {
		const dir = join(root, ".specflow/runs/x-1");
		mkdirSync(dir, { recursive: true });
		const log = join(dir, "events.jsonl");
		const lines = [
			JSON.stringify({ event_id: "e1", run_id: "x-1", event_kind: "a" }),
			JSON.stringify({ event_id: "e2", run_id: "other", event_kind: "x" }),
			JSON.stringify({ event_id: "e3", run_id: "x-1", event_kind: "b" }),
			JSON.stringify({ event_id: "e4", run_id: "x-1", event_kind: "c" }),
			JSON.stringify({ event_id: "e5", run_id: "x-1", event_kind: "d" }),
			// torn line (simulate crashed writer)
			'{"event_id":"e6","run_id":"x-1"',
		];
		writeFileSync(log, `${lines.join("\n")}\n`, "utf8");
		const got = tailRunEvents(root, "x-1", 3);
		assert.equal(got.length, 3);
		assert.deepEqual(
			got.map((e) => e.event_id),
			["e3", "e4", "e5"],
		);
	} finally {
		removeTempDir(root);
	}
});

test("tailEventsForRun: n == 0 returns [] without reading", () => {
	assert.deepEqual(tailEventsForRun("/does/not/exist", "x", 0), []);
});
