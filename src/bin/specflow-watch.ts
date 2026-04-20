// specflow-watch — real-time, read-only TUI for one specflow run.
//
// Reads run-state, autofix progress snapshot, task-graph.json, and the
// observation events log from the local filesystem; renders a 16-color ANSI
// TUI; redraws on filesystem changes with a polling fallback. Exits cleanly
// on `q` or Ctrl+C, restoring the terminal.

import { argv, exit, stdin, stdout } from "node:process";

import { tryGit } from "../lib/git.js";
import {
	eventLogPath,
	tailEventsForRun,
} from "../lib/observation-event-reader.js";
import type { ArtifactReadResult } from "../lib/specflow-watch/artifact-readers.js";
import {
	autofixSnapshotPath,
	readAutofixSnapshotFile,
	readRunStateFile,
	readTaskGraphFile,
	runStatePath,
	selectActiveAutofixPhase,
	taskGraphPath,
} from "../lib/specflow-watch/artifact-readers.js";
import { resolveTrackedRun } from "../lib/specflow-watch/run-resolution.js";
import { scanRuns } from "../lib/specflow-watch/run-scan.js";
import type { Disposable } from "../lib/watch-fs.js";
import { watchPaths } from "../lib/watch-fs.js";
import {
	ALT_SCREEN_ENTER,
	ALT_SCREEN_LEAVE,
	buildEventsView,
	buildHeader,
	buildReviewView,
	buildTaskGraphView,
	CLEAR_SCREEN,
	CURSOR_HIDE,
	CURSOR_HOME,
	CURSOR_SHOW,
	moveTo,
	renderFrame,
	terminalBannerFor,
	topologicalOrder,
	type WatchModel,
} from "../lib/watch-renderer/index.js";
import type { RunState } from "../types/contracts.js";

const DEFAULT_EVENT_TAIL = 8;

interface ParsedArgs {
	readonly positional: string | null;
	readonly showHelp: boolean;
	readonly once: boolean;
}

function parseArgs(argList: readonly string[]): ParsedArgs {
	let positional: string | null = null;
	let showHelp = false;
	let once = false;
	for (const arg of argList) {
		if (arg === "--help" || arg === "-h") showHelp = true;
		else if (arg === "--once") once = true;
		else if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}`);
		else if (positional === null) positional = arg;
	}
	return { positional, showHelp, once };
}

function printHelp(): void {
	stdout.write(
		[
			"specflow-watch — real-time progress TUI for a specflow run.",
			"",
			"Usage:",
			"  specflow-watch [<run-id> | <change-name>]",
			"  specflow-watch --once     Render one frame and exit (for scripting/tests)",
			"  specflow-watch --help",
			"",
			"With no argument, resolves the latest active run whose change_name matches",
			"the current git branch.",
			"",
		].join("\n"),
	);
}

function currentBranchOrNull(cwd: string): string | null {
	const res = tryGit(["branch", "--show-current"], cwd);
	if (res.status !== 0) return null;
	const name = res.stdout.trim();
	return name.length > 0 ? name : null;
}

function repoRootOrCwd(cwd: string): string {
	const res = tryGit(["rev-parse", "--show-toplevel"], cwd);
	if (res.status !== 0 || !res.stdout.trim()) return cwd;
	return res.stdout.trim();
}

interface ModelInputs {
	readonly run: RunState;
	readonly runRead: ArtifactReadResult<RunState>;
	readonly repoRoot: string;
	readonly branch: string;
	readonly eventTail: number;
}

function buildModel(inputs: ModelInputs): WatchModel {
	const { run, runRead, repoRoot, branch, eventTail } = inputs;
	const phase = run.current_phase;
	const status = run.status;
	const header = buildHeader({
		run_id: run.run_id,
		change_name: run.change_name ?? null,
		current_phase: phase,
		status,
		branch,
	});

	// Autofix snapshot: select by current_phase, never mix gates.
	const selected = selectActiveAutofixPhase(phase);
	let reviewRead: ArtifactReadResult<
		NonNullable<
			Parameters<typeof buildReviewView>[1]
		> extends ArtifactReadResult<infer U>
			? U
			: never
	> = { kind: "absent" };
	if (selected !== null) {
		reviewRead = readAutofixSnapshotFile(repoRoot, run.run_id, selected);
	}
	const review = buildReviewView(selected !== null, reviewRead);

	// Task graph
	const changeForGraph = run.change_name ?? "";
	const graphRead = changeForGraph
		? readTaskGraphFile(repoRoot, changeForGraph)
		: ({ kind: "absent" } as const);
	const taskGraphView = buildTaskGraphView(
		graphRead.kind === "ok"
			? { kind: "ok", value: { bundles: graphRead.value.bundles } }
			: graphRead,
		(bs) => topologicalOrder([...bs]),
	);

	// Events
	const events = tailEventsForRun(
		eventLogPath(repoRoot, run.run_id),
		run.run_id,
		eventTail,
	);
	const eventsView = buildEventsView(events);

	return {
		header,
		terminal_banner: runRead.kind === "ok" ? terminalBannerFor(status) : null,
		review,
		task_graph: taskGraphView,
		events: eventsView,
	};
}

interface PaintContext {
	lastFrame: readonly string[] | null;
}

function paint(
	ctx: PaintContext,
	model: WatchModel,
	cols: number,
	rows: number,
): void {
	const frame = renderFrame(model, cols, rows);
	if (ctx.lastFrame === null) {
		stdout.write(CLEAR_SCREEN + CURSOR_HOME);
		for (let i = 0; i < frame.length; i++) {
			stdout.write(`${moveTo(i + 1, 1)}${frame[i]}`);
		}
		ctx.lastFrame = frame;
		return;
	}
	for (let i = 0; i < frame.length; i++) {
		if (i >= ctx.lastFrame.length || ctx.lastFrame[i] !== frame[i]) {
			stdout.write(`${moveTo(i + 1, 1)}${frame[i]}`);
		}
	}
	// If previous frame was taller, blank the remaining rows.
	if (ctx.lastFrame.length > frame.length) {
		for (let i = frame.length; i < ctx.lastFrame.length; i++) {
			stdout.write(`${moveTo(i + 1, 1)}${" ".repeat(cols)}`);
		}
	}
	ctx.lastFrame = frame;
}

function enterTui(): void {
	stdout.write(ALT_SCREEN_ENTER + CURSOR_HIDE + CLEAR_SCREEN + CURSOR_HOME);
}

function leaveTui(): void {
	stdout.write(CURSOR_SHOW + ALT_SCREEN_LEAVE);
}

function installKeyHandlers(onExit: () => void): () => void {
	if (!stdin.isTTY) return () => undefined;
	stdin.setRawMode(true);
	stdin.resume();
	const handler = (buf: Buffer): void => {
		const s = buf.toString("utf8");
		if (s === "q" || s === "Q" || s === "\u0003" /* Ctrl+C */) {
			onExit();
		}
	};
	stdin.on("data", handler);
	return () => {
		stdin.removeListener("data", handler);
		try {
			stdin.setRawMode(false);
		} catch {
			/* ignore */
		}
		stdin.pause();
	};
}

function dimensions(): { cols: number; rows: number } {
	const cols = (stdout as unknown as { columns?: number }).columns ?? 80;
	const rows = (stdout as unknown as { rows?: number }).rows ?? 40;
	return { cols, rows };
}

function failHard(message: string): never {
	process.stderr.write(`${message}\n`);
	exit(1);
}

function main(): void {
	const args = parseArgs(argv.slice(2));
	if (args.showHelp) {
		printHelp();
		return;
	}
	const cwd = process.cwd();
	const repoRoot = repoRootOrCwd(cwd);
	const branch = currentBranchOrNull(cwd);

	const runs = scanRuns(repoRoot);
	const resolved = resolveTrackedRun({
		arg: args.positional,
		branch,
		runs,
	});
	if (!resolved.ok) {
		failHard(`specflow-watch: ${resolved.error.message}`);
	}
	const run = resolved.run;

	const runRead = readRunStateFile(repoRoot, run.run_id);
	if (runRead.kind !== "ok") {
		failHard(
			`specflow-watch: cannot read run-state for '${run.run_id}': ${
				runRead.kind === "malformed" || runRead.kind === "unreadable"
					? runRead.reason
					: "file not found"
			}`,
		);
	}

	const effectiveBranch = branch ?? (run.branch_name || "");
	let current: RunState = runRead.value;

	function rebuild(): WatchModel {
		const latest = readRunStateFile(repoRoot, run.run_id);
		if (latest.kind === "ok") current = latest.value;
		return buildModel({
			run: current,
			runRead: latest,
			repoRoot,
			branch: effectiveBranch,
			eventTail: DEFAULT_EVENT_TAIL,
		});
	}

	const paintCtx: PaintContext = { lastFrame: null };
	let { cols, rows } = dimensions();

	function redraw(): void {
		({ cols, rows } = dimensions());
		const model = rebuild();
		paint(paintCtx, model, cols, rows);
	}

	if (args.once) {
		const model = rebuild();
		const frame = renderFrame(model, cols, rows);
		stdout.write(`${frame.join("\n")}\n`);
		return;
	}

	enterTui();
	redraw();

	const watchedPaths: string[] = [
		runStatePath(repoRoot, run.run_id),
		autofixSnapshotPath(repoRoot, run.run_id, "design_review"),
		autofixSnapshotPath(repoRoot, run.run_id, "apply_review"),
		eventLogPath(repoRoot, run.run_id),
	];
	if (run.change_name) {
		watchedPaths.push(taskGraphPath(repoRoot, run.change_name));
	}
	let sub: Disposable | null = watchPaths(watchedPaths, {
		onChange: redraw,
	});

	const onResize = (): void => {
		paintCtx.lastFrame = null;
		redraw();
	};
	stdout.on("resize", onResize);

	let exiting = false;
	const detachKeys = installKeyHandlers(() => {
		if (exiting) return;
		exiting = true;
		cleanup();
		exit(0);
	});

	function cleanup(): void {
		try {
			stdout.removeListener("resize", onResize);
		} catch {
			/* ignore */
		}
		detachKeys();
		try {
			sub?.dispose();
		} catch {
			/* ignore */
		}
		sub = null;
		leaveTui();
	}

	process.on("SIGTERM", () => {
		if (exiting) return;
		exiting = true;
		cleanup();
		exit(0);
	});
	process.on("uncaughtException", (err) => {
		try {
			cleanup();
		} finally {
			process.stderr.write(
				`specflow-watch: uncaught exception: ${(err as Error).message}\n`,
			);
			exit(1);
		}
	});
}

main();
