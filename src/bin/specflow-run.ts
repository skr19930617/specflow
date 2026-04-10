import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import type { RunKind, RunState } from "../types/contracts.js";
import { readSourceMetadataFile } from "../lib/proposal-source.js";

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

function validateChangeRunId(root: string, runId: string): void {
	validateRunId(runId);
	const changeDir = resolve(root, "openspec/changes", runId);
	try {
		const stat = readFileSync(resolve(changeDir, "proposal.md"), "utf8");
		void stat;
	} catch {
		fail(
			`Error: no OpenSpec proposal found for '${runId}'. Expected file: openspec/changes/${runId}/proposal.md`,
		);
	}
}

function runsDir(root: string): string {
	return resolve(root, ".specflow/runs");
}

function runDir(root: string, runId: string): string {
	return resolve(runsDir(root), runId);
}

function runFile(root: string, runId: string): string {
	return resolve(runDir(root, runId), "run.json");
}

function ensureRunExists(root: string, runId: string): string {
	const path = runFile(root, runId);
	try {
		readFileSync(path, "utf8");
		return path;
	} catch {
		fail(`Error: run '${runId}' not found. No state file at ${path}`);
	}
}

function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function allowedEventsFor(
	workflow: WorkflowDefinition,
	state: string,
): string[] {
	return workflow.transitions
		.filter((transition) => transition.from === state)
		.map((transition) => transition.event);
}

function detectProjectId(): string {
	const remote = gitOrFail(
		["remote", "get-url", "origin"],
		"Error: could not detect git remote origin",
	);
	return remote.replace(/\.git$/, "").replace(/^.*[:/]([^/]+\/[^/]+)$/, "$1");
}

function atomicWrite(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tempPath = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	writeFileSync(tempPath, content, "utf8");
	renameSync(tempPath, path);
}

function readRunState(path: string): RunState {
	return JSON.parse(readFileSync(path, "utf8")) as RunState;
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
	root: string,
	workflow: WorkflowDefinition,
): void {
	let runId = "";
	let sourceFile = "";
	let agentMain = "claude";
	let agentReview = "codex";
	let runKind: RunKind = "change";

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
		if (arg.startsWith("-")) {
			fail(`Error: unknown option '${arg}'`);
		}
		if (runId) {
			fail(`Error: unexpected argument '${arg}'`);
		}
		runId = arg;
	}

	if (!runId) {
		fail(
			"Usage: specflow-run start <run_id> [--source-file <path>] [--agent-main <name>] [--agent-review <name>] [--run-kind <change|synthetic>]",
		);
	}

	if (runKind === "change") {
		validateChangeRunId(root, runId);
	} else {
		validateRunId(runId);
	}
	const path = runFile(root, runId);
	try {
		readFileSync(path, "utf8");
		fail(`Error: run '${runId}' already exists at ${path}`);
	} catch {
		// New run.
	}

	const state: RunState = {
		run_id: runId,
		change_name: runKind === "synthetic" ? null : runId,
		current_phase: "start",
		status: "active",
		allowed_events: allowedEventsFor(workflow, "start"),
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
		...(runKind === "synthetic" ? { run_kind: "synthetic" as const } : {}),
	};

	atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
	printSchemaJson("run-state", state);
}

function cmdAdvance(
	args: string[],
	root: string,
	workflow: WorkflowDefinition,
): void {
	const runId = args[0];
	const event = args[1];
	if (!runId || !event) {
		fail("Usage: specflow-run advance <run_id> <event>");
	}

	const path = ensureRunExists(root, runId);
	const runState = readRunState(path);
	validateRunSchema(runState);

	const transition = workflow.transitions.find(
		(candidate) =>
			candidate.from === runState.current_phase && candidate.event === event,
	);
	if (!transition) {
		const allowed = allowedEventsFor(workflow, runState.current_phase);
		fail(
			`Error: invalid transition. Event '${event}' is not allowed in state '${runState.current_phase}'. Allowed events: ${allowed.join(", ")}`,
		);
	}

	const updated: RunState = {
		...runState,
		current_phase: transition.to,
		updated_at: nowIso(),
		allowed_events: allowedEventsFor(workflow, transition.to),
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

	atomicWrite(path, `${JSON.stringify(updated, null, 2)}\n`);
	printSchemaJson("run-state", updated);
}

function cmdStatus(args: string[], root: string): void {
	const runId = args[0];
	if (!runId) {
		fail("Usage: specflow-run status <run_id>");
	}
	const path = ensureRunExists(root, runId);
	const runState = readRunState(path);
	validateRunSchema(runState);
	printSchemaJson("run-state", runState);
}

function cmdUpdateField(args: string[], root: string): void {
	const [runId, field, value] = args;
	if (!runId || !field || value === undefined) {
		fail("Usage: specflow-run update-field <run_id> <field> <value>");
	}
	if (field !== "last_summary_path") {
		fail(
			`Error: field '${field}' is not updatable. Allowed fields: last_summary_path`,
		);
	}
	const path = ensureRunExists(root, runId);
	const runState = readRunState(path);
	validateRunSchema(runState);
	const updated: RunState = {
		...runState,
		[field]: value,
		updated_at: nowIso(),
	};
	atomicWrite(path, `${JSON.stringify(updated, null, 2)}\n`);
	printSchemaJson("run-state", updated);
}

function cmdGetField(args: string[], root: string): void {
	const [runId, field] = args;
	if (!runId || !field) {
		fail("Usage: specflow-run get-field <run_id> <field>");
	}
	const path = ensureRunExists(root, runId);
	const runState = readRunState(path);
	const value = (runState as JsonObject)[field];
	if (value === undefined) {
		fail(`Error: field '${field}' not found in run state`);
	}
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(): void {
	const root = projectRoot();
	const workflow = loadWorkflow(stateMachinePath(root));
	const [subcommand, ...args] = process.argv.slice(2);

	switch (subcommand) {
		case "start":
			cmdStart(args, root, workflow);
			return;
		case "advance":
			cmdAdvance(args, root, workflow);
			return;
		case "status":
			cmdStatus(args, root);
			return;
		case "update-field":
			cmdUpdateField(args, root);
			return;
		case "get-field":
			cmdGetField(args, root);
			return;
		case undefined:
			fail(
				"Usage: specflow-run <start|advance|status|update-field|get-field> [args...]",
			);
			return;
		default:
			fail(
				`Error: unknown subcommand '${subcommand}'. Use: start, advance, status, update-field, get-field`,
			);
	}
}

main();
