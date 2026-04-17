// specflow-run — local CLI wiring layer over the pure core runtime.
//
// Responsibilities of this file are strictly scoped:
//  * argv parsing (flag / value / positional handling)
//  * discovery of `state-machine.json` (project local → dist/package → installed)
//  * construction of `LocalFs*ArtifactStore` and `LocalWorkspaceContext`
//  * gathering precondition inputs (reads, adapter seed, nextRunId, nowIso)
//  * invoking pure core functions
//  * persisting returned state via `RunArtifactStore.write` and applying
//    `RecordMutation[]` via `InteractionRecordStore`
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
import type { InteractionRecordStore } from "../lib/interaction-record-store.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsInteractionRecordStore } from "../lib/local-fs-interaction-record-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { createLocalWorkspaceContext } from "../lib/local-workspace-context.js";
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
 * Apply a list of record mutations in order. Best-effort: a failure during
 * record persistence after the state has been written is surfaced as a
 * warning, but the transition itself is considered committed.
 */
function applyRecordMutations(
	records: InteractionRecordStore,
	runId: string,
	mutations: readonly RecordMutation[],
): void {
	for (const mutation of mutations) {
		try {
			if (mutation.kind === "delete") {
				records.delete(runId, mutation.recordId);
			} else {
				records.write(runId, mutation.record);
			}
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			process.stderr.write(
				`Warning: interaction record mutation failed (${mutation.kind}): ${message}\n`,
			);
		}
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

/**
 * Commit a TransitionOk from a core command: persist state, apply record
 * mutations, print the new state as JSON, and exit successfully.
 */
async function commitTransitionAndExit(
	runStore: RunArtifactStore,
	records: InteractionRecordStore | null,
	runId: string,
	transitionOk: TransitionOk<LocalRunState>,
): Promise<never> {
	await persistState(runStore, runId, transitionOk.state);
	if (records) {
		applyRecordMutations(records, runId, transitionOk.recordMutations);
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
	const records = createLocalFsInteractionRecordStore(root);

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
			records,
			parsed.positional,
			result.value,
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
	return commitTransitionAndExit(runStore, records, nextRunId, result.value);
}

async function runAdvance(args: readonly string[]): Promise<never> {
	const runId = args[0];
	const event = args[1];
	if (!runId || !event) {
		fail("Usage: specflow-run advance <run_id> <event>");
	}
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	const records = createLocalFsInteractionRecordStore(root);
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
	const priorRecords = records.list(runId);

	const result = advanceRun<LocalRunState>(
		{
			state,
			event,
			nowIso: nowIso(),
			priorRecords,
		},
		{ workflow },
	);
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, records, runId, result.value);
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
	const result = suspendRun<LocalRunState>({ state, nowIso: nowIso() });
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, null, runId, result.value);
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
	const result = resumeRun<LocalRunState>({ state, nowIso: nowIso() });
	if (!result.ok) renderResult("run-state", result);
	return commitTransitionAndExit(runStore, null, runId, result.value);
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
