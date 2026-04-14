import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import type {
	RunArtifactQuery,
	RunArtifactRef,
} from "../lib/artifact-types.js";
import {
	deriveAction,
	InconsistentRunStateError,
	isGated,
	isTerminal,
	MalformedContractError,
	MissingContractError,
	type PhaseAction,
	type PhaseContract,
	type PhaseContractRegistry,
	PhaseRouter,
	RunReadError,
	type SurfaceEvent,
	type SurfaceEventSink,
} from "../lib/phase-router/index.js";
import { workflowStates } from "../lib/workflow-machine.js";
import type { RunHistoryEntry, RunState } from "../types/contracts.js";

// --- Fixtures and doubles -------------------------------------------------

interface InMemoryStoreOpts {
	readonly initial?: Record<string, RunState>;
	readonly corrupt?: Record<string, string>;
	readonly throwOnRead?: Record<string, Error>;
}

function createInMemoryStore(opts: InMemoryStoreOpts = {}): {
	store: RunArtifactStore;
	setRun(runId: string, state: RunState): void;
	setCorrupt(runId: string, raw: string): void;
	setThrowOnRead(runId: string, err: Error): void;
} {
	const runs: Map<string, RunState> = new Map(
		Object.entries(opts.initial ?? {}),
	);
	const corrupt: Map<string, string> = new Map(
		Object.entries(opts.corrupt ?? {}),
	);
	const throwers: Map<string, Error> = new Map(
		Object.entries(opts.throwOnRead ?? {}),
	);
	const store: RunArtifactStore = {
		read(ref: RunArtifactRef): string {
			const err = throwers.get(ref.runId);
			if (err) throw err;
			if (corrupt.has(ref.runId)) {
				return corrupt.get(ref.runId) as string;
			}
			const run = runs.get(ref.runId);
			if (!run) throw new Error(`not found: ${ref.runId}`);
			return JSON.stringify(run);
		},
		write(): void {
			throw new Error("write not allowed in this store double");
		},
		exists(ref: RunArtifactRef): boolean {
			return runs.has(ref.runId);
		},
		list(query?: RunArtifactQuery): readonly RunArtifactRef[] {
			const all: RunArtifactRef[] = [];
			for (const runId of runs.keys()) {
				if (query?.changeId && !runId.startsWith(`${query.changeId}-`))
					continue;
				all.push({ runId, type: "run-state" });
			}
			return all;
		},
	};
	return {
		store,
		setRun(runId, state) {
			runs.set(runId, state);
			corrupt.delete(runId);
			throwers.delete(runId);
		},
		setCorrupt(runId, raw) {
			corrupt.set(runId, raw);
			runs.delete(runId);
		},
		setThrowOnRead(runId, err) {
			throwers.set(runId, err);
		},
	};
}

/** Store double that fails any test that calls a write method. */
function createAssertNoWriteStore(reads: Record<string, RunState>): {
	store: RunArtifactStore;
	writeCalls: number;
} {
	const state = { writeCalls: 0 };
	const store: RunArtifactStore = {
		read(ref: RunArtifactRef): string {
			const run = reads[ref.runId];
			if (!run) throw new Error(`not found: ${ref.runId}`);
			return JSON.stringify(run);
		},
		write(): void {
			state.writeCalls += 1;
			throw new Error(
				"AssertNoWriteStore.write called — router must be read-only",
			);
		},
		exists(): boolean {
			return true;
		},
		list(): readonly RunArtifactRef[] {
			return [];
		},
	};
	return {
		store,
		get writeCalls() {
			return state.writeCalls;
		},
	};
}

interface RecordingSink extends SurfaceEventSink {
	readonly events: readonly SurfaceEvent[];
	readonly callOrder: readonly string[];
	markReturn(token: string): void;
}

function createRecordingSink(): RecordingSink {
	const events: SurfaceEvent[] = [];
	const callOrder: string[] = [];
	return {
		emit(event: SurfaceEvent): void {
			events.push(event);
			callOrder.push(`emit:${event.event_kind}`);
		},
		markReturn(token: string): void {
			callOrder.push(`return:${token}`);
		},
		get events() {
			return events;
		},
		get callOrder() {
			return callOrder;
		},
	};
}

function createRegistry(
	contracts: Record<string, PhaseContract>,
): PhaseContractRegistry {
	return {
		get(phase: string): PhaseContract | undefined {
			return contracts[phase];
		},
		phases(): readonly string[] {
			return Object.keys(contracts);
		},
	};
}

function makeRun(overrides: {
	readonly runId: string;
	readonly currentPhase: string;
	readonly history: readonly RunHistoryEntry[];
}): RunState {
	return {
		run_id: overrides.runId,
		change_name: overrides.runId.replace(/-\d+$/, ""),
		current_phase: overrides.currentPhase,
		status: "active",
		allowed_events: [],
		source: null,
		project_id: "fixture",
		repo_name: "fixture",
		repo_path: "/fixture",
		branch_name: "fixture",
		worktree_path: "/fixture",
		agents: { main: "claude", review: "codex" },
		last_summary_path: null,
		created_at: "2026-04-13T00:00:00Z",
		updated_at: "2026-04-13T00:00:00Z",
		history: overrides.history,
		previous_run_id: null,
	} as RunState;
}

/** Baseline well-formed contract fixtures covering each PhaseAction kind. */
const FIXTURE_CONTRACTS: Record<string, PhaseContract> = {
	invoke_phase: {
		phase: "invoke_phase",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
	},
	advance_phase: {
		phase: "advance_phase",
		next_action: "advance",
		gated: false,
		terminal: false,
		advance_event: "continue",
	},
	gated_phase: {
		phase: "gated_phase",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "approval_requested",
	},
	terminal_phase: {
		phase: "terminal_phase",
		next_action: "terminal",
		gated: false,
		terminal: true,
		terminal_reason: "done",
	},
};

// --- 6.1 currentPhase returns the contract for the run's phase -----------

test("PhaseRouter.currentPhase returns the contract for the run's phase", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-1",
		makeRun({
			runId: "r-1",
			currentPhase: "advance_phase",
			history: [
				{
					from: "start",
					to: "advance_phase",
					event: "propose",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const contracts = createRegistry(FIXTURE_CONTRACTS);
	const router = new PhaseRouter({ store, eventSink: sink, contracts });

	assert.deepEqual(router.currentPhase("r-1"), FIXTURE_CONTRACTS.advance_phase);
});

// --- 6.2 nextAction returns a value whose kind is in the PhaseAction union --

test("PhaseRouter.nextAction returns a value with a valid kind for every fixture contract", () => {
	const { store, setRun } = createInMemoryStore();
	const sink = createRecordingSink();
	const contracts = createRegistry(FIXTURE_CONTRACTS);
	const router = new PhaseRouter({ store, eventSink: sink, contracts });

	for (const phase of Object.keys(FIXTURE_CONTRACTS)) {
		const runId = `r-${phase}`;
		setRun(
			runId,
			makeRun({
				runId,
				currentPhase: phase,
				history: [
					{
						from: "start",
						to: phase,
						event: "enter",
						timestamp: `2026-04-13T01:${phase.length
							.toString()
							.padStart(2, "0")}:00Z`,
					},
				],
			}),
		);
		const action = router.nextAction(runId);
		assert.ok(
			(["invoke_agent", "await_user", "advance", "terminal"] as const).includes(
				action.kind,
			),
			`unexpected kind: ${action.kind}`,
		);
	}
});

// --- 6.3 Determinism -----------------------------------------------------

test("PhaseRouter.nextAction is deterministic for unchanged store snapshots", () => {
	const { store, setRun } = createInMemoryStore();
	const baseRun = makeRun({
		runId: "r-2",
		currentPhase: "advance_phase",
		history: [
			{
				from: "start",
				to: "advance_phase",
				event: "propose",
				timestamp: "2026-04-13T00:00:00Z",
			},
		],
	});
	setRun("r-2", baseRun);
	const contracts = createRegistry(FIXTURE_CONTRACTS);
	const sink = createRecordingSink();
	const router = new PhaseRouter({ store, eventSink: sink, contracts });

	const a = router.nextAction("r-2");
	const b = router.nextAction("r-2");
	assert.deepEqual(a, b);
});

// --- 6.4 Gated phase emits event synchronously before await_user returns --

test("PhaseRouter.nextAction emits the gated event before returning await_user", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-gated",
		makeRun({
			runId: "r-gated",
			currentPhase: "gated_phase",
			history: [
				{
					from: "start",
					to: "gated_phase",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const action = router.nextAction("r-gated");
	sink.markReturn("await_user");

	assert.equal(action.kind, "await_user");
	assert.deepEqual(sink.callOrder, [
		"emit:approval_requested",
		"return:await_user",
	]);
	assert.equal(sink.events.length, 1);
	assert.equal(sink.events[0]?.run_id, "r-gated");
	assert.equal(sink.events[0]?.phase, "gated_phase");
	assert.equal(sink.events[0]?.event_kind, "approval_requested");
});

// --- 6.5 Dedup within same entry -----------------------------------------

test("PhaseRouter.nextAction dedupes gated emission within the same phase-entry", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-dedup",
		makeRun({
			runId: "r-dedup",
			currentPhase: "gated_phase",
			history: [
				{
					from: "start",
					to: "gated_phase",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const a = router.nextAction("r-dedup");
	const b = router.nextAction("r-dedup");
	const c = router.nextAction("r-dedup");

	assert.deepEqual(a, b);
	assert.deepEqual(b, c);
	assert.equal(sink.events.length, 1, "expected exactly one emission");
});

// --- 6.6 Re-entering the same gated phase emits again --------------------

test("PhaseRouter.nextAction re-emits when the run re-enters the same gated phase", () => {
	const { store, setRun } = createInMemoryStore();
	const run = makeRun({
		runId: "r-reenter",
		currentPhase: "gated_phase",
		history: [
			{
				from: "start",
				to: "gated_phase",
				event: "enter",
				timestamp: "2026-04-13T00:00:00Z",
			},
		],
	});
	setRun("r-reenter", run);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	router.nextAction("r-reenter");
	router.nextAction("r-reenter"); // dedup
	assert.equal(sink.events.length, 1);

	// Simulate the run leaving and re-entering the same gated phase.
	const reEntered = makeRun({
		runId: "r-reenter",
		currentPhase: "gated_phase",
		history: [
			...run.history,
			{
				from: "gated_phase",
				to: "some_other_phase",
				event: "out",
				timestamp: "2026-04-13T01:00:00Z",
			},
			{
				from: "some_other_phase",
				to: "gated_phase",
				event: "back",
				timestamp: "2026-04-13T02:00:00Z",
			},
		],
	});
	setRun("r-reenter", reEntered);

	router.nextAction("r-reenter");
	assert.equal(
		sink.events.length,
		2,
		"expected a second emission after re-entry",
	);
	// Both emissions carry the run's current gated phase.
	assert.equal(sink.events[0]?.phase, "gated_phase");
	assert.equal(sink.events[1]?.phase, "gated_phase");
});

// --- 6.7 Caller does not need to emit ------------------------------------

test("PhaseRouter.nextAction is the sole emitter for gated events (no double source)", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-sole",
		makeRun({
			runId: "r-sole",
			currentPhase: "gated_phase",
			history: [
				{
					from: "start",
					to: "gated_phase",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const action = router.nextAction("r-sole");
	// The caller does nothing further.
	assert.equal(action.kind, "await_user");
	assert.equal(
		sink.events.length,
		1,
		"sink should only record the router's emission",
	);
});

// --- 6.8 advance does not mutate the store -------------------------------

test("PhaseRouter.nextAction does not call any write method on the store (advance)", () => {
	const run = makeRun({
		runId: "r-advance",
		currentPhase: "advance_phase",
		history: [
			{
				from: "start",
				to: "advance_phase",
				event: "propose",
				timestamp: "2026-04-13T00:00:00Z",
			},
		],
	});
	const noWrite = createAssertNoWriteStore({ "r-advance": run });
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store: noWrite.store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const action = router.nextAction("r-advance");
	assert.equal(action.kind, "advance");
	assert.equal(noWrite.writeCalls, 0);
});

// --- 6.9 advance carries the event name ----------------------------------

test("PhaseRouter.nextAction returns the advance event name from the contract", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-evt",
		makeRun({
			runId: "r-evt",
			currentPhase: "advance_phase",
			history: [
				{
					from: "start",
					to: "advance_phase",
					event: "propose",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const action = router.nextAction("r-evt") as Extract<
		PhaseAction,
		{ kind: "advance" }
	>;
	assert.equal(action.kind, "advance");
	assert.equal(action.event, "continue");
});

// --- 6.10 Terminal phase returns terminal --------------------------------

test("PhaseRouter.nextAction returns terminal for terminal contracts", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-term",
		makeRun({
			runId: "r-term",
			currentPhase: "terminal_phase",
			history: [
				{
					from: "start",
					to: "terminal_phase",
					event: "finish",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	const action = router.nextAction("r-term");
	assert.deepEqual(action, { kind: "terminal", reason: "done" });
	assert.equal(sink.events.length, 0);
});

// --- 6.11 MissingContractError ------------------------------------------

test("PhaseRouter throws MissingContractError when no contract is registered", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-miss",
		makeRun({
			runId: "r-miss",
			currentPhase: "unregistered_phase",
			history: [
				{
					from: "start",
					to: "unregistered_phase",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	assert.throws(() => router.nextAction("r-miss"), MissingContractError);
	assert.throws(() => router.currentPhase("r-miss"), MissingContractError);
	assert.equal(sink.events.length, 0);
});

// --- 6.12 MalformedContractError ----------------------------------------

test("deriveAction throws MalformedContractError on missing next_action", () => {
	assert.throws(
		() =>
			deriveAction({
				phase: "bad",
				// @ts-expect-error intentional malformed fixture
				next_action: undefined,
				gated: false,
				terminal: false,
			}),
		MalformedContractError,
	);
});

test("deriveAction throws MalformedContractError on unrecognized next_action", () => {
	assert.throws(
		() =>
			deriveAction({
				phase: "bad",
				// @ts-expect-error intentional malformed fixture
				next_action: "whatever",
				gated: false,
				terminal: false,
			}),
		MalformedContractError,
	);
});

test("deriveAction throws when invoke_agent is missing the agent field", () => {
	assert.throws(
		() =>
			deriveAction({
				phase: "bad",
				next_action: "invoke_agent",
				gated: false,
				terminal: false,
			}),
		MalformedContractError,
	);
});

test("PhaseRouter.nextAction does not emit when the contract is malformed", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-bad",
		makeRun({
			runId: "r-bad",
			currentPhase: "bad_phase",
			history: [
				{
					from: "start",
					to: "bad_phase",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry({
			bad_phase: {
				phase: "bad_phase",
				next_action: "await_user",
				gated: true,
				terminal: false,
				// gated_event_kind missing
			},
		}),
	});

	assert.throws(() => router.nextAction("r-bad"), MalformedContractError);
	assert.equal(sink.events.length, 0);
});

// --- 6.13 RunReadError --------------------------------------------------

test("PhaseRouter throws RunReadError when the store read fails", () => {
	const { store, setThrowOnRead } = createInMemoryStore();
	setThrowOnRead("r-err", new Error("disk gone"));
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	assert.throws(() => router.nextAction("r-err"), RunReadError);
});

test("PhaseRouter throws RunReadError when run.json is not valid JSON", () => {
	const { store, setCorrupt } = createInMemoryStore();
	setCorrupt("r-corrupt", "{this is not json");
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	assert.throws(() => router.currentPhase("r-corrupt"), RunReadError);
});

test("PhaseRouter throws RunReadError when run.json lacks current_phase", () => {
	const { store, setCorrupt } = createInMemoryStore();
	setCorrupt("r-no-phase", JSON.stringify({ history: [] }));
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	assert.throws(() => router.currentPhase("r-no-phase"), RunReadError);
});

// --- 6.14 InconsistentRunStateError -------------------------------------

test("PhaseRouter throws InconsistentRunStateError when terminal + gated contract collide", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-inc",
		makeRun({
			runId: "r-inc",
			currentPhase: "bad_mix",
			history: [
				{
					from: "start",
					to: "bad_mix",
					event: "enter",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry({
			bad_mix: {
				phase: "bad_mix",
				next_action: "terminal",
				gated: true,
				terminal: true,
				terminal_reason: "impossible",
				gated_event_kind: "also_impossible",
			},
		}),
	});

	assert.throws(() => router.nextAction("r-inc"), InconsistentRunStateError);
	assert.equal(sink.events.length, 0);
});

test("PhaseRouter throws InconsistentRunStateError when history has no entry for current phase", () => {
	const { store, setRun } = createInMemoryStore();
	setRun(
		"r-ghost",
		makeRun({
			runId: "r-ghost",
			currentPhase: "gated_phase",
			history: [
				{
					from: "start",
					to: "some_other_phase",
					event: "wander",
					timestamp: "2026-04-13T00:00:00Z",
				},
			],
		}),
	);
	const sink = createRecordingSink();
	const router = new PhaseRouter({
		store,
		eventSink: sink,
		contracts: createRegistry(FIXTURE_CONTRACTS),
	});

	assert.throws(() => router.nextAction("r-ghost"), InconsistentRunStateError);
	assert.equal(sink.events.length, 0);
});

// --- 6.15 No filesystem imports ------------------------------------------

function readAllSources(dir: string): string {
	const parts: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			parts.push(readAllSources(full));
			continue;
		}
		if (!name.endsWith(".ts")) continue;
		parts.push(readFileSync(full, "utf8"));
	}
	return parts.join("\n");
}

test("phase-router sources do not import node:fs or other filesystem modules", () => {
	const body = readAllSources("src/lib/phase-router");
	const forbidden = [
		/from\s+["']node:fs["']/,
		/from\s+["']fs["']/,
		/from\s+["']node:fs\/promises["']/,
		/require\s*\(\s*["']fs["']\s*\)/,
	];
	for (const pattern of forbidden) {
		assert.ok(
			!pattern.test(body),
			`phase-router unexpectedly imports a filesystem module matching ${pattern}`,
		);
	}
});

// --- 6.16 Registry-driven test loop covers every workflow phase ----------

test("phase-router test fixture must cover every workflow phase (registry-driven safety net)", () => {
	// The production PhaseContractRegistry is owned by #129. Until it lands,
	// this test asserts that we have exactly one test fixture contract per
	// PhaseAction kind so the registry-driven suite above exercises every
	// shape deriveAction supports. Acts as a reminder to add fixtures when
	// new kinds are introduced.
	const kinds = new Set<string>(
		Object.values(FIXTURE_CONTRACTS).map((c) => c.next_action),
	);
	assert.deepEqual([...kinds].sort(), [
		"advance",
		"await_user",
		"invoke_agent",
		"terminal",
	]);
	// Sanity: every workflow machine state should be addressable by a future
	// PhaseContract — assert our string comparison is live.
	assert.ok(workflowStates.length > 0);
});

// --- 4.7 No existing CLI command path imports PhaseRouter ---------------

test("no existing CLI command imports phase-router (dormant invariant)", () => {
	const roots = ["src/bin", "src/core", "src/contracts", "src/generators"];
	for (const root of roots) {
		const body = readAllSources(root);
		assert.ok(
			!/from\s+["'][^"']*phase-router[^"']*["']/.test(body),
			`${root}/ unexpectedly imports phase-router — router must stay dormant in this change`,
		);
	}
});

// --- Helpers-exported cover ---------------------------------------------

test("isGated and isTerminal classify fixture contracts correctly", () => {
	assert.equal(isGated(FIXTURE_CONTRACTS.gated_phase), true);
	assert.equal(isGated(FIXTURE_CONTRACTS.advance_phase), false);
	assert.equal(isTerminal(FIXTURE_CONTRACTS.terminal_phase), true);
	assert.equal(isTerminal(FIXTURE_CONTRACTS.advance_phase), false);
});
