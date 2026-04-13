// specflow-run — local CLI wiring layer over the core runtime.
//
// Responsibilities of this file are strictly scoped:
//  * argv parsing (flag / value / positional handling)
//  * discovery of `state-machine.json` (project local → dist/package → installed)
//  * construction of `LocalFs*ArtifactStore` and `LocalWorkspaceContext`
//  * mapping `Result<Ok, CoreRuntimeError>` to process stdout / stderr / exit code
//
// All workflow logic lives under `src/core/`. This file must not contain
// business rules (state-machine transitions, suspend/resume guards, etc.).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkflowDefinition } from "../core/advance.js";
import type { CoreRuntimeError, Result } from "../core/run-core.js";
import {
	advanceRun,
	getRunField,
	readRunStatus,
	resumeRun,
	startChangeRun,
	startSyntheticRun,
	suspendRun,
	updateRunField,
} from "../core/run-core.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { createLocalWorkspaceContext } from "../lib/local-workspace-context.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import { readSourceMetadataFile } from "../lib/proposal-source.js";
import type { WorkspaceContext } from "../lib/workspace-context.js";
import type { RunKind, SchemaId, SourceMetadata } from "../types/contracts.js";

function fail(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
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
 * Render a core runtime Result to the shell. Ok payloads go to stdout as
 * schema-tagged JSON; errors go to stderr with the message as-is and the
 * process exits with code 1. This preserves pre-refactor CLI behavior.
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

function runStart(args: readonly string[]): never {
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

	const parsed = parseStartArgs(args);
	const source: SourceMetadata | null = parsed.sourceFile
		? readSourceMetadataFile(parsed.sourceFile)
		: null;
	const agents = { main: parsed.agentMain, review: parsed.agentReview };

	if (parsed.runKind === "synthetic") {
		if (parsed.retry) {
			fail("Error: --retry is not supported for synthetic runs");
		}
		renderResult(
			"run-state",
			startSyntheticRun(
				{ runId: parsed.positional, source, agents },
				{ runs: runStore, workspace: ctx },
			),
		);
	}

	renderResult(
		"run-state",
		startChangeRun(
			{
				changeId: parsed.positional,
				source,
				agents,
				retry: parsed.retry,
			},
			{ runs: runStore, changes: changeStore, workspace: ctx },
		),
	);
}

function runAdvance(args: readonly string[]): never {
	const runId = args[0];
	const event = args[1];
	if (!runId || !event) {
		fail("Usage: specflow-run advance <run_id> <event>");
	}
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	const workflow = loadWorkflow(stateMachinePath(root));
	renderResult(
		"run-state",
		advanceRun({ runId, event }, { runs: runStore, workflow }),
	);
}

function runSuspend(args: readonly string[]): never {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run suspend <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	renderResult("run-state", suspendRun({ runId }, { runs: runStore }));
}

function runResume(args: readonly string[]): never {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run resume <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	renderResult("run-state", resumeRun({ runId }, { runs: runStore }));
}

function runStatus(args: readonly string[]): never {
	const runId = args[0];
	if (!runId) fail("Usage: specflow-run status <run_id>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	renderResult("run-state", readRunStatus({ runId }, { runs: runStore }));
}

function runUpdateField(args: readonly string[]): never {
	const [runId, field, value] = args;
	if (!runId || !field || value === undefined) {
		fail("Usage: specflow-run update-field <run_id> <field> <value>");
	}
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	renderResult(
		"run-state",
		updateRunField({ runId, field, value }, { runs: runStore }),
	);
}

function runGetField(args: readonly string[]): never {
	const [runId, field] = args;
	if (!runId || !field) fail("Usage: specflow-run get-field <run_id> <field>");
	const root = projectRoot();
	const runStore = createLocalFsRunArtifactStore(root);
	const result = getRunField({ runId, field }, { runs: runStore });
	if (result.ok) {
		process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
		process.exit(0);
	}
	process.stderr.write(`${result.error.message}\n`);
	process.exit(1);
}

function main(): void {
	const [subcommand, ...args] = process.argv.slice(2);

	switch (subcommand) {
		case "start":
			runStart(args);
			break;
		case "advance":
			runAdvance(args);
			break;
		case "suspend":
			runSuspend(args);
			break;
		case "resume":
			runResume(args);
			break;
		case "status":
			runStatus(args);
			break;
		case "update-field":
			runUpdateField(args);
			break;
		case "get-field":
			runGetField(args);
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

main();
