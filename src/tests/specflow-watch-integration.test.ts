import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tailRunEvents } from "../lib/observation-event-reader.js";
import {
	readAutofixSnapshotFile,
	readRunStateFile,
	readTaskGraphFile,
	selectActiveAutofixPhase,
} from "../lib/specflow-watch/artifact-readers.js";
import {
	buildEventsView,
	buildHeader,
	buildReviewView,
	buildTaskGraphView,
	renderFrame,
	stripAnsi,
	terminalBannerFor,
	topologicalOrder,
} from "../lib/watch-renderer/index.js";
import type { RunState } from "../types/contracts.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

// End-to-end model-build test: seed a run directory, render a frame, mutate
// the underlying artifacts, re-render, and assert the rendered text reflects
// the mutation. The filesystem-watch layer is covered independently in
// watch-fs.test.ts; here we exercise the read+render pipeline.

interface SeedOptions {
	readonly runId: string;
	readonly changeName: string;
	readonly currentPhase: string;
	readonly status: string;
}

function seedRun(root: string, opts: SeedOptions): RunState {
	const runDir = join(root, ".specflow/runs", opts.runId);
	mkdirSync(runDir, { recursive: true });
	const run: RunState = {
		run_id: opts.runId,
		change_name: opts.changeName,
		current_phase: opts.currentPhase,
		status: opts.status as RunState["status"],
		allowed_events: [],
		source: null,
		agents: { main: "claude", review: "codex" },
		created_at: "2026-04-19T00:00:00Z",
		updated_at: "2026-04-19T00:00:00Z",
		history: [],
		project_id: "owner/repo",
		repo_name: "owner/repo",
		repo_path: root,
		branch_name: opts.changeName,
		worktree_path: root,
		last_summary_path: null,
	};
	writeFileSync(
		join(runDir, "run.json"),
		`${JSON.stringify(run, null, 2)}\n`,
		"utf8",
	);
	return run;
}

function writeTaskGraph(
	root: string,
	changeName: string,
	bundles: ReadonlyArray<{
		id: string;
		depends_on: readonly string[];
		status: "pending" | "in_progress" | "done" | "skipped";
		tasks: ReadonlyArray<{
			id: string;
			status: "pending" | "in_progress" | "done" | "skipped";
		}>;
	}>,
): void {
	const dir = join(root, "openspec/changes", changeName);
	mkdirSync(dir, { recursive: true });
	const graph = {
		version: "1.0",
		change_id: changeName,
		bundles: bundles.map((b) => ({
			id: b.id,
			title: `Bundle ${b.id}`,
			goal: `goal ${b.id}`,
			depends_on: b.depends_on,
			inputs: [],
			outputs: [],
			status: b.status,
			tasks: b.tasks.map((t) => ({
				id: t.id,
				title: `Task ${t.id}`,
				status: t.status,
			})),
			owner_capabilities: [],
		})),
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	writeFileSync(
		join(dir, "task-graph.json"),
		`${JSON.stringify(graph, null, 2)}\n`,
		"utf8",
	);
}

function writeAutofixSnapshot(
	root: string,
	runId: string,
	phase: "design_review" | "apply_review",
	counters: {
		readonly round_index: number;
		readonly max_rounds: number;
		readonly loop_state: string;
		readonly high: number;
		readonly medium: number;
	},
): void {
	const dir = join(root, ".specflow/runs", runId);
	mkdirSync(dir, { recursive: true });
	const snap = {
		schema_version: 1,
		run_id: runId,
		change_id: runId.split("-")[0],
		phase,
		round_index: counters.round_index,
		max_rounds: counters.max_rounds,
		loop_state: counters.loop_state,
		terminal_outcome: null,
		counters: {
			unresolvedCriticalHigh: counters.high,
			totalOpen: counters.high + counters.medium,
			resolvedThisRound: 0,
			newThisRound: 0,
			severitySummary: {
				HIGH: counters.high,
				MEDIUM: counters.medium,
			},
		},
		heartbeat_at: "2026-04-19T00:00:00Z",
		ledger_round_id: `round-${counters.round_index}`,
	};
	writeFileSync(
		join(dir, `autofix-progress-${phase}.json`),
		`${JSON.stringify(snap)}\n`,
		"utf8",
	);
}

function writeEvents(
	root: string,
	runId: string,
	events: ReadonlyArray<{
		event_id: string;
		event_kind: string;
		run_id?: string;
		timestamp?: string;
	}>,
): void {
	const dir = join(root, ".specflow/runs", runId);
	mkdirSync(dir, { recursive: true });
	const lines = events
		.map((e) => JSON.stringify({ ...e, run_id: e.run_id ?? runId }))
		.join("\n");
	writeFileSync(join(dir, "events.jsonl"), `${lines}\n`, "utf8");
}

function buildModelFor(root: string, run: RunState) {
	const runRead = readRunStateFile(root, run.run_id);
	const current = runRead.kind === "ok" ? runRead.value : run;
	const selected = selectActiveAutofixPhase(current.current_phase);
	const reviewRead = selected
		? readAutofixSnapshotFile(root, run.run_id, selected)
		: { kind: "absent" as const };
	const taskGraphRead = current.change_name
		? readTaskGraphFile(root, current.change_name)
		: { kind: "absent" as const };
	const events = tailRunEvents(root, run.run_id, 5);
	return {
		header: buildHeader({
			run_id: current.run_id,
			change_name: current.change_name ?? null,
			current_phase: current.current_phase,
			status: current.status,
			branch: current.change_name ?? "",
		}),
		terminal_banner: terminalBannerFor(current.status),
		review: buildReviewView(selected !== null, reviewRead),
		task_graph: buildTaskGraphView(
			taskGraphRead.kind === "ok"
				? { kind: "ok", value: { bundles: taskGraphRead.value.bundles } }
				: taskGraphRead,
			(bs) => topologicalOrder([...bs]),
		),
		events: buildEventsView(events),
	};
}

test("integration: startup render with all sections absent except run header", () => {
	const root = makeTempDir("watch-int-startup-");
	try {
		const run = seedRun(root, {
			runId: "foo-1",
			changeName: "foo",
			currentPhase: "proposal_draft",
			status: "active",
		});
		const model = buildModelFor(root, run);
		const frame = renderFrame(model, 80, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame, /foo-1/);
		assert.match(frame, /No active review/);
		assert.match(frame, /No task graph yet/);
		assert.match(frame, /No events recorded/);
	} finally {
		removeTempDir(root);
	}
});

test("integration: file changes propagate to the next render", () => {
	const root = makeTempDir("watch-int-mutate-");
	try {
		const run = seedRun(root, {
			runId: "bar-1",
			changeName: "bar",
			currentPhase: "design_review",
			status: "active",
		});
		writeAutofixSnapshot(root, "bar-1", "design_review", {
			round_index: 1,
			max_rounds: 4,
			loop_state: "in_progress",
			high: 2,
			medium: 1,
		});
		writeTaskGraph(root, "bar", [
			{
				id: "a",
				depends_on: [],
				status: "in_progress",
				tasks: [
					{ id: "1", status: "done" },
					{ id: "2", status: "pending" },
				],
			},
			{
				id: "b",
				depends_on: ["a"],
				status: "pending",
				tasks: [{ id: "1", status: "pending" }],
			},
		]);
		writeEvents(root, "bar-1", [
			{ event_id: "e1", event_kind: "phase_entered" },
		]);

		const first = renderFrame(buildModelFor(root, run), 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(first, /Round 1\/4/);
		assert.match(first, /HIGH=2/);
		assert.match(first, /Bundles: 0\/2 done/);
		assert.match(first, /1\/2/);
		assert.match(first, /phase_entered/);

		// Mutate: resolve the HIGH finding, complete bundle b, add an event.
		writeAutofixSnapshot(root, "bar-1", "design_review", {
			round_index: 2,
			max_rounds: 4,
			loop_state: "awaiting_review",
			high: 0,
			medium: 1,
		});
		writeTaskGraph(root, "bar", [
			{
				id: "a",
				depends_on: [],
				status: "done",
				tasks: [
					{ id: "1", status: "done" },
					{ id: "2", status: "done" },
				],
			},
			{
				id: "b",
				depends_on: ["a"],
				status: "in_progress",
				tasks: [{ id: "1", status: "done" }],
			},
		]);
		writeEvents(root, "bar-1", [
			{ event_id: "e1", event_kind: "phase_entered" },
			{ event_id: "e2", event_kind: "review_completed" },
		]);

		const second = renderFrame(buildModelFor(root, run), 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(second, /Round 2\/4/);
		assert.match(second, /HIGH=0/);
		assert.match(second, /Bundles: 1\/2 done/);
		assert.match(second, /review_completed/);
	} finally {
		removeTempDir(root);
	}
});

test("integration: terminal → active re-activation lifecycle resumes live updates", () => {
	// Required by spec: when a tracked run moves active → terminal, the TUI
	// freezes with a banner. When it subsequently moves terminal → active,
	// live updates must resume without restarting the watcher.
	const root = makeTempDir("watch-int-reactivate-");
	try {
		// Phase 1: active. Header / status reflect live values; no banner.
		const active = seedRun(root, {
			runId: "baz-1",
			changeName: "baz",
			currentPhase: "design_draft",
			status: "active",
		});
		const frame1 = renderFrame(buildModelFor(root, active), 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame1, /status: active/);
		assert.ok(
			!/Run .* press q to quit/.test(frame1),
			"no banner expected while active",
		);

		// Phase 2: transition to terminal. Banner appears; last-known state
		// stays rendered; watcher does not exit.
		seedRun(root, {
			runId: "baz-1",
			changeName: "baz",
			currentPhase: "approved",
			status: "terminal",
		});
		const frame2 = renderFrame(buildModelFor(root, active), 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame2, /status: terminal/);
		assert.match(frame2, /Run completed — press q to quit/);

		// Phase 3: re-activate. Banner clears; status flips back to active.
		seedRun(root, {
			runId: "baz-1",
			changeName: "baz",
			currentPhase: "design_review",
			status: "active",
		});
		const frame3 = renderFrame(buildModelFor(root, active), 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame3, /status: active/);
		assert.ok(
			!/Run .* press q to quit/.test(frame3),
			"banner must clear after re-activation",
		);
	} finally {
		removeTempDir(root);
	}
});

test("integration: autofix snapshot selection ignores wrong-gate file when both exist", () => {
	// Both design_review and apply_review snapshots exist on disk; the
	// renderer must use only the one matching current_phase and fall back
	// to "No active review" for any phase outside the review gates.
	const root = makeTempDir("watch-int-selector-");
	try {
		seedRun(root, {
			runId: "sel-1",
			changeName: "sel",
			currentPhase: "apply_draft", // <- not a review gate
			status: "active",
		});
		writeAutofixSnapshot(root, "sel-1", "design_review", {
			round_index: 99,
			max_rounds: 99,
			loop_state: "should_not_appear",
			high: 42,
			medium: 42,
		});
		writeAutofixSnapshot(root, "sel-1", "apply_review", {
			round_index: 42,
			max_rounds: 42,
			loop_state: "also_should_not_appear",
			high: 42,
			medium: 42,
		});
		const model = buildModelFor(root, {
			run_id: "sel-1",
			change_name: "sel",
			current_phase: "apply_draft",
			status: "active",
		} as RunState);
		const frame = renderFrame(model, 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame, /No active review/);
		assert.ok(
			!/should_not_appear/.test(frame),
			"stale snapshot must not leak into the render",
		);
		assert.ok(
			!/Round 99\/99/.test(frame),
			"stale snapshot values must not leak",
		);
	} finally {
		removeTempDir(root);
	}
});

test("integration: design_review phase renders only the design snapshot", () => {
	const root = makeTempDir("watch-int-selector-design-");
	try {
		seedRun(root, {
			runId: "dg-1",
			changeName: "dg",
			currentPhase: "design_review",
			status: "active",
		});
		writeAutofixSnapshot(root, "dg-1", "design_review", {
			round_index: 1,
			max_rounds: 4,
			loop_state: "in_progress",
			high: 0,
			medium: 1,
		});
		writeAutofixSnapshot(root, "dg-1", "apply_review", {
			round_index: 7,
			max_rounds: 9,
			loop_state: "apply_should_not_appear",
			high: 7,
			medium: 7,
		});
		const model = buildModelFor(root, {
			run_id: "dg-1",
			change_name: "dg",
			current_phase: "design_review",
			status: "active",
		} as RunState);
		const frame = renderFrame(model, 100, 40)
			.map((l) => stripAnsi(l))
			.join("\n");
		assert.match(frame, /Round 1\/4/);
		assert.ok(!/Round 7\/9/.test(frame));
		assert.ok(!/apply_should_not_appear/.test(frame));
	} finally {
		removeTempDir(root);
	}
});
