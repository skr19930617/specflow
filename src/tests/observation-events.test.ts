import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
	createLocalFsObservationEventPublisher,
	eventLogPath,
	withLockedPublisher,
} from "../lib/local-fs-observation-event-publisher.js";
import {
	type EmitRecordMutation,
	type EmitRunState,
	emitAdvanceEvents,
	emitGateOpened,
	emitRunResumed,
	emitRunStarted,
	emitRunSuspended,
	type ResolvedGateInfo,
} from "../lib/observation-event-emitter.js";
import {
	makeEventId,
	nextSequence,
} from "../lib/observation-event-publisher.js";
import type { ApprovalRecord } from "../types/interaction-records.js";
import {
	isObservationEventKind,
	OBSERVATION_EVENT_KINDS,
	type ObservationEvent,
} from "../types/observation-events.js";

function makeTempRoot(): string {
	return mkdtempSync(resolve(tmpdir(), "specflow-obs-events-test-"));
}

function readLog(runsRoot: string, runId: string): readonly ObservationEvent[] {
	const path = eventLogPath(runsRoot, runId);
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as ObservationEvent);
}

function sampleState(overrides: Partial<EmitRunState> = {}): EmitRunState {
	return {
		run_id: "change-foo-1",
		change_name: "change-foo",
		current_phase: "start",
		status: "active",
		source: {
			provider: "github",
			reference: "https://github.com/x/y/issues/1",
			title: "sample",
		},
		...overrides,
	};
}

// --- catalog / type helpers -------------------------------------------------

test("OBSERVATION_EVENT_KINDS catalogues exactly 15 kinds", () => {
	assert.equal(OBSERVATION_EVENT_KINDS.length, 15);
});

test("isObservationEventKind accepts every catalog entry and rejects others", () => {
	for (const kind of OBSERVATION_EVENT_KINDS) {
		assert.equal(isObservationEventKind(kind), true);
	}
	assert.equal(isObservationEventKind("not_a_kind"), false);
	assert.equal(isObservationEventKind(123), false);
	assert.equal(isObservationEventKind(null), false);
});

test("makeEventId is deterministic for (runId, sequence)", () => {
	assert.equal(makeEventId("run-1", 4), "run-1-evt-4");
	assert.equal(makeEventId("run-1", 4), "run-1-evt-4");
});

test("nextSequence returns highest + 1", () => {
	assert.equal(nextSequence(0), 1);
	assert.equal(nextSequence(7), 8);
});

// --- local publisher --------------------------------------------------------

test("publisher writes events as JSONL", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-a");
		emitRunStarted(
			publisher,
			sampleState({ run_id: "run-a" }),
			"2026-04-19T00:00:00Z",
		);
		const events = readLog(root, "run-a");
		assert.equal(events.length, 1);
		assert.equal(events[0]?.event_kind, "run_started");
		assert.equal(events[0]?.sequence, 1);
		assert.equal(events[0]?.source_phase, null);
		assert.equal(events[0]?.target_phase, "start");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("publisher de-duplicates on repeated event_id (at-least-once idempotent)", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-b");
		const base = sampleState({ run_id: "run-b" });
		emitRunStarted(publisher, base, "2026-04-19T00:00:00Z");
		// Second publisher instance sees the existing log and dedups.
		const reborn = createLocalFsObservationEventPublisher(root, "run-b");
		emitRunStarted(reborn, base, "2026-04-19T00:00:00Z");
		const events = readLog(root, "run-b");
		assert.equal(events.length, 1, "duplicate should not be appended");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("publisher refuses events scoped to a different run", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-x");
		assert.throws(() => {
			emitRunStarted(
				publisher,
				sampleState({ run_id: "run-OTHER" }),
				"2026-04-19T00:00:00Z",
			);
		}, /scoped to run/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- advance event sequence -------------------------------------------------

test("emitAdvanceEvents emits phase_entered without phase_completed when from is 'start'", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-c");
		// seed with run_started at sequence 1
		emitRunStarted(
			publisher,
			sampleState({ run_id: "run-c" }),
			"2026-04-19T00:00:00Z",
		);
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({ run_id: "run-c", current_phase: "start" }),
			newState: sampleState({
				run_id: "run-c",
				current_phase: "proposal_draft",
			}),
			event: "propose",
			mutations: [],
			timestamp: "2026-04-19T00:00:01Z",
			highestSequence: publisher.highestSequence(),
		});
		const kinds = readLog(root, "run-c").map((e) => e.event_kind);
		assert.deepEqual(kinds, ["run_started", "phase_entered"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents emits phase_completed then phase_entered for normal transition", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-d");
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-d",
				current_phase: "proposal_draft",
			}),
			newState: sampleState({
				run_id: "run-d",
				current_phase: "proposal_scope",
			}),
			event: "check_scope",
			mutations: [],
			timestamp: "2026-04-19T00:00:02Z",
			highestSequence: 1,
		});
		const events = readLog(root, "run-d");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, ["phase_completed", "phase_entered"]);
		// Sequences continue from highestSequence.
		assert.equal(events[0]?.sequence, 2);
		assert.equal(events[1]?.sequence, 3);
		// Causal chaining: second event references the first.
		assert.equal(events[1]?.causal_context?.kind, "observation_event");
		assert.equal(
			events[1]?.causal_context?.kind === "observation_event"
				? events[1]?.causal_context?.ref
				: null,
			events[0]?.event_id,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents emits gate_resolved before phase_completed on gate update, threading gate_ref", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-e");
		const resolvedApproval: ApprovalRecord = {
			record_id: "approval-run-e-1",
			record_kind: "approval",
			run_id: "run-e",
			phase_from: "approval_gate_design",
			phase_to: "design_ready",
			status: "approved",
			requested_at: "2026-04-19T00:00:00Z",
			decided_at: "2026-04-19T00:00:03Z",
			decision_actor: { actor: "human", actor_id: "cli" },
			event_ids: [],
		};
		const mutation: EmitRecordMutation = {
			kind: "update",
			record: resolvedApproval,
		};
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-e",
				current_phase: "approval_gate_design",
			}),
			newState: sampleState({ run_id: "run-e", current_phase: "design_ready" }),
			event: "design_review_approved",
			mutations: [mutation],
			timestamp: "2026-04-19T00:00:03Z",
			highestSequence: 4,
		});
		const events = readLog(root, "run-e");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"gate_resolved",
			"phase_completed",
			"phase_entered",
		]);
		// R1-F03: gate_ref must be threaded to caused phase events.
		assert.equal(events[0]?.gate_ref, "approval-run-e-1");
		assert.equal(
			events[1]?.gate_ref,
			"approval-run-e-1",
			"phase_completed should carry gate_ref",
		);
		assert.equal(
			events[2]?.gate_ref,
			"approval-run-e-1",
			"phase_entered should carry gate_ref",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents emits gate_opened after phase_entered when a gate is created", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-f");
		const created: ApprovalRecord = {
			record_id: "approval-run-f-1",
			record_kind: "approval",
			run_id: "run-f",
			phase_from: "approval_gate_design",
			phase_to: "design_ready",
			status: "pending",
			requested_at: "2026-04-19T00:00:04Z",
			decided_at: null,
			decision_actor: null,
			event_ids: [],
		};
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-f",
				current_phase: "design_review",
			}),
			newState: sampleState({
				run_id: "run-f",
				current_phase: "approval_gate_design",
			}),
			event: "design_review_approved",
			mutations: [{ kind: "create", record: created }],
			timestamp: "2026-04-19T00:00:04Z",
			highestSequence: 10,
		});
		const kinds = readLog(root, "run-f").map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"phase_completed",
			"phase_entered",
			"gate_opened",
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents emits run_terminal when entering a terminal phase", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-g");
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-g",
				current_phase: "apply_ready",
			}),
			newState: sampleState({
				run_id: "run-g",
				current_phase: "approved",
				status: "terminal",
			}),
			event: "approve",
			mutations: [],
			timestamp: "2026-04-19T00:00:05Z",
			highestSequence: 20,
		});
		const events = readLog(root, "run-g");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"phase_completed",
			"phase_entered",
			"run_terminal",
		]);
		const terminal = events[2];
		assert.equal(terminal?.event_kind, "run_terminal");
		if (terminal?.event_kind === "run_terminal") {
			assert.equal(terminal.payload.status, "approved");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitRunSuspended and emitRunResumed append at the next sequence", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-h");
		emitRunSuspended(
			publisher,
			sampleState({
				run_id: "run-h",
				current_phase: "design_draft",
				status: "suspended",
			}),
			"2026-04-19T00:01:00Z",
			3,
		);
		emitRunResumed(
			publisher,
			sampleState({
				run_id: "run-h",
				current_phase: "design_draft",
				status: "active",
			}),
			"2026-04-19T00:02:00Z",
			4,
		);
		const events = readLog(root, "run-h");
		assert.deepEqual(
			events.map((e) => [e.event_kind, e.sequence]),
			[
				["run_suspended", 4],
				["run_resumed", 5],
			],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- envelope invariants ----------------------------------------------------

// --- R2-F01: resolvedGate parameter for pre-resolved gates -----------------

test("emitAdvanceEvents with resolvedGate emits gate_resolved for review_decision", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-j");
		const resolvedGate: ResolvedGateInfo = {
			gateId: "review_decision-run-j-design_review-1",
			gateKind: "review_decision",
			response: "accept",
			actorLabel: "human",
		};
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-j",
				current_phase: "design_review",
			}),
			newState: sampleState({
				run_id: "run-j",
				current_phase: "design_ready",
			}),
			event: "design_review_approved",
			mutations: [],
			timestamp: "2026-04-19T00:00:06Z",
			highestSequence: 5,
			resolvedGate,
		});
		const events = readLog(root, "run-j");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"gate_resolved",
			"phase_completed",
			"phase_entered",
		]);
		// gate_resolved carries the gate_ref.
		assert.equal(events[0]?.gate_ref, "review_decision-run-j-design_review-1");
		// Caused phase events also carry gate_ref (R1-F03).
		assert.equal(events[1]?.gate_ref, "review_decision-run-j-design_review-1");
		assert.equal(events[2]?.gate_ref, "review_decision-run-j-design_review-1");
		// Payload has correct resolution.
		if (events[0]?.event_kind === "gate_resolved") {
			assert.equal(events[0].payload.resolution, "approved");
			assert.equal(events[0].payload.by_actor, "human");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents with resolvedGate emits gate_rejected for reject response", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-k");
		const resolvedGate: ResolvedGateInfo = {
			gateId: "review_decision-run-k-apply_review-1",
			gateKind: "review_decision",
			response: "reject",
			actorLabel: "human",
		};
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-k",
				current_phase: "apply_review",
			}),
			newState: sampleState({
				run_id: "run-k",
				current_phase: "rejected",
				status: "terminal",
			}),
			event: "reject",
			mutations: [],
			timestamp: "2026-04-19T00:00:07Z",
			highestSequence: 10,
			resolvedGate,
		});
		const events = readLog(root, "run-k");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"gate_rejected",
			"phase_completed",
			"phase_entered",
			"run_terminal",
		]);
		if (events[0]?.event_kind === "gate_rejected") {
			assert.equal(events[0].payload.resolution, "rejected");
		}
		// run_terminal also carries gate_ref from the causing gate.
		assert.equal(events[3]?.gate_ref, "review_decision-run-k-apply_review-1");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("emitAdvanceEvents with resolvedGate emits gate_resolved with changes_requested", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-l");
		const resolvedGate: ResolvedGateInfo = {
			gateId: "review_decision-run-l-design_review-1",
			gateKind: "review_decision",
			response: "request_changes",
			actorLabel: "human",
		};
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-l",
				current_phase: "design_review",
			}),
			newState: sampleState({
				run_id: "run-l",
				current_phase: "design_draft",
			}),
			event: "revise_design",
			mutations: [],
			timestamp: "2026-04-19T00:00:08Z",
			highestSequence: 8,
			resolvedGate,
		});
		const events = readLog(root, "run-l");
		const kinds = events.map((e) => e.event_kind);
		assert.deepEqual(kinds, [
			"gate_resolved",
			"phase_completed",
			"phase_entered",
		]);
		if (events[0]?.event_kind === "gate_resolved") {
			assert.equal(events[0].payload.resolution, "changes_requested");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R2-F02: emitGateOpened for review_decision gates ----------------------

test("emitGateOpened emits a gate_opened event for review_decision", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-m");
		// Seed with run_started so the log has a baseline.
		emitRunStarted(
			publisher,
			sampleState({ run_id: "run-m" }),
			"2026-04-19T00:00:00Z",
		);
		emitGateOpened({
			publisher,
			runId: "run-m",
			changeId: "change-foo",
			gateId: "review_decision-run-m-design_review-1",
			gateKind: "review_decision",
			originatingPhase: "design_review",
			timestamp: "2026-04-19T00:00:09Z",
			highestSequence: publisher.highestSequence(),
		});
		const events = readLog(root, "run-m");
		assert.equal(events.length, 2);
		const gateEvent = events[1];
		assert.equal(gateEvent?.event_kind, "gate_opened");
		assert.equal(gateEvent?.gate_ref, "review_decision-run-m-design_review-1");
		assert.equal(gateEvent?.source_phase, "design_review");
		// R3-F06: causal_context must be null (no prior observation event caused it).
		assert.equal(
			gateEvent?.causal_context,
			null,
			"gate_opened for review_decision should have null causal_context",
		);
		if (gateEvent?.event_kind === "gate_opened") {
			assert.equal(gateEvent.payload.gate_kind, "review_decision");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R1-F03: phase events without gate have null gate_ref ------------------

test("phase events without a gate have null gate_ref", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-n");
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-n",
				current_phase: "proposal_draft",
			}),
			newState: sampleState({
				run_id: "run-n",
				current_phase: "proposal_scope",
			}),
			event: "check_scope",
			mutations: [],
			timestamp: "2026-04-19T00:00:10Z",
			highestSequence: 1,
		});
		const events = readLog(root, "run-n");
		for (const event of events) {
			assert.equal(
				event.gate_ref,
				null,
				`${event.event_kind} should have null gate_ref without gate`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- envelope invariants ----------------------------------------------------

test("every emitted event carries all twelve envelope fields", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-i");
		emitRunStarted(
			publisher,
			sampleState({ run_id: "run-i" }),
			"2026-04-19T00:00:00Z",
		);
		emitAdvanceEvents({
			publisher,
			priorState: sampleState({
				run_id: "run-i",
				current_phase: "proposal_draft",
			}),
			newState: sampleState({
				run_id: "run-i",
				current_phase: "proposal_scope",
			}),
			event: "check_scope",
			mutations: [],
			timestamp: "2026-04-19T00:00:01Z",
			highestSequence: 1,
		});
		const events = readLog(root, "run-i");
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
		for (const event of events) {
			for (const field of requiredFields) {
				assert.ok(
					field in event,
					`envelope missing '${field}' on ${event.event_kind}`,
				);
			}
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R3-F05: withLockedPublisher for atomic sequence allocation -------------

test("withLockedPublisher creates events with correct sequences", () => {
	const root = makeTempRoot();
	try {
		withLockedPublisher(root, "run-lock-a", (publisher) => {
			emitRunStarted(
				publisher,
				sampleState({ run_id: "run-lock-a" }),
				"2026-04-19T00:00:00Z",
			);
			emitAdvanceEvents({
				publisher,
				priorState: sampleState({
					run_id: "run-lock-a",
					current_phase: "start",
				}),
				newState: sampleState({
					run_id: "run-lock-a",
					current_phase: "proposal_draft",
				}),
				event: "propose",
				mutations: [],
				timestamp: "2026-04-19T00:00:01Z",
				highestSequence: publisher.highestSequence(),
			});
		});
		const events = readLog(root, "run-lock-a");
		assert.equal(events.length, 2);
		assert.equal(events[0]?.sequence, 1);
		assert.equal(events[1]?.sequence, 2);
		// The advance's first event is caused by the user event "propose"
		// (not by run_started — they are separate emission calls).
		assert.equal(events[1]?.causal_context?.kind, "user_event");
		if (events[1]?.causal_context?.kind === "user_event") {
			assert.equal(events[1].causal_context.ref, "propose");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("withLockedPublisher reads current state under lock", () => {
	const root = makeTempRoot();
	try {
		// First batch writes events 1-2.
		withLockedPublisher(root, "run-lock-b", (publisher) => {
			emitRunStarted(
				publisher,
				sampleState({ run_id: "run-lock-b" }),
				"2026-04-19T00:00:00Z",
			);
		});
		// Second batch reads the existing log and continues from the right sequence.
		withLockedPublisher(root, "run-lock-b", (publisher) => {
			assert.equal(
				publisher.highestSequence(),
				1,
				"should see event from first batch",
			);
			emitAdvanceEvents({
				publisher,
				priorState: sampleState({
					run_id: "run-lock-b",
					current_phase: "start",
				}),
				newState: sampleState({
					run_id: "run-lock-b",
					current_phase: "proposal_draft",
				}),
				event: "propose",
				mutations: [],
				timestamp: "2026-04-19T00:00:01Z",
				highestSequence: publisher.highestSequence(),
			});
		});
		const events = readLog(root, "run-lock-b");
		assert.equal(events.length, 2);
		assert.equal(events[0]?.sequence, 1);
		assert.equal(events[1]?.sequence, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R3-F06: emitGateOpened with custom causalRef --------------------------

test("emitGateOpened accepts custom causalRef when provided", () => {
	const root = makeTempRoot();
	try {
		const publisher = createLocalFsObservationEventPublisher(root, "run-o");
		emitGateOpened({
			publisher,
			runId: "run-o",
			changeId: "change-foo",
			gateId: "review_decision-run-o-1",
			gateKind: "review_decision",
			originatingPhase: "design_review",
			timestamp: "2026-04-19T00:00:00Z",
			highestSequence: 0,
			causalRef: { kind: "user_event", ref: "design_review_initiated" },
		});
		const events = readLog(root, "run-o");
		assert.equal(events.length, 1);
		assert.deepEqual(events[0]?.causal_context, {
			kind: "user_event",
			ref: "design_review_initiated",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
