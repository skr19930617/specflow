import assert from "node:assert/strict";
import test from "node:test";
import type { RawObservationEvent } from "../lib/observation-event-reader.js";
import type { ArtifactReadResult } from "../lib/specflow-watch/artifact-readers.js";
import type { Bundle, TaskGraph } from "../lib/task-planner/index.js";
import {
	type BuildReviewViewInput,
	buildApprovalSummary,
	buildDigestState,
	buildEventsView,
	buildHeader,
	buildReviewView,
	buildTaskGraphView,
	deriveManualFixKind,
	type ManualFixKind,
	rankOpenFindings,
	renderFrame,
	stripAnsi,
	terminalBannerFor,
	topologicalOrder,
	type WatchModel,
} from "../lib/watch-renderer/index.js";
import type { AutofixProgressSnapshot } from "../types/autofix-progress.js";
import type {
	ReviewFinding,
	ReviewLedger,
	RunState,
} from "../types/contracts.js";

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

function reviewInput(
	overrides: Partial<BuildReviewViewInput> = {},
): BuildReviewViewInput {
	return {
		phase_is_review_gate: false,
		phase_in_review_family: false,
		snapshot: { kind: "absent" },
		manual_fix_kind: "idle",
		...overrides,
	};
}

function headerFor(opts: {
	phase: string;
	status?: string;
	manual?: ManualFixKind;
}) {
	return buildHeader({
		run_id: "x-1",
		change_name: "x",
		current_phase: opts.phase,
		status: opts.status ?? "active",
		branch: "x",
		manual_fix_kind: opts.manual ?? "idle",
	});
}

function modelFor(parts: Partial<WatchModel> = {}): WatchModel {
	return {
		header: headerFor({ phase: "apply_draft" }),
		terminal_banner: null,
		review: buildReviewView(reviewInput()),
		digest: { kind: "hidden" },
		task_graph: buildTaskGraphView({ kind: "absent" }),
		events: buildEventsView([]),
		approval_summary: buildApprovalSummary({ kind: "absent" }),
		...parts,
	};
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

test("deriveManualFixKind: maps last history event", () => {
	const mk = (event: string): Pick<RunState, "history"> => ({
		history: [
			{ from: "apply_review", to: "apply_draft", event, timestamp: "t" },
		],
	});
	assert.equal(deriveManualFixKind(mk("revise_apply")), "apply");
	assert.equal(deriveManualFixKind(mk("revise_design")), "design");
	assert.equal(deriveManualFixKind(mk("review_apply")), "idle");
	assert.equal(deriveManualFixKind({ history: [] }), "idle");
});

test("buildReviewView: placeholder when not in review family", () => {
	const v = buildReviewView(reviewInput());
	assert.equal(v.kind, "placeholder");
});

const SNAP: AutofixProgressSnapshot = {
	schema_version: 1,
	run_id: "x-1",
	change_id: "x",
	phase: "apply_review",
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

test("buildReviewView: live visibility during review gate", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: true,
			phase_in_review_family: true,
			snapshot: ok(SNAP),
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value.visibility, "live");
		assert.equal(v.value.round_index, 2);
		assert.equal(v.value.has_snapshot, true);
	}
});

test("buildReviewView: completed visibility outside review gate but in family", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: false,
			phase_in_review_family: true,
			snapshot: ok(SNAP),
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value.visibility, "completed");
	}
});

test("buildReviewView: manual-fix active with snapshot carries count", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: false,
			phase_in_review_family: true,
			snapshot: ok(SNAP),
			manual_fix_kind: "apply",
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.deepEqual(v.value.manual_fix, { active: true, count: 3 });
	}
});

test("buildReviewView: manual-fix active without snapshot shows unknown count", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: false,
			phase_in_review_family: true,
			snapshot: { kind: "absent" },
			manual_fix_kind: "apply",
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.deepEqual(v.value.manual_fix, { active: true, count: null });
		assert.equal(v.value.has_snapshot, false);
	}
});

test("buildReviewView: warning on malformed snapshot (idle manual fix)", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: true,
			phase_in_review_family: true,
			snapshot: { kind: "malformed", reason: "bad" },
		}),
	);
	assert.equal(v.kind, "warning");
});

test("buildReviewView: manual-fix with malformed snapshot still renders ? unresolved", () => {
	// Per proposal: manual-fix mode must stay visible whenever the snapshot
	// cannot be read. Malformed should degrade to the same placeholder-style
	// "? unresolved" output as absent, not the warning state.
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: false,
			phase_in_review_family: true,
			snapshot: { kind: "malformed", reason: "bad" },
			manual_fix_kind: "apply",
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.deepEqual(v.value.manual_fix, { active: true, count: null });
		assert.equal(v.value.has_snapshot, false);
	}
});

test("buildReviewView: manual-fix with unreadable snapshot still renders ? unresolved", () => {
	const v = buildReviewView(
		reviewInput({
			phase_is_review_gate: false,
			phase_in_review_family: true,
			snapshot: { kind: "unreadable", reason: "EPERM" },
			manual_fix_kind: "design",
		}),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.deepEqual(v.value.manual_fix, { active: true, count: null });
	}
});

test("buildTaskGraphView: placeholder when absent", () => {
	const v = buildTaskGraphView({ kind: "absent" });
	assert.equal(v.kind, "placeholder");
});

test("buildTaskGraphView: counts bundles done and projects child tasks", () => {
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
		// Bundle a is done → all child tasks display as done.
		for (const t of v.value.bundles[0].tasks) {
			assert.equal(t.display_status, "done");
		}
		// Bundle b in_progress → tasks keep their own status.
		assert.equal(v.value.bundles[1].tasks[0].display_status, "done");
		assert.equal(v.value.bundles[1].tasks[1].display_status, "pending");
	}
});

test("buildEventsView: placeholder when no events", () => {
	const v = buildEventsView([]);
	assert.equal(v.kind, "placeholder");
});

test("buildEventsView: phase_entered renders → target (trigger)", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "phase_entered",
		target_phase: "apply_review",
		payload: { triggered_event: "review_apply" },
	};
	const v = buildEventsView([ev]);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "→ apply_review (review_apply)");
	}
});

test("buildEventsView: phase_completed renders ✓ source (outcome)", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "phase_completed",
		source_phase: "apply_review",
		payload: { outcome: "advanced" },
	};
	const v = buildEventsView([ev]);
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "✓ apply_review (advanced)");
	}
});

test("buildEventsView: gate_opened renders ⏸ waiting with gate_ref", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "gate_opened",
		gate_ref: "review_decision-x-1",
		payload: { gate_kind: "review_decision" },
	};
	const v = buildEventsView([ev]);
	if (v.kind === "ok") {
		assert.equal(
			v.value[0].summary,
			"⏸ waiting: review_decision (review_decision-x-1)",
		);
	}
});

test("buildEventsView: gate_resolved renders ▶ kind = response", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "gate_resolved",
		payload: { gate_kind: "approval", resolved_response: "accept" },
	};
	const v = buildEventsView([ev]);
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "▶ approval = accept");
	}
});

test("buildEventsView: run_started and run_terminated use fixed labels", () => {
	const started: RawObservationEvent = {
		event_id: "e1",
		run_id: "x-1",
		event_kind: "run_started",
		payload: {},
	};
	const terminated: RawObservationEvent = {
		event_id: "e2",
		run_id: "x-1",
		event_kind: "run_terminated",
		payload: { final_status: "completed" },
	};
	const v = buildEventsView([started, terminated]);
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "▶ run started");
		assert.equal(v.value[1].summary, "■ run completed");
	}
});

test("buildEventsView: missing triggered_event elides parenthesized suffix", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "phase_entered",
		target_phase: "apply_draft",
		payload: {},
	};
	const v = buildEventsView([ev]);
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "→ apply_draft");
		assert.doesNotMatch(v.value[0].summary, /undefined/);
	}
});

test("buildEventsView: unknown event_kind falls back to payload.summary", () => {
	const ev: RawObservationEvent = {
		event_id: "e",
		run_id: "x-1",
		event_kind: "custom_heartbeat",
		payload: { summary: "still alive" },
	};
	const v = buildEventsView([ev]);
	if (v.kind === "ok") {
		assert.equal(v.value[0].summary, "still alive");
	}
});

test("buildApprovalSummary: absent → placeholder", () => {
	const v = buildApprovalSummary({ kind: "absent" });
	assert.equal(v.kind, "placeholder");
});

test("buildApprovalSummary: missing file (reason=missing) → warning", () => {
	const v = buildApprovalSummary({ kind: "unreadable", reason: "missing" });
	assert.equal(v.kind, "warning");
	if (v.kind === "warning") {
		assert.equal(v.message, "Approval summary missing");
	}
});

test("buildApprovalSummary: generic I/O failure → unreadable warning", () => {
	const v = buildApprovalSummary({ kind: "unreadable", reason: "EPERM" });
	assert.equal(v.kind, "warning");
	if (v.kind === "warning") {
		assert.match(v.message, /unreadable: EPERM/);
	}
});

test("buildApprovalSummary: both fields null → Status: (unknown) with no diffstat", () => {
	const v = buildApprovalSummary(
		ok({ status_line: null, diffstat_line: null }),
	);
	assert.equal(v.kind, "ok");
	if (v.kind === "ok") {
		assert.equal(v.value.status_line, "Status: (unknown)");
		assert.equal(v.value.diffstat_line, null);
	}
});

test("buildApprovalSummary: status null but diffstat present → substitutes (unknown)", () => {
	const v = buildApprovalSummary(
		ok({ status_line: null, diffstat_line: "1 file changed" }),
	);
	if (v.kind === "ok") {
		assert.equal(v.value.status_line, "Status: (unknown)");
		assert.equal(v.value.diffstat_line, "1 file changed");
	} else {
		assert.fail("expected ok");
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
	const model = modelFor({
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
	});
	const lines = renderFrame(model, 80, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /x-1/);
	assert.match(plain, /change: x/);
	assert.match(plain, /phase: apply_draft/);
	assert.match(plain, /status: active/);
	assert.match(plain, /── Review round/);
	assert.match(plain, /── Task graph/);
	assert.match(plain, /── Recent events/);
	assert.match(plain, /── Approval summary/);
	assert.match(plain, /No active review/);
	assert.match(plain, /No events recorded/);
	assert.match(plain, /No approval yet/);
});

test("renderFrame: manual fix kind appends (manual fix) badge", () => {
	const model = modelFor({
		header: headerFor({ phase: "apply_draft", manual: "apply" }),
	});
	const lines = renderFrame(model, 80, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /phase: apply_draft \(manual fix\)/);
});

test("renderFrame: task tree prints children under bundle", () => {
	const tg: TaskGraph = {
		version: "1.0",
		change_id: "x",
		bundles: [
			bundle(
				"a",
				[],
				[
					{ id: "1", status: "done" },
					{ id: "2", status: "in_progress" },
					{ id: "3", status: "pending" },
				],
			),
		],
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	const model = modelFor({
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /├─ \[✓\] 1\./);
	assert.match(plain, /├─ \[◐\] 2\./);
	assert.match(plain, /└─ \[ \] 3\./);
});

test("renderFrame: bundle done forces all child tasks to checked", () => {
	const tg: TaskGraph = {
		version: "1.0",
		change_id: "x",
		bundles: [
			bundle(
				"a",
				[],
				[
					{ id: "1", status: "in_progress" },
					{ id: "2", status: "pending" },
				],
				"done",
			),
		],
		generated_at: "2026-04-19T00:00:00Z",
		generated_from: "design.md",
	};
	const model = modelFor({
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	// Both children must render as ✓ because the bundle is done.
	assert.match(plain, /├─ \[✓\] 1\./);
	assert.match(plain, /└─ \[✓\] 2\./);
	// And neither should render as the raw child status.
	assert.doesNotMatch(plain, /\[◐\]/);
});

test("renderFrame: live badge during review gate", () => {
	const model = modelFor({
		header: headerFor({ phase: "apply_review" }),
		review: buildReviewView(
			reviewInput({
				phase_is_review_gate: true,
				phase_in_review_family: true,
				snapshot: ok(SNAP),
			}),
		),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Round 2\/4/);
	assert.match(plain, /live/);
});

test("renderFrame: completed badge outside review gate", () => {
	const model = modelFor({
		header: headerFor({ phase: "apply_ready" }),
		review: buildReviewView(
			reviewInput({
				phase_is_review_gate: false,
				phase_in_review_family: true,
				snapshot: ok(SNAP),
			}),
		),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /completed — awaiting_review/);
});

test("renderFrame: manual-fix line shown with count", () => {
	const model = modelFor({
		header: headerFor({ phase: "apply_draft", manual: "apply" }),
		review: buildReviewView(
			reviewInput({
				phase_is_review_gate: false,
				phase_in_review_family: true,
				snapshot: ok(SNAP),
				manual_fix_kind: "apply",
			}),
		),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Manual fix in progress — 3 unresolved findings/);
});

test("renderFrame: manual-fix line with unknown count renders '?'", () => {
	const model = modelFor({
		header: headerFor({ phase: "apply_draft", manual: "apply" }),
		review: buildReviewView(
			reviewInput({
				phase_is_review_gate: false,
				phase_in_review_family: true,
				snapshot: { kind: "absent" },
				manual_fix_kind: "apply",
			}),
		),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Manual fix in progress — \? unresolved/);
});

test("renderFrame: approval summary shows status + diffstat", () => {
	const model = modelFor({
		approval_summary: buildApprovalSummary(
			ok({
				status_line: "Status: ✅ No unresolved high",
				diffstat_line: "22 files changed, 3049 insertions(+), 13 deletions(-)",
			}),
		),
	});
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Status: ✅ No unresolved high/);
	assert.match(
		plain,
		/22 files changed, 3049 insertions\(\+\), 13 deletions\(-\)/,
	);
});

test("renderFrame: terminal banner appears when set", () => {
	const model = modelFor({
		header: headerFor({ phase: "approved", status: "terminal" }),
		terminal_banner: terminalBannerFor("terminal"),
	});
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
	const model = modelFor({
		task_graph: buildTaskGraphView(ok({ bundles: tg.bundles })),
	});
	const lines = renderFrame(model, 40, 40);
	for (const l of lines) {
		assert.ok(
			stripAnsi(l).length <= 40,
			`line exceeds 40 cols: ${stripAnsi(l).length}`,
		);
	}
});

// ---------------------------------------------------------------------------
// Ledger digest model + renderer tests
// ---------------------------------------------------------------------------

function ledger(parts: Partial<ReviewLedger> = {}): ReviewLedger {
	return {
		feature_id: "x",
		phase: "design",
		current_round: 1,
		status: "has_open_high",
		max_finding_id: 0,
		findings: [],
		round_summaries: [
			{
				round: 1,
				total: 0,
				open: 0,
				new: 0,
				resolved: 0,
				overridden: 0,
				by_severity: {},
			},
		],
		...parts,
	} as ReviewLedger;
}

function finding(
	id: string,
	severity: string,
	status: string,
	latest_round = 1,
	title = "",
): ReviewFinding {
	return {
		id,
		title: title || `finding ${id}`,
		severity: severity as ReviewFinding["severity"],
		status: status as ReviewFinding["status"],
		latest_round,
		origin_round: latest_round,
	} as ReviewFinding;
}

test("buildDigestState: hidden when activeFamily is null (non-review phase)", () => {
	const state = buildDigestState({
		activeFamily: null,
		ledgerRead: { kind: "absent" },
	});
	assert.equal(state.kind, "hidden");
});

test("buildDigestState: placeholder when ledger is absent within review family", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: { kind: "absent" },
	});
	assert.equal(state.kind, "placeholder");
	if (state.kind === "placeholder") {
		assert.equal(state.message, "No review digest yet");
	}
});

test("buildDigestState: warning on unreadable ledger preserves reason", () => {
	const state = buildDigestState({
		activeFamily: "apply",
		ledgerRead: { kind: "unreadable", reason: "EACCES" },
	});
	assert.equal(state.kind, "warning");
	if (state.kind === "warning") {
		assert.match(state.message, /Review ledger unreadable: EACCES/);
	}
});

test("buildDigestState: warning on malformed ledger preserves reason", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: { kind: "malformed", reason: "decision parity violation" },
	});
	assert.equal(state.kind, "warning");
	if (state.kind === "warning") {
		assert.match(state.message, /Review ledger malformed: decision parity/);
	}
});

test("buildDigestState: empty round_summaries renders as placeholder, not ok", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: { kind: "ok", value: ledger({ round_summaries: [] }) },
	});
	assert.equal(state.kind, "placeholder");
});

test("buildDigestState: populates digest from latest round_summary + open findings", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: {
			kind: "ok",
			value: ledger({
				latest_decision: "request_changes",
				findings: [
					finding("R1-F01", "high", "open", 1, "auth boundary mismatch"),
					finding("R1-F02", "medium", "open", 1, "retry path unclear"),
					finding("R1-F03", "low", "resolved", 1, "fixed style"),
				],
				round_summaries: [
					{
						round: 1,
						total: 3,
						open: 2,
						new: 0,
						resolved: 1,
						overridden: 0,
						by_severity: { high: 1, medium: 1, low: 1 },
						decision: "request_changes",
					},
				],
			}),
		},
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") {
		assert.equal(state.value.decision, "request_changes");
		assert.equal(state.value.counts.total, 3);
		assert.equal(state.value.counts.open, 2);
		assert.equal(state.value.counts.resolved, 1);
		assert.equal(state.value.openSeverity.high, 1);
		assert.equal(state.value.openSeverity.medium, 1);
		assert.equal(state.value.openSeverity.low, 0);
		assert.equal(state.value.topOpen.length, 2);
		assert.equal(state.value.topOpen[0].severity, "HIGH");
		assert.equal(state.value.topOpen[1].severity, "MEDIUM");
	}
});

test("buildDigestState: critical severity aggregates into HIGH counts and HIGH display", () => {
	const state = buildDigestState({
		activeFamily: "apply",
		ledgerRead: {
			kind: "ok",
			value: ledger({
				findings: [
					finding("R1-F01", "critical", "open", 1, "RCE"),
					finding("R1-F02", "high", "open", 1, "auth"),
					finding("R1-F03", "medium", "open", 1, "log noise"),
				],
				round_summaries: [
					{
						round: 1,
						total: 3,
						open: 3,
						new: 0,
						resolved: 0,
						overridden: 0,
						by_severity: { critical: 1, high: 1, medium: 1 },
					},
				],
			}),
		},
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") {
		assert.equal(state.value.openSeverity.high, 2); // critical + high
		assert.equal(state.value.openSeverity.medium, 1);
		// First entry should be the critical finding, displayed as HIGH.
		assert.equal(state.value.topOpen[0].severity, "HIGH");
		assert.equal(state.value.topOpen[0].id, "R1-F01");
	}
});

test("buildDigestState: ledger.latest_decision preferred over round_summaries decision when both present and equal", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: {
			kind: "ok",
			value: ledger({
				latest_decision: "approve",
				round_summaries: [
					{
						round: 1,
						total: 0,
						open: 0,
						new: 0,
						resolved: 0,
						overridden: 0,
						by_severity: {},
						decision: "approve",
					},
				],
			}),
		},
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") {
		assert.equal(state.value.decision, "approve");
	}
});

test("buildDigestState: falls back to last round summary decision when latest_decision absent", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: {
			kind: "ok",
			value: ledger({
				round_summaries: [
					{
						round: 1,
						total: 0,
						open: 0,
						new: 0,
						resolved: 0,
						overridden: 0,
						by_severity: {},
						decision: "request_changes",
					},
				],
			}),
		},
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") {
		assert.equal(state.value.decision, "request_changes");
	}
});

test("buildDigestState: decision (none) when both decision sources empty", () => {
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: { kind: "ok", value: ledger() },
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") assert.equal(state.value.decision, "(none)");
});

test("buildDigestState: summaryState is absent — no compliant persisted summary source exists today", () => {
	// The persisted ledger does not carry free-form summary text and the
	// watcher's read-only contract forbids widening to `review-result*.json`.
	// Per spec ("Latest round summary missing elides the line") the digest
	// SHALL omit the Latest summary line until a compliant source is added.
	const state = buildDigestState({
		activeFamily: "design",
		ledgerRead: {
			kind: "ok",
			value: ledger({
				round_summaries: [
					{
						round: 3,
						total: 5,
						open: 2,
						new: 1,
						resolved: 3,
						overridden: 0,
						by_severity: { high: 1, medium: 1 },
						decision: "request_changes",
					},
				],
			}),
		},
	});
	assert.equal(state.kind, "ok");
	if (state.kind === "ok") {
		assert.equal(state.value.summaryState.kind, "absent");
	}
});

test("rankOpenFindings: severity → latest_round DESC → id ASC", () => {
	const findings = [
		finding("R3-F01", "high", "open", 3),
		finding("R2-F03", "high", "open", 2),
		finding("R3-F02", "high", "open", 3),
		finding("R4-F01", "medium", "open", 4),
		finding("R5-F02", "low", "open", 5),
	];
	const ranked = rankOpenFindings(findings);
	assert.equal(ranked[0].id, "R3-F01");
	assert.equal(ranked[1].id, "R3-F02");
	assert.equal(ranked[2].id, "R2-F03");
	assert.equal(ranked[3].id, "R4-F01");
	assert.equal(ranked[4].id, "R5-F02");
});

test("rankOpenFindings: critical ranks alongside high (rank 0), not below low", () => {
	const findings = [
		finding("R1-F02", "low", "open", 1),
		finding("R1-F01", "critical", "open", 1),
		finding("R1-F03", "medium", "open", 1),
	];
	const ranked = rankOpenFindings(findings);
	assert.equal(ranked[0].id, "R1-F01"); // critical first
	assert.equal(ranked[1].id, "R1-F03"); // medium next
	assert.equal(ranked[2].id, "R1-F02"); // low last
});

test("rankOpenFindings: filters out resolved/accepted_risk/ignored findings", () => {
	const findings = [
		finding("R1-F01", "high", "open", 1),
		finding("R1-F02", "high", "resolved", 1),
		finding("R1-F03", "high", "accepted_risk", 1),
		finding("R1-F04", "high", "new", 1),
	];
	const ranked = rankOpenFindings(findings);
	assert.equal(ranked.length, 2);
	const ids = ranked.map((f) => f.id);
	assert.deepEqual(ids.sort(), ["R1-F01", "R1-F04"]);
});

// Renderer tests for the digest layer

function digestModel(
	parts: Partial<WatchModel> = {},
	digestParts: Partial<{
		activeFamily: "design" | "apply" | null;
		ledgerRead: ArtifactReadResult<ReviewLedger>;
	}> = {},
): WatchModel {
	return {
		header: headerFor({ phase: "design_review" }),
		terminal_banner: null,
		review: buildReviewView(reviewInput()),
		digest: buildDigestState({
			activeFamily:
				"activeFamily" in digestParts
					? (digestParts.activeFamily as "design" | "apply" | null)
					: "design",
			ledgerRead: digestParts.ledgerRead ?? { kind: "absent" },
		}),
		task_graph: buildTaskGraphView({ kind: "absent" }),
		events: buildEventsView([]),
		approval_summary: buildApprovalSummary({ kind: "absent" }),
		...parts,
	};
}

test("renderFrame: digest placeholder appears below snapshot when ledger absent in review family", () => {
	const model = digestModel(
		{},
		{ activeFamily: "design", ledgerRead: { kind: "absent" } },
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /No active review/);
	assert.match(plain, /No review digest yet/);
});

test("renderFrame: digest layer is fully suppressed for non-review phases", () => {
	const model = digestModel(
		{ header: headerFor({ phase: "spec_draft" }) },
		{ activeFamily: null, ledgerRead: { kind: "absent" } },
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.doesNotMatch(plain, /No review digest yet/);
	assert.doesNotMatch(plain, /Decision:/);
});

test("renderFrame: warning ledger renders inline below snapshot section", () => {
	const model = digestModel(
		{},
		{
			activeFamily: "design",
			ledgerRead: { kind: "malformed", reason: "round_summaries: missing" },
		},
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /⚠ Review ledger malformed: round_summaries/);
});

test("renderFrame: populated digest renders Decision/Findings/Severity/summary/Open findings", () => {
	const model = digestModel(
		{},
		{
			activeFamily: "design",
			ledgerRead: {
				kind: "ok",
				value: ledger({
					latest_decision: "approve_with_findings",
					findings: [
						finding("R1-F01", "high", "open", 1, "auth boundary mismatch"),
						finding("R1-F02", "medium", "open", 1, "retry path unclear"),
						finding("R1-F03", "medium", "open", 1, "missing test coverage"),
					],
					round_summaries: [
						{
							round: 1,
							total: 8,
							open: 3,
							new: 2,
							resolved: 5,
							overridden: 0,
							by_severity: { high: 1, medium: 2 },
							decision: "approve_with_findings",
						},
					],
				}),
			},
		},
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.match(plain, /Decision: approve_with_findings/);
	assert.match(plain, /Findings: 8 total \| 3 open \| 2 new \| 5 resolved/);
	assert.match(plain, /Severity: HIGH 1 \| MEDIUM 2 \| LOW 0/);
	// Per spec, the Latest summary line is omitted when no persisted narrative
	// summary source is available; the persisted ledger has only counters and
	// decision tokens.
	assert.doesNotMatch(plain, /Latest summary:/);
	assert.match(plain, /Open findings:/);
	assert.match(plain, /HIGH\s+auth boundary mismatch/);
	assert.match(plain, /MEDIUM\s+retry path unclear/);
});

test("renderFrame: Latest summary line is omitted (no persisted narrative source)", () => {
	const model = digestModel(
		{},
		{
			activeFamily: "design",
			ledgerRead: {
				kind: "ok",
				value: ledger({
					round_summaries: [
						{
							round: 5,
							total: 4,
							open: 1,
							new: 0,
							resolved: 3,
							overridden: 0,
							by_severity: { high: 1 },
							decision: "request_changes",
						},
					],
				}),
			},
		},
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	assert.doesNotMatch(plain, /Latest summary:/);
});

test("renderFrame: narrow terminal (<80 cols) collapses Open findings list and ellipsizes other digest lines", () => {
	const longTitle = "x".repeat(120);
	const model = digestModel(
		{},
		{
			activeFamily: "design",
			ledgerRead: {
				kind: "ok",
				value: ledger({
					findings: [finding("R1-F01", "high", "open", 1, longTitle)],
					round_summaries: [
						{
							round: 1,
							total: 1,
							open: 1,
							new: 0,
							resolved: 0,
							overridden: 0,
							by_severity: { high: 1 },
							decision:
								"request_changes_with_a_very_long_decision_string_to_force_overflow",
						},
					],
				}),
			},
		},
	);
	const lines = renderFrame(model, 60, 40);
	const plain = lines.map((l) => stripAnsi(l));
	const joined = plain.join("\n");
	assert.doesNotMatch(joined, /Open findings:/);
	// Decision/Findings/Severity still present.
	assert.match(joined, /Decision:/);
	// All digest lines bounded to 60 cols; longest one is ellipsized.
	const decisionLine = plain.find((l) => l.startsWith("Decision:"));
	assert.ok(decisionLine !== undefined && decisionLine.length <= 60);
});

test("renderFrame: ledger-only (snapshot absent) still renders digest", () => {
	const model = digestModel(
		{
			header: headerFor({ phase: "design_review" }),
			review: buildReviewView(
				reviewInput({
					phase_in_review_family: true,
					phase_is_review_gate: true,
					snapshot: { kind: "absent" },
				}),
			),
		},
		{
			activeFamily: "design",
			ledgerRead: {
				kind: "ok",
				value: ledger({
					round_summaries: [
						{
							round: 1,
							total: 0,
							open: 0,
							new: 0,
							resolved: 0,
							overridden: 0,
							by_severity: {},
							decision: "approve",
						},
					],
				}),
			},
		},
	);
	const lines = renderFrame(model, 120, 40);
	const plain = lines.map((l) => stripAnsi(l)).join("\n");
	// snapshot absent → shows placeholder
	assert.match(plain, /No active review/);
	// Digest still appears with decision/counts/severity. Latest summary line
	// is intentionally omitted — no compliant persisted narrative source.
	assert.match(plain, /Decision: approve/);
	assert.doesNotMatch(plain, /Latest summary:/);
});
