import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	ChangeArtifactStore,
	RunArtifactStore,
} from "../lib/artifact-store.js";
import {
	ArtifactNotFoundError,
	ChangeArtifactType,
	changeRef,
	runRef,
} from "../lib/artifact-types.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import { readSourceMetadataFile } from "../lib/proposal-source.js";
import {
	findRunsForChange,
	generateRunId,
	readRunState,
} from "../lib/run-store-ops.js";
import {
	deriveAllowedEvents,
	isTerminalPhase,
} from "../lib/workflow-machine.js";
import type { RunKind, RunState, RunStatus } from "../types/contracts.js";

type JsonObject = Record<string, unknown>;

interface WorkflowDefinition {
	readonly version: string;
	readonly states: readonly string[];
	readonly events: readonly string[];
	readonly transitions: readonly { from: string; event: string; to: string }[];
}

function fail(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function git(args: readonly string[]): string {
	try {
		return execFileSync("git", [...args], {
			cwd: process.cwd(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch {
		fail("Error: not inside a git repository");
	}
}

function gitOrFail(args: readonly string[], message: string): string {
	try {
		return execFileSync("git", [...args], {
			cwd: process.cwd(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch {
		fail(message);
	}
}

function projectRoot(): string {
	return git(["rev-parse", "--show-toplevel"]);
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

function validateRunId(runId: string): void {
	if (runId.includes("/") || runId.includes("..") || runId === ".") {
		fail(`Error: invalid run_id '${runId}'. Must not contain '/' or '..'`);
	}
}

function validateChangeRunId(
	changeId: string,
	changeStore: ChangeArtifactStore,
): void {
	validateRunId(changeId);
	const ref = changeRef(changeId, ChangeArtifactType.Proposal);
	if (!changeStore.exists(ref)) {
		fail(
			`Error: no OpenSpec proposal found for '${changeId}'. Expected file: openspec/changes/${changeId}/proposal.md`,
		);
	}
}

function ensureRunExists(store: RunArtifactStore, runId: string): void {
	const ref = runRef(runId);
	if (!store.exists(ref)) {
		fail(`Error: run '${runId}' not found. No state file at ${runId}/run.json`);
	}
}

function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function detectProjectId(): string {
	const remote = gitOrFail(
		["remote", "get-url", "origin"],
		"Error: could not detect git remote origin",
	);
	return remote.replace(/\.git$/, "").replace(/^.*[:/]([^/]+\/[^/]+)$/, "$1");
}

function writeRunState(
	store: RunArtifactStore,
	runId: string,
	state: RunState,
): void {
	store.write(runRef(runId), `${JSON.stringify(state, null, 2)}\n`);
}

function validateRunSchema(runState: RunState): void {
	const requiredFields = [
		"project_id",
		"repo_name",
		"repo_path",
		"branch_name",
		"worktree_path",
		"agents",
		"source",
		"last_summary_path",
	] as const;
	const missing = requiredFields.filter((field) => !(field in runState));
	if (missing.length > 0) {
		fail(
			`Error: run state is missing required fields: ${missing.join(" ")}. This run was created with an older schema. Please delete it and re-create with 'specflow-run start'.`,
		);
	}
}

function cmdStart(
	args: string[],
	_root: string,
	workflow: WorkflowDefinition,
	runStore: RunArtifactStore,
	changeStore: ChangeArtifactStore,
): void {
	let positionalArg = "";
	let sourceFile = "";
	let agentMain = "claude";
	let agentReview = "codex";
	let runKind: RunKind = "change";
	let retryFlag = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
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
			retryFlag = true;
			continue;
		}
		if (arg.startsWith("-")) {
			fail(`Error: unknown option '${arg}'`);
		}
		if (positionalArg) {
			fail(`Error: unexpected argument '${arg}'`);
		}
		positionalArg = arg;
	}

	if (!positionalArg) {
		fail(
			"Usage: specflow-run start <change_id|run_id> [--source-file <path>] [--agent-main <name>] [--agent-review <name>] [--run-kind <change|synthetic>] [--retry]",
		);
	}

	if (runKind === "synthetic") {
		// Synthetic run: accept run_id verbatim, bypass change directory lookup
		if (retryFlag) {
			fail("Error: --retry is not supported for synthetic runs");
		}
		const syntheticRunId = positionalArg;
		validateRunId(syntheticRunId);
		if (runStore.exists(runRef(syntheticRunId))) {
			fail(`Error: run '${syntheticRunId}' already exists`);
		}

		const state: RunState = {
			run_id: syntheticRunId,
			change_name: null,
			current_phase: "start",
			status: "active" as RunStatus,
			allowed_events: deriveAllowedEvents("active", "start"),
			source: sourceFile ? readSourceMetadataFile(sourceFile) : null,
			project_id: detectProjectId(),
			repo_name: detectProjectId(),
			repo_path: gitOrFail(
				["rev-parse", "--show-toplevel"],
				"Error: could not detect repository root",
			),
			branch_name: gitOrFail(
				["rev-parse", "--abbrev-ref", "HEAD"],
				"Error: could not detect current branch",
			),
			worktree_path: gitOrFail(
				["rev-parse", "--show-toplevel"],
				"Error: could not detect worktree path",
			),
			agents: { main: agentMain, review: agentReview },
			last_summary_path: null,
			created_at: nowIso(),
			updated_at: nowIso(),
			history: [],
			run_kind: "synthetic" as const,
			previous_run_id: null,
		};

		writeRunState(runStore, syntheticRunId, state);
		printSchemaJson("run-state", state);
		return;
	}

	// Change run: positionalArg is change_id
	const changeId = positionalArg;
	validateChangeRunId(changeId, changeStore);

	const existingRuns = findRunsForChange(runStore, changeId);

	// Check concurrency invariant: one non-terminal run per change
	const nonTerminalRun = existingRuns.find((run) => run.status !== "terminal");
	if (nonTerminalRun) {
		if (nonTerminalRun.status === "suspended") {
			fail(
				`Error: Suspended run exists (${nonTerminalRun.run_id}) — resume or reject it first`,
			);
		}
		fail(`Error: Active run already exists (${nonTerminalRun.run_id})`);
	}

	// If prior terminal runs exist, require --retry
	if (existingRuns.length > 0 && !retryFlag) {
		fail(
			"Error: prior runs exist for this change. Use --retry to create a new run",
		);
	}

	let previousRunId: string | null = null;
	let source = sourceFile ? readSourceMetadataFile(sourceFile) : null;
	let agents = { main: agentMain, review: agentReview };

	if (retryFlag) {
		if (existingRuns.length === 0) {
			fail("Error: --retry requires at least one prior run");
		}
		const latestRun = existingRuns[existingRuns.length - 1]!;
		if (latestRun.current_phase === "rejected") {
			fail("Error: Rejected changes cannot be retried — create a new change");
		}
		previousRunId = latestRun.run_id;
		// Copy fields from prior run
		if (!source && latestRun.source) {
			source = latestRun.source;
		}
		agents = { ...latestRun.agents };
	}

	const newRunId = generateRunId(runStore, changeId);

	const state: RunState = {
		run_id: newRunId,
		change_name: changeId,
		current_phase: "start",
		status: "active" as RunStatus,
		allowed_events: deriveAllowedEvents("active", "start"),
		source,
		project_id: detectProjectId(),
		repo_name: detectProjectId(),
		repo_path: gitOrFail(
			["rev-parse", "--show-toplevel"],
			"Error: could not detect repository root",
		),
		branch_name: gitOrFail(
			["rev-parse", "--abbrev-ref", "HEAD"],
			"Error: could not detect current branch",
		),
		worktree_path: gitOrFail(
			["rev-parse", "--show-toplevel"],
			"Error: could not detect worktree path",
		),
		agents,
		last_summary_path: null,
		created_at: nowIso(),
		updated_at: nowIso(),
		history: [],
		previous_run_id: previousRunId,
	};

	writeRunState(runStore, newRunId, state);
	printSchemaJson("run-state", state);
}

function cmdAdvance(
	args: string[],
	_root: string,
	workflow: WorkflowDefinition,
	store: RunArtifactStore,
): void {
	const runId = args[0];
	const event = args[1];
	if (!runId || !event) {
		fail("Usage: specflow-run advance <run_id> <event>");
	}

	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	validateRunSchema(runState);

	// Reject phase events when suspended
	if (runState.status === "suspended") {
		fail(`Error: Run is suspended — resume first. Only 'resume' is allowed.`);
	}

	const transition = workflow.transitions.find(
		(candidate) =>
			candidate.from === runState.current_phase && candidate.event === event,
	);
	if (!transition) {
		const allowed = deriveAllowedEvents(
			runState.status as RunStatus,
			runState.current_phase,
		);
		fail(
			`Error: invalid transition. Event '${event}' is not allowed in state '${runState.current_phase}'. Allowed events: ${allowed.join(", ")}`,
		);
	}

	const newStatus: RunStatus = isTerminalPhase(transition.to)
		? "terminal"
		: (runState.status as RunStatus);

	const updated: RunState = {
		...runState,
		current_phase: transition.to,
		status: newStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents(newStatus, transition.to),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: transition.to,
				event,
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(store, runId, updated);
	printSchemaJson("run-state", updated);
}

function cmdSuspend(args: string[], store: RunArtifactStore): void {
	const runId = args[0];
	if (!runId) {
		fail("Usage: specflow-run suspend <run_id>");
	}

	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	validateRunSchema(runState);

	if (runState.status === "terminal") {
		fail("Error: Cannot suspend a terminal run");
	}
	if (runState.status === "suspended") {
		fail("Error: Run is already suspended");
	}

	const updated: RunState = {
		...runState,
		status: "suspended" as RunStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents("suspended", runState.current_phase),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: runState.current_phase,
				event: "suspend",
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(store, runId, updated);
	printSchemaJson("run-state", updated);
}

function cmdResume(args: string[], store: RunArtifactStore): void {
	const runId = args[0];
	if (!runId) {
		fail("Usage: specflow-run resume <run_id>");
	}

	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	validateRunSchema(runState);

	if (runState.status !== "suspended") {
		fail("Error: Run is not suspended");
	}

	const updated: RunState = {
		...runState,
		status: "active" as RunStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents("active", runState.current_phase),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: runState.current_phase,
				event: "resume",
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(store, runId, updated);
	printSchemaJson("run-state", updated);
}

function cmdStatus(args: string[], store: RunArtifactStore): void {
	const runId = args[0];
	if (!runId) {
		fail("Usage: specflow-run status <run_id>");
	}
	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	validateRunSchema(runState);
	printSchemaJson("run-state", runState);
}

function cmdUpdateField(args: string[], store: RunArtifactStore): void {
	const [runId, field, value] = args;
	if (!runId || !field || value === undefined) {
		fail("Usage: specflow-run update-field <run_id> <field> <value>");
	}
	if (field !== "last_summary_path") {
		fail(
			`Error: field '${field}' is not updatable. Allowed fields: last_summary_path`,
		);
	}
	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	validateRunSchema(runState);
	const updated: RunState = {
		...runState,
		[field]: value,
		updated_at: nowIso(),
	};
	writeRunState(store, runId, updated);
	printSchemaJson("run-state", updated);
}

function cmdGetField(args: string[], store: RunArtifactStore): void {
	const [runId, field] = args;
	if (!runId || !field) {
		fail("Usage: specflow-run get-field <run_id> <field>");
	}
	ensureRunExists(store, runId);
	const runState = readRunState(store, runId);
	const value = (runState as JsonObject)[field];
	if (value === undefined) {
		fail(`Error: field '${field}' not found in run state`);
	}
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(): void {
	const root = projectRoot();
	const workflow = loadWorkflow(stateMachinePath(root));
	const runStore = createLocalFsRunArtifactStore(root);
	const changeStore = createLocalFsChangeArtifactStore(root);
	const [subcommand, ...args] = process.argv.slice(2);

	switch (subcommand) {
		case "start":
			cmdStart(args, root, workflow, runStore, changeStore);
			return;
		case "advance":
			cmdAdvance(args, root, workflow, runStore);
			return;
		case "suspend":
			cmdSuspend(args, runStore);
			return;
		case "resume":
			cmdResume(args, runStore);
			return;
		case "status":
			cmdStatus(args, runStore);
			return;
		case "update-field":
			cmdUpdateField(args, runStore);
			return;
		case "get-field":
			cmdGetField(args, runStore);
			return;
		case undefined:
			fail(
				"Usage: specflow-run <start|advance|suspend|resume|status|update-field|get-field> [args...]",
			);
			return;
		default:
			fail(
				`Error: unknown subcommand '${subcommand}'. Use: start, advance, suspend, resume, status, update-field, get-field`,
			);
	}
}

main();
