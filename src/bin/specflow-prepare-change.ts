import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
	ChangeArtifactStore,
	RunArtifactStore,
} from "../lib/artifact-store.js";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { matchIssueUrl } from "../lib/issue-url.js";
import { parseJson } from "../lib/json.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
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
import { findRunsForChange } from "../lib/run-store-ops.js";
import { parseSchemaJson } from "../lib/schemas.js";
import type { ProposalSource, RunState } from "../types/contracts.js";

const HELP_TEXT = `Usage: specflow-prepare-change [CHANGE_ID] <raw-input>
       specflow-prepare-change [CHANGE_ID] --source-file <path> (deprecated)

Create or reuse a local OpenSpec change, seed proposal.md, and enter proposal_draft.

Arguments:
  CHANGE_ID    Optional change identifier (derived from input if omitted)
  raw-input    Issue URL or inline feature text (auto-detected)

Options:
  --source-file <path>  (deprecated) Read pre-normalized JSON source file
  --agent-main <name>   Override main agent name
  --agent-review <name> Override review agent name
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

async function ensureChangeExists(
	root: string,
	changeId: string,
	changeStore: ChangeArtifactStore,
): Promise<void> {
	if (await changeStore.changeExists(changeId)) {
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
	if (!(await changeStore.changeExists(changeId))) {
		fail(`Error: OpenSpec did not create change directory for '${changeId}'`);
	}
}

interface MainSessionWorktree {
	readonly path: string;
	readonly baseCommit: string;
	readonly baseBranch: string | null;
}

interface WorktreeListEntry {
	readonly worktree: string;
	readonly branch: string | null;
}

function parseWorktreeList(porcelain: string): readonly WorktreeListEntry[] {
	const entries: WorktreeListEntry[] = [];
	let current: { worktree?: string; branch?: string | null } = {};
	for (const rawLine of porcelain.split("\n")) {
		const line = rawLine.trim();
		if (line === "") {
			if (current.worktree !== undefined) {
				entries.push({
					worktree: current.worktree,
					branch: current.branch ?? null,
				});
			}
			current = {};
			continue;
		}
		if (line.startsWith("worktree ")) {
			current.worktree = line.slice("worktree ".length);
		} else if (line.startsWith("branch ")) {
			const ref = line.slice("branch ".length);
			current.branch = ref.startsWith("refs/heads/")
				? ref.slice("refs/heads/".length)
				: ref;
		} else if (line === "detached") {
			current.branch = null;
		}
	}
	if (current.worktree !== undefined) {
		entries.push({
			worktree: current.worktree,
			branch: current.branch ?? null,
		});
	}
	return entries;
}

function relativeWorktreePath(changeId: string): string {
	return `.specflow/worktrees/${changeId}/main`;
}

function ensureMainSessionWorktree(
	root: string,
	changeId: string,
): MainSessionWorktree {
	const conventionalRel = relativeWorktreePath(changeId);
	const conventionalAbs = resolve(root, conventionalRel);

	const listResult = git(["worktree", "list", "--porcelain"], root);
	if (listResult.status !== 0) {
		fail(
			listResult.stderr ||
				listResult.stdout ||
				"git worktree list --porcelain failed",
		);
	}
	const worktrees = parseWorktreeList(listResult.stdout);

	const existingAtConventional = worktrees.find(
		(entry) => entry.worktree === conventionalAbs,
	);
	const existingForBranch = worktrees.find(
		(entry) => entry.branch === changeId,
	);

	if (existingAtConventional && existingAtConventional.branch === changeId) {
		// Reuse: registered worktree at conventional path tied to <CHANGE_ID>.
		const headSha = gitString(
			["-C", conventionalAbs, "rev-parse", "HEAD"],
			root,
		);
		return {
			path: conventionalAbs,
			baseCommit: headSha,
			baseBranch: null, // unknown on reuse; preserved if previously persisted
		};
	}

	if (existingAtConventional && existingAtConventional.branch !== changeId) {
		fail(
			`Error: ${conventionalRel} is registered as a worktree for branch '${existingAtConventional.branch ?? "(detached)"}', not '${changeId}'.\n` +
				`Resolve manually: 'git worktree remove ${conventionalRel}' or pick a different change_id, then re-run /specflow.`,
		);
	}

	if (existingForBranch && existingForBranch.worktree !== conventionalAbs) {
		fail(
			`Error: branch '${changeId}' is already checked out as a worktree at '${existingForBranch.worktree}', not the conventional '${conventionalRel}'.\n` +
				`Resolve manually: 'git worktree remove ${existingForBranch.worktree}', then re-run /specflow.`,
		);
	}

	if (existsSync(conventionalAbs)) {
		// Path occupied by a non-worktree directory.
		fail(
			`Error: ${conventionalRel} exists but is not a registered git worktree.\n` +
				`Resolve manually (inspect contents, then 'rm -rf ${conventionalRel}' if safe), then re-run /specflow.`,
		);
	}

	const branchExists = git(
		["rev-parse", "--verify", `refs/heads/${changeId}`],
		root,
	);
	if (branchExists.status === 0) {
		// Branch exists in registry but not bound to a worktree at the conventional path.
		fail(
			`Error: branch '${changeId}' exists locally but no worktree at '${conventionalRel}' is registered for it.\n` +
				`Resolve manually: 'git branch -D ${changeId}' (if discardable) or 'git worktree add -b ${changeId}-recovery <path>', then re-run /specflow.`,
		);
	}

	// Create the main-session worktree from the user repo's current HEAD.
	const headSha = gitString(["rev-parse", "HEAD"], root);
	const currentBranch = gitString(["branch", "--show-current"], root);
	const baseBranch = currentBranch === "" ? null : currentBranch;

	mkdirSync(resolve(root, ".specflow/worktrees", changeId), {
		recursive: true,
	});

	const addResult = git(
		["worktree", "add", "-b", changeId, conventionalAbs, headSha],
		root,
	);
	if (addResult.status !== 0) {
		fail(
			addResult.stderr ||
				addResult.stdout ||
				`git worktree add -b ${changeId} ${conventionalRel} ${headSha} failed`,
		);
	}

	return {
		path: conventionalAbs,
		baseCommit: headSha,
		baseBranch,
	};
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

async function ensureProposalDraft(
	root: string,
	changeId: string,
	source: ProposalSource,
	changeStore: ChangeArtifactStore,
): Promise<void> {
	const proposalRef = changeRef(changeId, ChangeArtifactType.Proposal);
	if (await changeStore.exists(proposalRef)) {
		try {
			const content = await changeStore.read(proposalRef);
			if (content.trim().length > 0) {
				return;
			}
		} catch {
			// Fall through to seed a new draft.
		}
	}
	const instructions = loadProposalInstructions(root, changeId);
	const outputPath = instructions.outputPath ?? "proposal.md";
	if (outputPath !== "proposal.md") {
		fail(
			`Error: expected OpenSpec proposal outputPath to be proposal.md, received '${outputPath}'`,
		);
	}
	await changeStore.write(
		proposalRef,
		`${renderSeededProposal(changeId, source, instructions)}\n`,
	);
}

async function findExistingNonTerminalRun(
	runStore: RunArtifactStore,
	changeId: string,
): Promise<RunState | null> {
	const runs = await findRunsForChange(runStore, changeId);
	for (let idx = runs.length - 1; idx >= 0; idx--) {
		const state = runs[idx]!;
		if (state.status !== "terminal") {
			return state;
		}
	}
	return null;
}

function writeInternalTempSourceFile(source: ProposalSource): string {
	const tempPath = join(tmpdir(), `specflow-source-${Date.now()}.json`);
	writeFileSync(tempPath, JSON.stringify(source, null, 2), "utf8");
	return tempPath;
}

async function ensureRunStarted(
	root: string,
	changeId: string,
	source: ProposalSource,
	agentMain: string | null,
	agentReview: string | null,
	worktree: MainSessionWorktree,
): Promise<RunState> {
	const runStore = createLocalFsRunArtifactStore(root);
	const existing = await findExistingNonTerminalRun(runStore, changeId);
	if (existing) {
		return existing;
	}
	const tempSourceFile = writeInternalTempSourceFile(source);
	try {
		const args = [
			"start",
			changeId,
			"--source-file",
			tempSourceFile,
			"--worktree-path",
			worktree.path,
			"--base-commit",
			worktree.baseCommit,
			"--base-branch",
			worktree.baseBranch ?? "",
		];
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
	} finally {
		try {
			unlinkSync(tempSourceFile);
		} catch {
			// cleanup is best-effort
		}
	}
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

function isValidChangeIdSlug(value: string): boolean {
	return !matchIssueUrl(value) && !/\s/.test(value) && value.length > 0;
}

function normalizeRawInput(rawInput: string, root: string): ProposalSource {
	const issueMatch = matchIssueUrl(rawInput);
	if (issueMatch) {
		const fetchIssueBin =
			process.env.SPECFLOW_FETCH_ISSUE ??
			resolve(moduleRepoRoot(import.meta.url), "bin/specflow-fetch-issue");
		const result = tryExec(fetchIssueBin, [rawInput], root);
		if (result.status !== 0) {
			fail(
				`Issue fetch failed: ${(result.stderr || result.stdout || "unknown error").trim()}. Verify the URL and try again.`,
			);
		}
		const issue = parseJson<{
			readonly number: number;
			readonly title: string;
			readonly body: string;
			readonly url: string;
		}>(result.stdout, "fetched issue");
		return {
			kind: "url",
			provider: "github",
			reference: rawInput.trim(),
			title: issue.title,
			body: issue.body ?? "",
		};
	}
	return {
		kind: "inline",
		provider: "generic",
		reference: rawInput.trim(),
		title: null,
		body: rawInput.trim(),
	};
}

async function main(): Promise<void> {
	const positionalArgs: string[] = [];
	let sourceFile = "";
	let agentMain: string | null = null;
	let agentReview: string | null = null;

	let endOfOptions = false;
	for (let index = 2; index < process.argv.length; index += 1) {
		const arg = process.argv[index] ?? "";
		if (endOfOptions) {
			positionalArgs.push(arg);
			continue;
		}
		if (arg === "--") {
			endOfOptions = true;
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
		if (arg.startsWith("-") && arg !== "-") {
			fail(`Error: unknown option '${arg}'`);
		}
		positionalArgs.push(arg);
	}

	// Validate arguments before any repo or file I/O
	let source: ProposalSource;
	let changeId: string;
	let rawInput: string | null = null;

	if (sourceFile) {
		// Deprecated --source-file path
		process.stderr.write(
			"Warning: --source-file is deprecated. Pass raw input as a positional argument instead.\n",
		);
		if (positionalArgs.length > 1) {
			fail(
				"Conflicting inputs: provide either a raw input argument or --source-file, not both",
			);
		}
		if (positionalArgs.length === 1) {
			const singleArg = positionalArgs[0]!;
			if (!isValidChangeIdSlug(singleArg)) {
				fail(
					"Conflicting inputs: provide either a raw input argument or --source-file, not both",
				);
			}
		}
		source = readProposalSourceFile(sourceFile);
		changeId = positionalArgs[0] ?? deriveChangeId(source);
	} else {
		// New raw-input path — validate argument shapes before repo lookup
		if (positionalArgs.length === 0) {
			fail(
				"Missing required input: provide a raw input argument or --source-file",
			);
		}
		if (positionalArgs.length > 2) {
			fail("Too many arguments: expected [CHANGE_ID] <raw-input>");
		}
		if (positionalArgs.length === 2) {
			changeId = positionalArgs[0]!;
			rawInput = positionalArgs[1]!;
		} else {
			rawInput = positionalArgs[0]!;
			changeId = ""; // derived after normalization
		}
		if (!rawInput.trim()) {
			fail("Empty input: provide a non-empty raw input");
		}
		// Defer normalization until after projectRoot() — need root for fetch
		source = undefined as unknown as ProposalSource;
	}

	const root = projectRoot();

	// Complete normalization for raw-input path (needs root for fetch)
	if (rawInput !== null) {
		source = normalizeRawInput(rawInput, root);
		if (!changeId) {
			changeId = deriveChangeId(source);
		}
	}

	// Legacy guard: if a non-terminal run already exists for this change but
	// was persisted under the legacy branch-checkout layout
	// (worktree_path == repo_path), refuse to proceed without auto-migrating.
	const runStoreForGuard = createLocalFsRunArtifactStore(root);
	const legacy = await findExistingNonTerminalRun(runStoreForGuard, changeId);
	if (
		legacy &&
		legacy.run_kind !== "synthetic" &&
		legacy.worktree_path === legacy.repo_path
	) {
		fail(
			`Error: change '${changeId}' has a legacy in-flight run (${legacy.run_id}) where worktree_path equals repo_path.\n` +
				`Drain the legacy run via /specflow.approve or /specflow.reject before re-invoking /specflow for this change.\n` +
				`(Run-state path: ${legacy.repo_path}/.specflow/runs/${legacy.run_id}/run.json)`,
		);
	}

	// Create or reuse the dedicated main-session worktree. The user repo's
	// working tree is NOT modified; the change branch lives only inside the
	// worktree.
	const worktree = ensureMainSessionWorktree(root, changeId);

	// Change artifacts (proposal/specs/design/tasks) live inside the worktree
	// because they are committed to the change branch. Run-state stays at the
	// user repo's .specflow/runs/ for global discoverability — that's why we
	// invoke specflow-run with cwd = root and explicit --worktree-path.
	const changeStore = createLocalFsChangeArtifactStore(worktree.path);
	await ensureChangeExists(worktree.path, changeId, changeStore);
	await ensureProposalDraft(worktree.path, changeId, source, changeStore);

	const state = ensureProposalPhase(
		root,
		changeId,
		await ensureRunStarted(
			root,
			changeId,
			source,
			agentMain,
			agentReview,
			worktree,
		),
	);
	printSchemaJson("run-state", state);
}

main().catch((err: unknown) => {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
