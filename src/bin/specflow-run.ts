// specflow-run — local CLI wiring layer over the pure core runtime.
//
// Responsibilities of this file are strictly scoped:
//  * argv parsing (flag / value / positional handling)
//  * discovery of `state-machine.json` (project local → dist/package → installed)
//  * construction of `LocalFs*ArtifactStore` and `LocalWorkspaceContext`
//  * gathering precondition inputs (reads, adapter seed, nextRunId, nowIso)
//  * invoking pure core functions
//  * persisting returned state via `RunArtifactStore.write` and applying
//    `RecordMutation[]` via `GateRecordStore` (translated by the gate-mutation bridge)
//  * mapping `Result<Ok, CoreRuntimeError>` to process stdout / stderr / exit code
//
// All workflow logic lives under `src/core/`. This file must not contain
// business rules (state-machine transitions, suspend/resume guards, etc.).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkflowDefinition } from "../core/advance.js";
import type {
	CoreRuntimeError,
	RecordMutation,
	Result,
	RunStateOf,
	TransitionOk,
} from "../core/run-core.js";
import {
	advanceRun,
	resumeRun,
	startChangeRun,
	startSyntheticRun,
	suspendRun,
	updateRunField,
} from "../core/run-core.js";
import type { RunArtifactStore } from "../lib/artifact-store.js";
import {
	ChangeArtifactType,
	changeRef,
	runRef,
} from "../lib/artifact-types.js";
import {
	gateRecordsToInteractionRecords,
	mirrorMutationsToGateStore,
} from "../lib/gate-mutation-bridge.js";
import type { GateRecordStore } from "../lib/gate-record-store.js";
import { GateRuntimeError, resolveGate } from "../lib/gate-runtime.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import { withLockedPublisher } from "../lib/local-fs-observation-event-publisher.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { createLocalWorkspaceContext } from "../lib/local-workspace-context.js";
import {
	emitAdvanceEvents,
	emitRunResumed,
	emitRunStarted,
	emitRunSuspended,
	type ResolvedGateInfo,
} from "../lib/observation-event-emitter.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import { readSourceMetadataFile } from "../lib/proposal-source.js";
import {
	findRunsForChange,
	generateRunId,
	readRunState,
} from "../lib/run-store-ops.js";
import type { WorkspaceContext } from "../lib/workspace-context.js";
import type {
	LocalRunState,
	RunKind,
	RunState,
	SchemaId,
	SourceMetadata,
} from "../types/contracts.js";
import type { GateKind, GateRecord } from "../types/gate-records.js";
import { UnmigratedRecordError } from "../types/gate-records.js";

// ---------------------------------------------------------------------------
// Gate-aware event mapping
// ---------------------------------------------------------------------------

/**
 * Map a workflow event to a gate response token for the given gate kind.
 * Returns null when the event does not correspond to a gate response,
 * meaning the advance should proceed without gate resolution.
 */
function eventToGateResponse(event: string, gateKind: GateKind): string | null {
	if (gateKind === "approval") {
		if (event.startsWith("accept")) return "accept";
		if (event === "reject") return "reject";
		return null;
	}
	if (gateKind === "review_decision") {
		if (event.startsWith("accept")) return "accept";
		if (event === "reject") return "reject";
		if (event === "request_changes") return "request_changes";
		return null;
	}
	if (gateKind === "clarify") {
		if (event === "clarify_response") return "clarify_response";
		return null;
	}
	return null;
}

/**
 * Returns true when `event` is an unambiguous gate-response token that
 * should never appear as a raw workflow transition without a pending gate.
 * `accept_*` events are NOT included because they serve dual duty as both
 * gate responses (when a gate is pending) and regular workflow events
 * (e.g. `accept_proposal` at phases without a gate).
 * `reject` IS included because it is always a gate response — there is no
 * workflow transition where `reject` is valid without a pending gate.
 */
function isUnambiguousGateResponseEvent(event: string): boolean {
	return (
		event === "reject" ||
		event === "request_changes" ||
		event === "clarify_response"
	);
}

/**
 * Find pending gates at the given phase. Returns the first matching
 * approval or review_decision gate (which have at-most-one-pending
 * concurrency), or the first matching clarify gate.
 */
function findPendingGateForPhase(
	gates: readonly GateRecord[],
	phase: string,
): GateRecord | null {
	for (const gate of gates) {
		if (gate.status === "pending" && gate.originating_phase === phase) {
			return gate;
		}
	}
	return null;
}

/**
 * If a pending gate exists for the current phase and the incoming event
 * maps to a valid gate response, resolve the gate via the first-class
 * gate runtime. This enforces `allowed_responses`, `eligible_responder_roles`,
 * and invalid-response checks **before** the state machine advance fires.
 *
 * Returns `ResolvedGateInfo` when a gate was resolved, so the caller can
 * pass it to the observation event emitter (the advance's `recordMutations`
 * will not contain the terminal update after the re-read).
 *
 * Gate validation errors (invalid response, ineligible role, gate not
 * pending) abort the advance with a hard failure so that callers cannot
 * bypass gate rules by sending raw workflow events.
 *
 * When no pending gate exists at the current phase, the advance proceeds
 * normally — the event is a regular workflow transition, not a gate
 * resolution.
 */
function resolveGateForEvent(
	store: GateRecordStore,
	runId: string,
	currentPhase: string,
	event: string,
	gates: readonly GateRecord[],
): ResolvedGateInfo | null {
	const pendingGate = findPendingGateForPhase(gates, currentPhase);

	// When no pending gate exists at the current phase, most events proceed
	// as regular workflow transitions. However, unambiguous gate-response
	// tokens (request_changes, clarify_response) should never be sent as
	// raw events without a corresponding pending gate.
	if (!pendingGate) {
		if (isUnambiguousGateResponseEvent(event)) {
			throw new GateRuntimeError(
				"gate_not_found",
				`Event '${event}' is a gate-response event but no pending gate exists at phase '${currentPhase}'. ` +
					`Gate-response events require a corresponding pending gate.`,
			);
		}
		return null;
	}

	const response = eventToGateResponse(event, pendingGate.gate_kind);
	if (!response) return null;

	// Gate resolution failures are hard errors — the advance must not
	// proceed if the gate runtime rejects the response.
	const resolved = resolveGate(store, {
		run_id: runId,
		gate_id: pendingGate.gate_id,
		response,
		actor: { actor: "human", actor_id: "cli" },
		actor_role: "human-author",
		resolved_at: nowIso(),
	});
	return {
		gateId: resolved.gate_id,
		gateKind: resolved.gate_kind as ResolvedGateInfo["gateKind"],
		response: resolved.resolved_response ?? response,
		actorLabel: resolved.decision_actor?.actor ?? "human",
	};
}

function fail(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function projectRoot(): string {
	try {
		return createLocalWorkspaceContext().projectRoot();
	} catch {
		fail("Error: not inside a git repository");
	}
}

function stateMachinePath(root: string): string {
	const projectLocal = resolve(root, "global/workflow/state-machine.json");
	try {
		readFileSync(projectLocal, "utf8");
		return projectLocal;
	} catch {
		const moduleLocal = resolve(
			moduleRepoRoot(import.meta.url),
			"dist/package/global/workflow/state-machine.json",
		);
		try {
			readFileSync(moduleLocal, "utf8");
			return moduleLocal;
		} catch {
			const installed = resolve(
				process.env.HOME ?? "",
				".config/specflow/global/workflow/state-machine.json",
			);
			try {
				readFileSync(installed, "utf8");
				return installed;
			} catch {
				fail(
					"Error: state-machine.json not found. Check project global/workflow/, dist/package/global/workflow/, or ~/.config/specflow/global/workflow/",
				);
			}
		}
	}
}

function loadWorkflow(path: string): WorkflowDefinition {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as WorkflowDefinition;
	} catch {
		fail("Error: state-machine.json is not valid JSON");
	}
}

/**
 * Build the local adapter seed from the workspace context. This is the one
 * place in the process where LocalRunState fields are produced.
 */
function buildLocalSeed(ctx: WorkspaceContext): LocalRunState {
	return {
		project_id: ctx.projectIdentity(),
		repo_name: ctx.projectDisplayName(),
		repo_path: ctx.projectRoot(),
		branch_name: ctx.branchName() ?? "HEAD",
		worktree_path: ctx.worktreePath(),
		last_summary_path: null,
	};
}

/**
 * Persist a run state through the injected store using atomic replacement.
 */
async function persistState(
	store: RunArtifactStore,
	runId: string,
	state: RunState,
): Promise<void> {
	await store.write(runRef(runId), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Apply record mutations via the GateRecordStore. The bridge translates
 * legacy RecordMutation shapes to GateRecord writes. Delete mutations are
 * translated to `superseded` status writes so gate records persist as
 * history (per workflow-gate-semantics spec).
 *
 * Best-effort per mutation: each mutation is attempted independently so one
 * failure does not suppress the rest of the batch. Failures are surfaced as
 * warnings; the transition itself is considered committed.
 */
function applyGateMutations(
	store: GateRecordStore,
	runId: string,
	mutations: readonly RecordMutation[],
): void {
	const errors = mirrorMutationsToGateStore(store, runId, mutations);
	for (const err of errors) {
		process.stderr.write(
			`Warning: gate record mutation failed (${err.kind}, ${err.recordId}): ${err.error.message}\n`,
		);
	}
}

/**
 * Render a core runtime Result to the shell. Ok payloads go to stdout as
 * schema-tagged JSON; errors go to stderr with the message as-is and the
 * process exits with code 1.
 */
function renderResult<T>(
	schemaId: SchemaId,
	result: Result<T, CoreRuntimeError>,
): never {
	if (result.ok) {
		printSchemaJson(schemaId, result.value);
		process.exit(0);
	}
	process.stderr.write(`${result.error.message}\n`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Observation-event emission helpers — scoped to the CLI wiring layer so the
// core runtime stays unaware of transport concerns. Failures propagate to
// `commitTransitionAndExit` which signals them via exit code 1.
// ---------------------------------------------------------------------------

function runsRootFrom(projectRoot: string): string {
	return resolve(projectRoot, ".specflow/runs");
}

function emitStartEvent(
	projectRoot: string,
	runId: string,
	state: RunStateOf<LocalRunState>,
	timestamp: string,
): void {
	withLockedPublisher(runsRootFrom(projectRoot), runId, (publisher) => {
		emitRunStarted(publisher, state, timestamp);
	});
}

function emitAdvanceEvent(
	projectRoot: string,
	runId: string,
	priorState: RunStateOf<LocalRunState>,
	newState: RunStateOf<LocalRunState>,
	event: string,
	mutations: readonly RecordMutation[],
	timestamp: string,
	resolvedGate?: ResolvedGateInfo | null,
): void {
	withLockedPublisher(runsRootFrom(projectRoot), runId, (publisher) => {
		emitAdvanceEvents({
			publisher,
			priorState,
			newState,
			event,
			mutations,
			timestamp,
			highestSequence: publisher.highestSequence(),
			resolvedGate,
		});
	});
}

function emitSuspendEvent(
	projectRoot: string,
	runId: string,
	state: RunStateOf<LocalRunState>,
	timestamp: string,
): void {
	withLockedPublisher(runsRootFrom(projectRoot), runId, (publisher) => {
		emitRunSuspended(publisher, state, timestamp, publisher.highestSequence());
	});
}

function emitResumeEvent(
	projectRoot: string,
	runId: string,
	state: RunStateOf<LocalRunState>,
	timestamp: string,
): void {
	withLockedPublisher(runsRootFrom(projectRoot), runId, (publisher) => {
		emitRunResumed(publisher, state, timestamp, publisher.highestSequence());
	});
}

/**
 * Commit a TransitionOk from a core command: persist state, apply record
 * mutations, emit observation events, print the new state as JSON, and exit.
 *
 * Observation events are emitted **after** the authoritative snapshot and
 * gate writes succeed, so the event log never records a transition whose
 * state commit failed. If emission fails the state is still committed (the
 * authoritative write cannot be rolled back), but the process exits with
 * code 1 to signal a hard failure — the spec requires the event stream to
 * stay consistent with the snapshot, so an incomplete event log is a
 * command failure, not a warning. Callers can detect the non-zero exit and
 * trigger a reconciliation pass.
 */
async function commitTransitionAndExit(
	runStore: RunArtifactStore,
	gates: GateRecordStore | null,
	runId: string,
	transitionOk: TransitionOk<LocalRunState>,
	postCommit?: () => void,
): Promise<never> {
	await persistState(runStore, runId, transitionOk.state);
	if (gates) {
		applyGateMutations(gates, runId, transitionOk.recordMutations);
	}
	if (postCommit) {
		try {
			postCommit();
		} catch (cause) {
			process.stderr.write(
				`Error: observation event emission failed after state commit: ${cause instanceof Error ? cause.message : String(cause)}\n`,
			);
			// State is committed but event log is incomplete — hard failure.
			// Print the committed state so callers know the new state, then
			// exit non-zero so orchestration scripts can reconcile.
			printSchemaJson("run-state", transitionOk.state);
			process.exit(1);
		}
	}
	printSchemaJson("run-state", transitionOk.state);
	process.exit(0);
}

// --- Argument parsing helpers ---------------------------------------------

interface StartArgs {
	readonly positional: string;
	readonly sourceFile: string;
	readonly agentMain: string;
	readonly agentReview: string;
	readonly runKind: RunKind;
	readonly retry: boolean;
}

function parseStartArgs(args: readonly string[]): StartArgs {
	let positional = "";
	let sourceFile = "";
	let agentMain = "claude";
	let agentReview = "codex";
	let runKind: RunKind = "change";
	let retry = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) continue;
		if (arg === "--source-file") {
			sourceFile =
				args[++index] ?? fail("Error: --source-file requires a value");
			continue;
		}
		if (arg === "--agent-main") {
			agentMain = args[++index] ?? fail("Error: --agent-main requires a value");
			continue;
		}
		if (arg === "--agent-review") {
			agentReview =
				args[++index] ?? fail("Error: --agent-review requires a value");
			continue;
		}
		if (arg === "--run-kind") {
			const value = args[++index] ?? fail("Error: --run-kind requires a value");
			if (value !== "change" && value !== "synthetic") {
				fail("Error: --run-kind must be 'change' or 'synthetic'");
			}
			runKind = value;
			continue;
		}
		if (arg === "--retry") {
			retry = true;
			continue;
		}
		if (arg.startsWith("-")) {
			fail(`Error: unknown option '${arg}'`);
		}
		if (positional) {
			fail(`Error: unexpected argument '${arg}'`);
		}
		positional = arg;
	}

	if (!positional) {
		fail(
			"Usage: specflow-run start <change_id|run_id> [--source-file <path>] [--agent-main <name>] [--agent-review <name>] [--run-kind <change|synthetic>] [--retry]",
		);
	}

	return {
		positional,
		sourceFile,
		agentMain,
		agentReview,
		runKind,
		retry,
	};
}

// --- Subcommand glue ------------------------------------------------------

async function runStart(args: readonly string[]): Promise<never> {
	let ctx: WorkspaceContext;
	try {
		ctx = createLocalWorkspaceContext();
	} catch {
		process.stdout.write('{"status":"error","error":"not_in_git_repo"}\n');
		process.exit(1);
	}
	const root = ctx.projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	const changeStore = createLocalFsChangeArtifactStore(root);
	const gates = createLocalFsGateRecordStore(root);

	const parsed = parseStartArgs(args);
	const source: SourceMetadata | null = parsed.sourceFile
		? readSourceMetadataFile(parsed.sourceFile)
		: null;
	const agents = { main: parsed.agentMain, review: parsed.agentReview };
	const adapterSeed = buildLocalSeed(ctx);
	const ts = nowIso();

	if (parsed.runKind === "synthetic") {
		if (parsed.retry) {
			fail("Error: --retry is not supported for synthetic runs");
		}
		const existingRunExists = await runStore.exists(runRef(parsed.positional));
		const result = startSyntheticRun<LocalRunState>({
			runId: parsed.positional,
			source,
			agents,
			existingRunExists,
			nowIso: ts,
			adapterSeed,
		});
		if (!result.ok) renderResult("run-state", result);
		return commitTransitionAndExit(
			runStore,
			gates,
			parsed.positional,
			result.value,
			() => emitStartEvent(root, parsed.positional, result.value.state, ts),
		);
	}

	// Change run
	const proposalExists = await changeStore.exists(
		changeRef(parsed.positional, ChangeArtifactType.Proposal),
	);
	const priorRuns = await findRunsForChange(runStore, parsed.positional);
	const nextRunId = await generateRunId(runStore, parsed.positional);

	const result = startChangeRun<LocalRunState>({
		changeId: parsed.positional,
		source,
		agents,
		retry: parsed.retry,
		proposalExists,
		priorRuns,
		nextRunId,
		nowIso: ts,
		adapterSeed,
	});
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, gates, nextRunId, result.value, () =>
		emitStartEvent(root, nextRunId, result.value.state, ts),
	);
}

async function runAdvance(args: readonly string[]): Promise<never> {
	const runId = args[0];
	const event = args[1];
	if (!runId || !event) {
		fail("Usage: specflow-run advance <run_id> <event>");
	}
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	const gates = createLocalFsGateRecordStore(root);
	const workflow = loadWorkflow(stateMachinePath(root));

	// Read current state.
	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = (await readRunState(
		runStore,
		runId,
	)) as RunStateOf<LocalRunState>;

	// Read prior records from the gate store and translate back to the legacy
	// InteractionRecord shape for the core runtime's priorRecords input.
	let gateRecords: readonly GateRecord[];
	let priorRecords: readonly import("../types/interaction-records.js").InteractionRecord[];
	try {
		gateRecords = gates.list(runId);
		priorRecords = gateRecordsToInteractionRecords(gateRecords);
	} catch (cause) {
		if (cause instanceof UnmigratedRecordError) {
			fail(`Error: ${cause.message}`);
		}
		throw cause;
	}

	// Resolve any pending gate whose allowed_responses match the incoming
	// event. This enforces the first-class gate validation (eligible roles,
	// allowed responses) before the state machine transition fires. Gate
	// validation failures abort the advance with a hard error.
	let resolvedGate: ResolvedGateInfo | null = null;
	try {
		resolvedGate = resolveGateForEvent(
			gates,
			runId,
			state.current_phase,
			event,
			gateRecords,
		);
	} catch (cause) {
		if (cause instanceof GateRuntimeError) {
			fail(`Error: gate resolution rejected: ${cause.message}`);
		}
		throw cause;
	}

	// Re-read gate records after resolution so that advanceRun() sees the
	// resolved state, not the stale pending snapshot. Without this refresh,
	// the core runtime's update mutations (based on the stale pending record)
	// would overwrite the already-resolved gate via mirrorMutationsToGateStore.
	gateRecords = gates.list(runId);
	priorRecords = gateRecordsToInteractionRecords(gateRecords);

	const ts = nowIso();
	const result = advanceRun<LocalRunState>(
		{
			state,
			event,
			nowIso: ts,
			priorRecords,
		},
		{ workflow },
	);
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, gates, runId, result.value, () =>
		emitAdvanceEvent(
			root,
			runId,
			state,
			result.value.state,
			event,
			result.value.recordMutations,
			ts,
			resolvedGate,
		),
	);
}

async function runSuspend(args: readonly string[]): Promise<never> {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run suspend <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);

	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = (await readRunState(
		runStore,
		runId,
	)) as RunStateOf<LocalRunState>;
	const ts = nowIso();
	const result = suspendRun<LocalRunState>({ state, nowIso: ts });
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, null, runId, result.value, () =>
		emitSuspendEvent(root, runId, result.value.state, ts),
	);
}

async function runResume(args: readonly string[]): Promise<never> {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run resume <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);

	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = (await readRunState(
		runStore,
		runId,
	)) as RunStateOf<LocalRunState>;
	const ts = nowIso();
	const result = resumeRun<LocalRunState>({ state, nowIso: ts });
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, null, runId, result.value, () =>
		emitResumeEvent(root, runId, result.value.state, ts),
	);
}

async function runStatus(args: readonly string[]): Promise<never> {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run status <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);

	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = await readRunState(runStore, runId);
	printSchemaJson("run-state", state);
	process.exit(0);
}

async function runUpdateField(args: readonly string[]): Promise<never> {
	const [runId, field, value] = args;
	if (!runId || !field || value === undefined) {
		fail("Usage: specflow-run update-field <run_id> <field> <value>");
	}
	// Wiring-layer whitelist: the only updatable field in the local-FS
	// adapter today is `last_summary_path`. External adapters may expose a
	// different set via their own wiring.
	if (field !== "last_summary_path") {
		process.stderr.write(
			`Error: field '${field}' is not updatable. Allowed fields: last_summary_path\n`,
		);
		process.exit(1);
	}
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);

	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = (await readRunState(
		runStore,
		runId,
	)) as RunStateOf<LocalRunState>;
	const result = updateRunField<LocalRunState>({
		state,
		field,
		value,
		nowIso: nowIso(),
	});
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, null, runId, result.value);
}

async function runGetField(args: readonly string[]): Promise<never> {
	const [runId, field] = args;
	if (!runId || !field) fail("Usage: specflow-run get-field <run_id> <field>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);

	if (!(await runStore.exists(runRef(runId)))) {
		process.stderr.write(
			`Error: run '${runId}' not found. No state file at ${runId}/run.json\n`,
		);
		process.exit(1);
	}
	const state = await readRunState(runStore, runId);
	const asMap = state as unknown as Record<string, unknown>;
	if (!(field in asMap)) {
		process.stderr.write(`Error: field '${field}' not found in run state\n`);
		process.exit(1);
	}
	process.stdout.write(`${JSON.stringify(asMap[field], null, 2)}\n`);
	process.exit(0);
}

async function main(): Promise<void> {
	const [subcommand, ...args] = process.argv.slice(2);

	switch (subcommand) {
		case "start":
			await runStart(args);
			break;
		case "advance":
			await runAdvance(args);
			break;
		case "suspend":
			await runSuspend(args);
			break;
		case "resume":
			await runResume(args);
			break;
		case "status":
			await runStatus(args);
			break;
		case "update-field":
			await runUpdateField(args);
			break;
		case "get-field":
			await runGetField(args);
			break;
		case undefined:
			fail(
				"Usage: specflow-run <start|advance|suspend|resume|status|update-field|get-field> [args...]",
			);
			break;
		default:
			fail(
				`Error: unknown subcommand '${subcommand}'. Use: start, advance, suspend, resume, status, update-field, get-field`,
			);
	}
}

main().catch((err: unknown) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
