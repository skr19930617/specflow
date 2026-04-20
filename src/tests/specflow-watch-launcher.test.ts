// Behavior-level tests for the cross-platform `launch_watch` Bash dispatcher.
// The dispatcher is defined inline in `assets/commands/specflow.watch.md.tmpl`
// and `assets/commands/specflow.md.tmpl`. Rather than execute every emulator
// binary (impractical in CI), these tests stub `command -v` resolution by
// controlling `PATH`, then capture the command that would have been invoked
// by replacing candidate binaries with a logging shim. The shim records its
// argv and exits 0 (success) or exits 1 immediately (failure).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

const testDir = dirname(fileURLToPath(import.meta.url));
// testDir is dist/tests or src/tests; walk two levels up to reach project root.
const projectRoot = join(testDir, "..", "..");

// Extracted inline dispatcher. Keep in sync with the templates — any drift
// will cause snapshot tests to fail, which is the signal to regenerate both
// this constant and the templates together.
const LAUNCH_WATCH_FN = readFileSync(
	join(projectRoot, "assets", "commands", "specflow.watch.md.tmpl"),
	"utf8",
).replace(
	/^[\s\S]*?```bash\n([\s\S]*?launch_watch "\$WATCH_TARGET"\n)```[\s\S]*$/m,
	"$1",
);

/**
 * Run `launch_watch <target>` inside a bash subshell with a controlled PATH.
 * `binaries` is a map of binary name → shim body; each is dropped into a
 * temp directory which becomes the only PATH entry (plus any explicit dirs).
 */
function runDispatcher(opts: {
	target: string;
	binaries: Record<string, string>;
	env?: Record<string, string>;
}): { stdout: string; logs: Record<string, string[]> } {
	const root = makeTempDir("launcher-test-");
	try {
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		const logDir = join(root, "logs");
		mkdirSync(logDir, { recursive: true });
		// Always shim `specflow-watch` as a no-op so the downstream exec never
		// actually runs the TUI.
		writeFileSync(join(binDir, "specflow-watch"), "#!/bin/sh\nexit 0\n");
		chmodSync(join(binDir, "specflow-watch"), 0o755);
		// Stub `uname` so the dispatcher sees "Linux" and does not trigger the
		// macOS branch (the host may be macOS). Tests that want the macOS
		// branch can override this shim in their own `binaries` map.
		if (!Object.hasOwn(opts.binaries, "uname")) {
			writeFileSync(join(binDir, "uname"), "#!/bin/sh\necho Linux\n");
			chmodSync(join(binDir, "uname"), 0o755);
		}
		for (const [name, body] of Object.entries(opts.binaries)) {
			const p = join(binDir, name);
			writeFileSync(p, `#!/bin/sh\n${body}\n`);
			chmodSync(p, 0o755);
		}
		// sleep, printf, kill, uname, command, sed are resolved from /bin and
		// /usr/bin; include them in PATH so the dispatcher itself runs.
		const pathValue = `${binDir}:/bin:/usr/bin`;
		const script = `set -e
export PATH="${pathValue}"
${LAUNCH_WATCH_FN.replace('launch_watch "$WATCH_TARGET"', "")}
WATCH_TARGET=${JSON.stringify(opts.target)}
launch_watch "$WATCH_TARGET"
`;
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PATH: pathValue,
			TMUX: "",
			STY: "",
			TERMINAL: "",
			...(opts.env ?? {}),
		};
		// bash -c executes the script; we replace process.env explicitly so
		// the parent's TMUX/STY/TERMINAL cannot leak into the subshell.
		const stdout = execFileSync("bash", ["-c", script], {
			env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "inherit"],
			cwd: root,
		});
		const logs: Record<string, string[]> = {};
		for (const name of Object.keys(opts.binaries)) {
			const logPath = join(logDir, `${name}.log`);
			try {
				logs[name] = readFileSync(logPath, "utf8")
					.split("\n")
					.filter((l) => l);
			} catch {
				logs[name] = [];
			}
		}
		return { stdout, logs };
	} finally {
		removeTempDir(root);
	}
}

function shimThatLogsArgvAndSucceeds(logPath: string): string {
	return `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nexit 0`;
}

function shimThatLogsArgvAndSleeps(logPath: string): string {
	// Record argv, then sleep long enough that the 200ms PID probe sees the
	// process as alive.
	return `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nsleep 2`;
}

function shimThatExitsImmediately(logPath: string): string {
	return `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nexit 1`;
}

test("launch_watch: gnome-terminal branch uses -- separator and records method", () => {
	const logDir = makeTempDir("launcher-gnome-logs-");
	try {
		const logPath = join(logDir, "gnome-terminal.log");
		const res = runDispatcher({
			target: "foo-1",
			binaries: {
				"gnome-terminal": shimThatLogsArgvAndSleeps(logPath),
			},
		});
		assert.match(res.stdout, /WATCH_METHOD=gnome-terminal/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.match(argv, /^-- specflow-watch foo-1$/);
	} finally {
		removeTempDir(logDir);
	}
});

test("launch_watch: kitty branch uses direct exec without -e", () => {
	const logDir = makeTempDir("launcher-kitty-logs-");
	try {
		const logPath = join(logDir, "kitty.log");
		const res = runDispatcher({
			target: "run-2",
			binaries: { kitty: shimThatLogsArgvAndSleeps(logPath) },
		});
		assert.match(res.stdout, /WATCH_METHOD=kitty/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "specflow-watch run-2");
	} finally {
		removeTempDir(logDir);
	}
});

test("launch_watch: wezterm branch uses start -- subcommand", () => {
	const logDir = makeTempDir("launcher-wezterm-logs-");
	try {
		const logPath = join(logDir, "wezterm.log");
		const res = runDispatcher({
			target: "wez-1",
			binaries: { wezterm: shimThatLogsArgvAndSleeps(logPath) },
		});
		assert.match(res.stdout, /WATCH_METHOD=wezterm/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "start -- specflow-watch wez-1");
	} finally {
		removeTempDir(logDir);
	}
});

test("launch_watch: xterm branch uses -e", () => {
	const logDir = makeTempDir("launcher-xterm-logs-");
	try {
		const logPath = join(logDir, "xterm.log");
		const res = runDispatcher({
			target: "x-1",
			binaries: { xterm: shimThatLogsArgvAndSleeps(logPath) },
		});
		assert.match(res.stdout, /WATCH_METHOD=xterm/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "-e specflow-watch x-1");
	} finally {
		removeTempDir(logDir);
	}
});

test("launch_watch: manual fallback when no emulator is available", () => {
	const res = runDispatcher({ target: "none-1", binaries: {} });
	assert.match(res.stdout, /WATCH_METHOD=manual/);
	assert.match(
		res.stdout,
		/別ターミナルで specflow-watch none-1 を実行すると進捗をリアルタイムで確認できます/,
	);
});

test("launch_watch: immediate PID death falls through to next candidate", () => {
	const logDir = makeTempDir("launcher-fallthrough-logs-");
	try {
		const gnomeLog = join(logDir, "gnome-terminal.log");
		const xtermLog = join(logDir, "xterm.log");
		const res = runDispatcher({
			target: "fb-1",
			binaries: {
				// gnome-terminal is detected first, but its shim exits 1 in <200ms
				// so `_try_bg` reports failure and the dispatcher falls through.
				"gnome-terminal": shimThatExitsImmediately(gnomeLog),
				xterm: shimThatLogsArgvAndSleeps(xtermLog),
			},
		});
		assert.match(res.stdout, /WATCH_METHOD=xterm/);
		// Both shims should have been entered at least once.
		assert.ok(readFileSync(gnomeLog, "utf8").length > 0);
		assert.ok(readFileSync(xtermLog, "utf8").length > 0);
	} finally {
		removeTempDir(logDir);
	}
});

test("launch_watch: target with spaces is shell-quoted in manual fallback", () => {
	const res = runDispatcher({ target: "run 1", binaries: {} });
	assert.match(res.stdout, /WATCH_METHOD=manual/);
	// `_shell_quote` via `printf '%q'` produces `run\ 1` for a target with a
	// space in bash — the manual-hint should include that quoted form.
	assert.match(res.stdout, /specflow-watch run\\ 1/);
});
