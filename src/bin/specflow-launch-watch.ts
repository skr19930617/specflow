// specflow-launch-watch — cross-platform Watch TUI dispatcher.
//
// Replaces the inline `launch_watch()` Bash helper that used to live in
// `assets/commands/specflow.md.tmpl` and `assets/commands/specflow.watch.md.tmpl`.
// Claude Code's slash-command renderer substitutes `$1`, `$2`, ..., `$9`, and
// `$ARGUMENTS` inside fenced bash/sh blocks at invocation time, which silently
// corrupted the inline helper. This binary encapsulates the 12-branch
// dispatcher in a form that does not round-trip through a slash-command
// template, so positional-arg substitution can no longer break it.
//
// Contract (see openspec/specs/utility-cli-suite/spec.md):
//   • Positional argument <target> is optional. When omitted or empty, the
//     downstream `specflow-watch` is invoked with NO argv (not an empty
//     string arg), so it falls back to git-branch-based resolution.
//   • Working directory of the spawned terminal resolves to the git repo
//     root (`git rev-parse --show-toplevel`), or `process.cwd()` outside a
//     git repo.
//   • Exactly one `WATCH_METHOD=<method>` line is emitted on stdout per
//     invocation (including `WATCH_METHOD=manual` on fallback).
//   • Manual fallback also emits a Japanese hint line.
//   • Exit code is always 0; launch failure is non-fatal.

import { accessSync, constants } from "node:fs";
import { platform } from "node:os";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "../lib/git.js";
import { tryExec } from "../lib/process.js";

const DEFAULT_PROBE_MS = 200;

function livenessProbeMs(): number {
	const override = process.env.SPECFLOW_LAUNCH_WATCH_PROBE_MS;
	if (!override) return DEFAULT_PROBE_MS;
	const n = Number(override);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROBE_MS;
	return Math.floor(n);
}

type Method =
	| "tmux"
	| "screen"
	| "osascript"
	| `$TERMINAL(${string})`
	| "x-terminal-emulator"
	| "gnome-terminal"
	| "konsole"
	| "xfce4-terminal"
	| "alacritty"
	| "kitty"
	| "wezterm"
	| "xterm"
	| "manual";

function emitMethod(method: Method): void {
	process.stdout.write(`WATCH_METHOD=${method}\n`);
}

function emitManual(target: string): void {
	emitMethod("manual");
	const quoted = posixQuote(target);
	process.stdout.write(
		`💡 別ターミナルで specflow-watch ${quoted} を実行すると進捗をリアルタイムで確認できます\n`,
	);
}

function resolveRepoRoot(): string {
	try {
		return projectRoot(process.cwd());
	} catch {
		return process.cwd();
	}
}

/**
 * POSIX shell-quote a single argument. Equivalent to bash `printf '%q'` for
 * the inputs we care about (paths and run-ids). Empty string becomes `''`.
 */
export function posixQuote(value: string): string {
	if (value === "") return "''";
	if (/^[A-Za-z0-9_.+,\-@:=%/]+$/.test(value)) return value;
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Escape a value for an AppleScript single-quoted literal. Matches the
 * `_qs()` helper from the original inline dispatcher.
 */
export function appleScriptSingleQuote(value: string): string {
	return value.replace(/'/g, `'\\''`);
}

/**
 * Check whether `name` resolves to an executable on PATH. Accepts an
 * absolute/relative path (checked directly) or a bare command name
 * (searched across PATH entries).
 */
export function commandExists(
	name: string,
	pathEnv: string | undefined = process.env.PATH,
): boolean {
	if (!name) return false;
	const isPath = name.includes("/") || name.includes("\\");
	if (isPath) {
		try {
			accessSync(name, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	}
	const paths = (pathEnv ?? "").split(delimiter);
	for (const p of paths) {
		if (!p) continue;
		try {
			accessSync(join(p, name), constants.X_OK);
			return true;
		} catch {}
	}
	return false;
}

/**
 * Returns true if `pid` is still alive after `timeoutMs`. Mirrors the
 * `_try_bg` probe from the original inline dispatcher: wait a fixed window,
 * then send signal 0 to test for liveness. Exported for unit testing.
 */
export function probeChild(pid: number, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		setTimeout(() => {
			try {
				process.kill(pid, 0);
				resolve(true);
			} catch {
				resolve(false);
			}
		}, timeoutMs);
	});
}

/**
 * Spawn a detached child. Returns true when the child is still running after
 * the 200ms liveness probe; false for ENOENT, spawn errors, or children that
 * exit inside the probe window. Zombies (POSIX PIDs whose process has exited
 * but not yet been reaped) are detected via Node's `exit` event rather than
 * `kill -0`, because zombie PIDs still respond to signal 0.
 */
async function trySpawnBg(
	cmd: string,
	args: readonly string[],
	cwd: string,
): Promise<boolean> {
	const { spawn } = await import("node:child_process");
	let child: import("node:child_process").ChildProcess;
	try {
		child = spawn(cmd, [...args], {
			cwd,
			detached: true,
			stdio: "ignore",
			env: process.env,
		});
	} catch {
		return false;
	}
	let exited = false;
	child.on("exit", () => {
		exited = true;
	});
	child.on("error", () => {
		exited = true;
	});
	if (child.pid === undefined) return false;
	// Race: either the child emits `exit` within the probe window, or the
	// timer fires first. We intentionally do NOT call `unref()` before the
	// probe, because unref can suppress subsequent SIGCHLD-driven `exit`
	// events in some Node/macOS combinations. Only unref *after* we've
	// decided the child is alive, so the surviving child can outlive us.
	await new Promise<void>((resolve) => {
		setTimeout(resolve, livenessProbeMs());
	});
	if (exited) return false;
	child.unref();
	return true;
}

interface DispatchContext {
	readonly target: string;
	readonly hasTarget: boolean;
	readonly repoRoot: string;
}

function watchArgv(ctx: DispatchContext): string[] {
	return ctx.hasTarget ? ["specflow-watch", ctx.target] : ["specflow-watch"];
}

/** Compose the shell string used by tmux split-window and xfce4-terminal -e. */
function watchShellString(ctx: DispatchContext): string {
	const base = "specflow-watch";
	return ctx.hasTarget ? `${base} ${posixQuote(ctx.target)}` : base;
}

// ---------------- Synchronous branches (spawnSync via tryExec) ----------------

function tryTmux(ctx: DispatchContext): boolean {
	const shellString = watchShellString(ctx);
	const r = tryExec(
		"tmux",
		["split-window", "-h", "-c", ctx.repoRoot, shellString],
		process.cwd(),
	);
	return r.status === 0;
}

function tryScreen(ctx: DispatchContext): boolean {
	const screenCmd = watchShellString(ctx);
	// `screen -X eval "chdir <root>" "screen <cmd>"` changes the target session's
	// cwd, then opens a new window running the watcher.
	const r = tryExec(
		"screen",
		["-X", "eval", `chdir ${posixQuote(ctx.repoRoot)}`, `screen ${screenCmd}`],
		process.cwd(),
	);
	return r.status === 0;
}

function tryOsascript(ctx: DispatchContext): boolean {
	const qRoot = appleScriptSingleQuote(ctx.repoRoot);
	const qTarget = appleScriptSingleQuote(ctx.target);
	const doScript = ctx.hasTarget
		? `cd '${qRoot}' && specflow-watch '${qTarget}'`
		: `cd '${qRoot}' && specflow-watch`;
	const r = tryExec(
		"osascript",
		[
			"-e",
			`tell application "Terminal" to do script "${doScript}"`,
			"-e",
			'tell application "Terminal" to activate',
		],
		process.cwd(),
	);
	return r.status === 0;
}

// ---------------- Async branches (trySpawnBg + liveness probe) ----------------

async function tryTerminalEnv(ctx: DispatchContext): Promise<Method | null> {
	const term = process.env.TERMINAL;
	if (!term || !commandExists(term)) return null;
	const argv = [term, "-e", ...watchArgv(ctx)];
	if (await trySpawnBg(argv[0], argv.slice(1), ctx.repoRoot)) {
		return `$TERMINAL(${basename(term)})`;
	}
	return null;
}

async function tryXTerminalEmulator(
	ctx: DispatchContext,
): Promise<Method | null> {
	if (!commandExists("x-terminal-emulator")) return null;
	if (
		await trySpawnBg(
			"x-terminal-emulator",
			["-e", ...watchArgv(ctx)],
			ctx.repoRoot,
		)
	) {
		return "x-terminal-emulator";
	}
	return null;
}

async function tryGnomeTerminal(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("gnome-terminal")) return null;
	if (
		await trySpawnBg("gnome-terminal", ["--", ...watchArgv(ctx)], ctx.repoRoot)
	) {
		return "gnome-terminal";
	}
	return null;
}

async function tryKonsole(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("konsole")) return null;
	if (await trySpawnBg("konsole", ["-e", ...watchArgv(ctx)], ctx.repoRoot)) {
		return "konsole";
	}
	return null;
}

async function tryXfce4Terminal(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("xfce4-terminal")) return null;
	if (
		await trySpawnBg(
			"xfce4-terminal",
			["-e", watchShellString(ctx)],
			ctx.repoRoot,
		)
	) {
		return "xfce4-terminal";
	}
	return null;
}

async function tryAlacritty(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("alacritty")) return null;
	if (await trySpawnBg("alacritty", ["-e", ...watchArgv(ctx)], ctx.repoRoot)) {
		return "alacritty";
	}
	return null;
}

async function tryKitty(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("kitty")) return null;
	if (await trySpawnBg("kitty", watchArgv(ctx), ctx.repoRoot)) {
		return "kitty";
	}
	return null;
}

async function tryWezterm(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("wezterm")) return null;
	if (
		await trySpawnBg(
			"wezterm",
			["start", "--", ...watchArgv(ctx)],
			ctx.repoRoot,
		)
	) {
		return "wezterm";
	}
	return null;
}

async function tryXterm(ctx: DispatchContext): Promise<Method | null> {
	if (!commandExists("xterm")) return null;
	if (await trySpawnBg("xterm", ["-e", ...watchArgv(ctx)], ctx.repoRoot)) {
		return "xterm";
	}
	return null;
}

async function dispatch(ctx: DispatchContext): Promise<Method> {
	if (process.env.TMUX && commandExists("tmux") && tryTmux(ctx)) {
		return "tmux";
	}
	if (process.env.STY && commandExists("screen") && tryScreen(ctx)) {
		return "screen";
	}
	if (
		platform() === "darwin" &&
		commandExists("osascript") &&
		tryOsascript(ctx)
	) {
		return "osascript";
	}

	const asyncBranches: Array<(c: DispatchContext) => Promise<Method | null>> = [
		tryTerminalEnv,
		tryXTerminalEmulator,
		tryGnomeTerminal,
		tryKonsole,
		tryXfce4Terminal,
		tryAlacritty,
		tryKitty,
		tryWezterm,
		tryXterm,
	];
	for (const branch of asyncBranches) {
		const method = await branch(ctx);
		if (method !== null) return method;
	}

	return "manual";
}

async function main(): Promise<void> {
	const target = process.argv[2] ?? "";
	const ctx: DispatchContext = {
		target,
		hasTarget: target !== "",
		repoRoot: resolveRepoRoot(),
	};

	const method = await dispatch(ctx);
	if (method === "manual") {
		emitManual(target);
	} else {
		emitMethod(method);
	}
	process.exit(0);
}

// Run only when invoked as the entry module; otherwise the file can be
// imported safely for unit testing of the exported helpers.
const isEntryPoint =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
	main().catch(() => {
		// Dispatcher failures are never fatal — emit manual fallback and exit 0.
		emitManual(process.argv[2] ?? "");
		process.exit(0);
	});
}
