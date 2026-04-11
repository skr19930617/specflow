import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { atomicWriteText } from "../lib/fs.js";
import { parseJson } from "../lib/json.js";
import {
	moduleRepoRoot,
	printSchemaJson,
	resolveCommand,
	tryExec,
} from "../lib/process.js";
import {
	deriveChangeId,
	readProposalSourceFile,
	renderSeededProposal,
} from "../lib/proposal-source.js";
import { parseSchemaJson } from "../lib/schemas.js";
import type { ProposalSource, RunState } from "../types/contracts.js";

const HELP_TEXT = `Usage: specflow-prepare-change [CHANGE_ID] --source-file <path> [--agent-main <name>] [--agent-review <name>]

Create or reuse a local OpenSpec change, seed proposal.md, and enter proposal_draft.
`;

interface ProposalInstructions {
	readonly outputPath?: string;
	readonly template?: string;
	readonly instruction?: string;
}

function usage(): never {
	process.stderr.write(HELP_TEXT);
	process.exit(1);
}

function fail(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function git(
	args: readonly string[],
	root = process.cwd(),
): { stdout: string; stderr: string; status: number } {
	return tryExec("git", args, root);
}

function gitString(args: readonly string[], root = process.cwd()): string {
	const result = git(args, root);
	if (result.status !== 0) {
		fail(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
	}
	return result.stdout.trim();
}

function projectRoot(): string {
	return gitString(["rev-parse", "--show-toplevel"]);
}

function openspec(
	args: readonly string[],
	root: string,
): { stdout: string; stderr: string; status: number } {
	return tryExec(resolveCommand("SPECFLOW_OPENSPEC", "openspec"), args, root);
}

function specflowRun(
	args: readonly string[],
	root: string,
): { stdout: string; stderr: string; status: number } {
	return tryExec(
		process.env.SPECFLOW_RUN ??
			resolve(moduleRepoRoot(import.meta.url), "bin/specflow-run"),
		args,
		root,
	);
}

function changeDir(root: string, changeId: string): string {
	return resolve(root, "openspec/changes", changeId);
}

function proposalPath(root: string, changeId: string): string {
	return resolve(changeDir(root, changeId), "proposal.md");
}

function ensureChangeExists(root: string, changeId: string): void {
	if (existsSync(changeDir(root, changeId))) {
		return;
	}
	const result = openspec(["new", "change", changeId], root);
	if (result.status !== 0) {
		fail(
			result.stderr ||
				result.stdout ||
				`openspec new change ${changeId} failed`,
		);
	}
	if (!existsSync(changeDir(root, changeId))) {
		fail(`Error: OpenSpec did not create change directory for '${changeId}'`);
	}
}

function ensureBranch(root: string, changeId: string): void {
	const current = gitString(["branch", "--show-current"], root);
	if (current === changeId) {
		return;
	}
	const existing = git(
		["rev-parse", "--verify", `refs/heads/${changeId}`],
		root,
	);
	const checkoutArgs =
		existing.status === 0
			? ["checkout", changeId]
			: ["checkout", "-b", changeId];
	const checkout = git(checkoutArgs, root);
	if (checkout.status !== 0) {
		fail(
			checkout.stderr ||
				checkout.stdout ||
				`git ${checkoutArgs.join(" ")} failed`,
		);
	}
}

function loadProposalInstructions(
	root: string,
	changeId: string,
): ProposalInstructions {
	const result = openspec(
		["instructions", "proposal", "--change", changeId, "--json"],
		root,
	);
	if (result.status !== 0) {
		fail(
			result.stderr ||
				result.stdout ||
				`openspec instructions proposal --change ${changeId} --json failed`,
		);
	}
	return parseJson<ProposalInstructions>(
		result.stdout,
		"openspec proposal instructions",
	);
}

function ensureProposalDraft(
	root: string,
	changeId: string,
	source: ProposalSource,
): void {
	const path = proposalPath(root, changeId);
	if (existsSync(path) && readFileSync(path, "utf8").trim().length > 0) {
		return;
	}
	const instructions = loadProposalInstructions(root, changeId);
	const outputPath = instructions.outputPath ?? "proposal.md";
	if (outputPath !== "proposal.md") {
		fail(
			`Error: expected OpenSpec proposal outputPath to be proposal.md, received '${outputPath}'`,
		);
	}
	atomicWriteText(
		path,
		`${renderSeededProposal(changeId, source, instructions)}\n`,
	);
}

function findExistingNonTerminalRun(
	root: string,
	changeId: string,
): RunState | null {
	const runsPath = resolve(root, ".specflow/runs");
	try {
		const { readdirSync } = require("node:fs") as typeof import("node:fs");
		const entries = readdirSync(runsPath);
		const prefix = `${changeId}-`;
		const matchingDirs = entries
			.filter((entry: string) => entry.startsWith(prefix))
			.sort();
		for (let idx = matchingDirs.length - 1; idx >= 0; idx--) {
			const dirName = matchingDirs[idx]!;
			const result = specflowRun(["status", dirName], root);
			if (result.status === 0) {
				const state = parseSchemaJson<RunState>(
					"run-state",
					result.stdout,
					`specflow-run status ${dirName}`,
				);
				if (state.status !== "terminal") {
					return state;
				}
			}
		}
	} catch {
		// runs dir doesn't exist yet — that's fine
	}
	return null;
}

function ensureRunStarted(
	root: string,
	changeId: string,
	sourceFile: string,
	agentMain: string | null,
	agentReview: string | null,
): RunState {
	// Check for existing non-terminal run for this change
	const existing = findExistingNonTerminalRun(root, changeId);
	if (existing) {
		return existing;
	}
	const args = ["start", changeId, "--source-file", sourceFile];
	if (agentMain) {
		args.push("--agent-main", agentMain);
	}
	if (agentReview) {
		args.push("--agent-review", agentReview);
	}
	const start = specflowRun(args, root);
	if (start.status !== 0) {
		fail(
			start.stderr || start.stdout || `specflow-run start ${changeId} failed`,
		);
	}
	return parseSchemaJson<RunState>(
		"run-state",
		start.stdout,
		`specflow-run start ${changeId}`,
	);
}

function ensureProposalPhase(
	root: string,
	_changeId: string,
	state: RunState,
): RunState {
	if (state.current_phase !== "start") {
		return state;
	}
	const runId = state.run_id;
	const advance = specflowRun(["advance", runId, "propose"], root);
	if (advance.status !== 0) {
		fail(
			advance.stderr ||
				advance.stdout ||
				`specflow-run advance ${runId} propose failed`,
		);
	}
	return parseSchemaJson<RunState>(
		"run-state",
		advance.stdout,
		`specflow-run advance ${runId} propose`,
	);
}

function main(): void {
	let requestedChangeId: string | null = null;
	let sourceFile = "";
	let agentMain: string | null = null;
	let agentReview: string | null = null;

	for (let index = 2; index < process.argv.length; index += 1) {
		const arg = process.argv[index];
		if (!arg) {
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			usage();
		}
		if (arg === "--source-file") {
			sourceFile =
				process.argv[++index] ?? fail("Error: --source-file requires a value");
			continue;
		}
		if (arg === "--agent-main") {
			agentMain =
				process.argv[++index] ?? fail("Error: --agent-main requires a value");
			continue;
		}
		if (arg === "--agent-review") {
			agentReview =
				process.argv[++index] ?? fail("Error: --agent-review requires a value");
			continue;
		}
		if (arg.startsWith("-")) {
			fail(`Error: unknown option '${arg}'`);
		}
		if (requestedChangeId !== null) {
			fail(`Error: unexpected argument '${arg}'`);
		}
		requestedChangeId = arg;
	}

	if (!sourceFile) {
		fail("Error: --source-file is required");
	}

	const source = readProposalSourceFile(sourceFile);
	const changeId = requestedChangeId ?? deriveChangeId(source);
	const root = projectRoot();

	ensureChangeExists(root, changeId);
	ensureBranch(root, changeId);
	ensureProposalDraft(root, changeId, source);

	const state = ensureProposalPhase(
		root,
		changeId,
		ensureRunStarted(root, changeId, sourceFile, agentMain, agentReview),
	);
	printSchemaJson("run-state", state);
}

main();
