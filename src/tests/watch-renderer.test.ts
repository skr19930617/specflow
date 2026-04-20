import assert from "node:assert/strict";
import test from "node:test";
import type { RawObservationEvent } from "../lib/observation-event-reader.js";
import type { ArtifactReadResult } from "../lib/specflow-watch/artifact-readers.js";
import type { Bundle, TaskGraph } from "../lib/task-planner/index.js";
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
import type { AutofixProgressSnapshot } from "../types/autofix-progress.js";

function ok<T>(value: T): ArtifactReadResult<T> {
	return { kind: "ok", value };
}

function bundle(
	id: string,
	depends_on: readonly string[],
	tasks: ReadonlyArray<{ id: string; status: string }>,
	status: Bundle["status"] = "pending",
): Bundle {
	return {
		id,
		title: `Title ${id}`,
		goal: `Goal ${id}`,
		depends_on,
		inputs: [],
		outputs: [],
		status,
		tasks: tasks.map(
			(t) =>
				({
					id: t.id,
					title: `Task ${t.id}`,
					status: t.status,
				}) as Bundle["tasks"][number],
		),
		owner_capabilities: [],
	} as Bundle;
}

test("topologicalOrder: respects depends_on", () => {
	const a = bundle("a", [], []);
	const b = bundle("b", ["a"], []);
	const c = bundle("c", ["b"], []);
	const ordered = topologicalOrder([c, b, a]);
	assert.deepEqual(
		ordered.map((n) => n.id),
		["a", "b", "c"],
	);
});

test("topologicalOrder: tolerates cycles by appending leftovers", () => {
	const a = bundle("a", ["b"], []);
	const b = bundle("b", ["a"], []);
	const ordered = topologicalOrder([a, b]);
	assert.equal(ordered.length, 2);
});

test("terminalBannerFor: mapping", () => {
	assert.equal(terminalBannerFor("active"), null);
	assert.match(String(terminalBannerFor("terminal")), /Run completed/);
	assert.match(String(terminalBannerFor("suspended")), /Run suspended/);
	assert.match(String(terminalBannerFor("canceled")), /Run canceled/);
});

test("buildReviewView: placeholder when not a review gate", () => {
	const v = buildReviewView(false, { kind: "absent" });
	assert.equal(v.kind, "placeholder");
});

test("buildReviewView: ok when snapshot present and phase matches", () => {
	const snap: AutofixProgressSnapshot = {
		schema_version: 1,
		run_id: "x-1",
		change_id: "x",
		phase: "design_review",
		round_index: 2,
		max_rounds: 4,
		loop_state: "awaiting_review",
		terminal_outcome: null,
		counters: {
			unresolvedCriticalHigh: 1,
			totalOpen: 3,
			resolvedThisRound: 2,
			newThisRound: 1,
			severitySummary: { HIGH: 1, MEDIUM: 2 },
		},
		heartbeat_at: "2026-04-19T00:00:00Z",
		ledger_round_id: "round-2",
	};
	const v = buildReviewView(true, ok(snap));
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value.round_index, 2);
		assert.equal(v.value.unresolved_high, 1);
		assert.equal(v.value.unresolved_medium, 2);
	}
});

test("buildReviewView: warning on malformed source", () => {
	const v = buildReviewView(true, { kind: "malformed", reason: "bad" });
	assert.equal(v.kind, "warning");
});

test("buildTaskGraphView: placeholder when absent", () => {
	const v = buildTaskGraphView({ kind: "absent" });
	assert.equal(v.kind, "placeholder");
});

test("buildTaskGraphView: counts bundles done and per-bundle tasks done", () => {
	const tg: TaskGraph = {
		version: "1.0",
		change_id: "x",
		bundles: [
			bundle(
				"a",
				[],
				[
					{ id: "1", status: "done" },
					{ id: "2", status: "done" },
				],
				"done",
			),
			bundle(
				"b",
				["a"],
				[
					{ id: "1", status: "done" },
					{ id: "2", status: "pending" },
				],
				"in_progress",
			),
		],
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	const v = buildTaskGraphView(ok({ bundles: tg.bundles }), (bs) =>
		topologicalOrder([...bs]),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value.bundles_total, 2);
		assert.equal(v.value.bundles_done, 1);
		assert.equal(v.value.bundles[0].id, "a");
		assert.equal(v.value.bundles[1].tasks_done, 1);
		assert.equal(v.value.bundles[1].tasks_total, 2);
	}
});

test("buildEventsView: placeholder when no events", () => {
	const v = buildEventsView([]);
	assert.equal(v.kind, "placeholder");
});

test("buildEventsView: maps event kind and summary", () => {
	const events: RawObservationEvent[] = [
		{
			event_id: "e1",
			run_id: "x-1",
			event_kind: "review_completed",
			timestamp: "2026-04-19T00:00:00Z",
			payload: { loop_state: "in_progress" },
		},
	];
	const v = buildEventsView(events);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value[0].kind, "review_completed");
		assert.match(v.value[0].summary, /in_progress/);
	}
});

test("renderFrame: header shows run id + status; sections appear", () => {
	const tg: TaskGraph = {
		version: "1.0",
		change_id: "x",
		bundles: [bundle("a", [], [{ id: "1", status: "pending" }])],
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	const model = {
		header: buildHeader({
			run_id: "x-1",
			change_name: "x",
			current_phase: "apply_draft",
			status: "active",
			branch: "x",
		}),
		terminal_banner: null,
		review: buildReviewView(false, { kind: "absent" }),
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
		events: buildEventsView([]),
	};
	const lines = renderFrame(model, 80, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /x-1/);
	assert.match(plain, /change: x/);
	assert.match(plain, /phase: apply_draft/);
	assert.match(plain, /status: active/);
	assert.match(plain, /── Review round/);
	assert.match(plain, /── Task graph/);
	assert.match(plain, /── Recent events/);
	assert.match(plain, /No active review/);
	assert.match(plain, /No events recorded/);
});

test("renderFrame: terminal banner appears when set", () => {
	const model = {
		header: buildHeader({
			run_id: "x-1",
			change_name: "x",
			current_phase: "approved",
			status: "terminal",
			branch: "x",
		}),
		terminal_banner: terminalBannerFor("terminal"),
		review: buildReviewView(false, { kind: "absent" }),
		task_graph: buildTaskGraphView({ kind: "absent" }),
		events: buildEventsView([]),
	};
	const lines = renderFrame(model, 80, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Run completed — press q to quit/);
	assert.match(plain, /No task graph yet/);
});

test("renderFrame: narrow terminal still produces bounded-width output", () => {
	const tg: TaskGraph = {
		version: "1.0",
		change_id: "x",
		bundles: [
			bundle(
				"a",
				[],
				[
					{ id: "1", status: "done" },
					{ id: "2", status: "pending" },
				],
			),
		],
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	const model = {
		header: buildHeader({
			run_id: "x-1",
			change_name: "x",
			current_phase: "apply_draft",
			status: "active",
			branch: "x",
		}),
		terminal_banner: null,
		review: buildReviewView(false, { kind: "absent" }),
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
		events: buildEventsView([]),
	};
	const lines = renderFrame(model, 40, 40);
	for (const l of lines) {
		assert.ok(
			stripAnsi(l).length <= 40,
			`line exceeds 40 cols: ${stripAnsi(l).length}`,
		);
	}
});
