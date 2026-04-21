// Unit tests for `specflow-launch-watch` CLI. Each scenario stubs PATH with
// a temp dir containing fake emulator binaries (POSIX shell shims) so the
// dispatcher selects the intended branch without invoking real emulators.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	appleScriptSingleQuote,
	commandExists,
	posixQuote,
	probeChild,
} from "../bin/specflow-launch-watch.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

const testDir = dirname(fileURLToPath(import.meta.url));
// testDir is dist/tests; walk two levels up to reach project root.
const projectRoot = join(testDir, "..", "..");
const launcherJs = join(projectRoot, "dist", "bin", "specflow-launch-watch.js");

interface RunResult {
	stdout: string;
	stderr: string;
	status: number;
	logs: Record<string, string[]>;
}

/**
 * Invoke the compiled specflow-launch-watch with a controlled PATH. Each
 * key in `binaries` is a shim name dropped into a temp `bin/` directory
 * which becomes the first PATH entry (/bin:/usr/bin are appended so the
 * shim's own shell plumbing keeps working). Each shim body is wrapped in
 * `#!/bin/sh` + the supplied body text.
 */
function runLauncher(opts: {
	args: readonly string[];
	binaries: Record<string, string>;
	env?: Record<string, string>;
	cwd?: string;
}): RunResult {
	const root = makeTempDir("launch-watch-test-");
	try {
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		const logDir = join(root, "logs");
		mkdirSync(logDir, { recursive: true });
		// Provide a harmless specflow-watch shim so downstream exec never hits a
		// real TUI.
		const watchPath = join(binDir, "specflow-watch");
		writeFileSync(watchPath, "#!/bin/sh\nsleep 2\n", "utf8");
		chmodSync(watchPath, 0o755);
		// On macOS, the launcher's darwin branch would find the real
		// /usr/bin/osascript and launch Terminal.app for every test. Shim it
		// to exit 1 so the dispatcher falls through to the async branches,
		// unless the test explicitly provides its own osascript shim.
		if (!Object.hasOwn(opts.binaries, "osascript")) {
			const osascriptShim = join(binDir, "osascript");
			writeFileSync(osascriptShim, "#!/bin/sh\nexit 1\n", "utf8");
			chmodSync(osascriptShim, 0o755);
		}
		for (const [name, body] of Object.entries(opts.binaries)) {
			const p = join(binDir, name);
			writeFileSync(p, `#!/bin/sh\n${body}\n`, "utf8");
			chmodSync(p, 0o755);
		}
		const pathValue = `${binDir}:/bin:/usr/bin`;
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PATH: pathValue,
			TMUX: "",
			STY: "",
			TERMINAL: "",
			// macOS spawn+shebang exec latency for a freshly-created shim is
			// ~225ms on first run (the OS caches the image for subsequent
			// runs). Every test creates unique shims, so we extend the probe
			// to 800ms to reliably race past the cold-start window.
			SPECFLOW_LAUNCH_WATCH_PROBE_MS: "800",
			...(opts.env ?? {}),
		};
		const result = spawnSync(process.execPath, [launcherJs, ...opts.args], {
			cwd: opts.cwd ?? root,
			env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
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
		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			status: result.status ?? 1,
			logs,
		};
	} finally {
		removeTempDir(root);
	}
}

function shimLogAndSleep(logPath: string): string {
	// Record argv, sleep long enough for the 200ms probe to see a live PID.
	// The `.ran` marker lets tests distinguish "shim never started" from
	// "shim started but redirection failed".
	return [
		`touch ${JSON.stringify(`${logPath}.ran`)}`,
		`printf '%s\\n' "$*" > ${JSON.stringify(logPath)}`,
		`sync 2>/dev/null || true`,
		`sleep 2`,
	].join("\n");
}

function shimLogAndExit1(logPath: string): string {
	return `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nexit 1`;
}

// -------------------------- Pure-function tests --------------------------

test("posixQuote: empty string becomes ''", () => {
	assert.equal(posixQuote(""), "''");
});

test("posixQuote: safe identifier is returned unchanged", () => {
	assert.equal(posixQuote("foo-1"), "foo-1");
	assert.equal(posixQuote("/usr/local/bin"), "/usr/local/bin");
});

test("posixQuote: strings with spaces and quotes are single-quoted", () => {
	assert.equal(posixQuote("a b"), "'a b'");
	assert.equal(posixQuote("it's"), "'it'\\''s'");
});

test("appleScriptSingleQuote: escapes embedded single quotes", () => {
	assert.equal(appleScriptSingleQuote("plain"), "plain");
	assert.equal(appleScriptSingleQuote("it's"), "it'\\''s");
});

test("commandExists: finds a shim in a custom PATH", () => {
	const dir = makeTempDir("cmd-exists-");
	try {
		const shim = join(dir, "my-bin");
		writeFileSync(shim, "#!/bin/sh\nexit 0\n", "utf8");
		chmodSync(shim, 0o755);
		assert.equal(commandExists("my-bin", dir), true);
		assert.equal(commandExists("does-not-exist-xyz", dir), false);
	} finally {
		removeTempDir(dir);
	}
});

test("probeChild: returns false for a dead PID", async () => {
	// PID 1 is init and should always be alive, but using a clearly-dead PID
	// like 2^31-1 ensures the probe takes the false branch.
	const alive = await probeChild(2_147_483_646, 50);
	assert.equal(alive, false);
});

// -------------------------- Dispatcher tests --------------------------

test("launcher: manual fallback when no emulator is on PATH", () => {
	const res = runLauncher({ args: ["run-manual-1"], binaries: {} });
	assert.equal(res.status, 0);
	assert.match(res.stdout, /WATCH_METHOD=manual/);
	assert.match(
		res.stdout,
		/別ターミナルで specflow-watch run-manual-1 を実行すると進捗をリアルタイムで確認できます/,
	);
});

test("launcher: manual fallback shell-quotes target with spaces", () => {
	const res = runLauncher({ args: ["run 1"], binaries: {} });
	assert.match(res.stdout, /WATCH_METHOD=manual/);
	assert.match(res.stdout, /specflow-watch 'run 1'/);
});

test("launcher: empty target invokes specflow-watch with NO argv (gnome-terminal branch)", () => {
	const logDir = makeTempDir("launcher-gnome-empty-logs-");
	try {
		const logPath = join(logDir, "gnome-terminal.log");
		const binaries = { "gnome-terminal": shimLogAndSleep(logPath) };
		const res = runLauncher({ args: [""], binaries });
		assert.match(res.stdout, /WATCH_METHOD=gnome-terminal/);
		const argv = readFileSync(logPath, "utf8").trim();
		// With an empty target, the launcher must pass only `specflow-watch`
		// (no empty-string positional arg) after the `--` separator.
		assert.equal(argv, "-- specflow-watch");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: non-empty target appears after separator (gnome-terminal)", () => {
	const logDir = makeTempDir("launcher-gnome-target-logs-");
	try {
		const logPath = join(logDir, "gnome-terminal.log");
		const binaries = { "gnome-terminal": shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["foo-2"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=gnome-terminal/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "-- specflow-watch foo-2");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: kitty branch uses direct exec without -e", () => {
	const logDir = makeTempDir("launcher-kitty-logs-");
	try {
		const logPath = join(logDir, "kitty.log");
		const binaries = { kitty: shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["run-kitty"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=kitty/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "specflow-watch run-kitty");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: wezterm branch uses start -- subcommand", () => {
	const logDir = makeTempDir("launcher-wezterm-logs-");
	try {
		const logPath = join(logDir, "wezterm.log");
		const binaries = { wezterm: shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["run-wez"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=wezterm/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "start -- specflow-watch run-wez");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: xterm branch uses -e", () => {
	const logDir = makeTempDir("launcher-xterm-logs-");
	try {
		const logPath = join(logDir, "xterm.log");
		const binaries = { xterm: shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["run-x"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=xterm/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "-e specflow-watch run-x");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: xfce4-terminal uses single-string -e with shell quoting", () => {
	const logDir = makeTempDir("launcher-xfce4-logs-");
	try {
		const logPath = join(logDir, "xfce4-terminal.log");
		const binaries = { "xfce4-terminal": shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["run-xfce"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=xfce4-terminal/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "-e specflow-watch run-xfce");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: $TERMINAL branch reports basename and spawns with -e", () => {
	const logDir = makeTempDir("launcher-term-logs-");
	try {
		const logPath = join(logDir, "my-term.log");
		const binaries = { "my-term": shimLogAndSleep(logPath) };
		const res = runLauncher({
			args: ["run-term"],
			binaries,
			env: { TERMINAL: "my-term" },
		});
		assert.match(res.stdout, /WATCH_METHOD=\$TERMINAL\(my-term\)/);
		const argv = readFileSync(logPath, "utf8").trim();
		assert.equal(argv, "-e specflow-watch run-term");
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: dead child falls through to next branch", () => {
	const logDir = makeTempDir("launcher-fallthrough-logs-");
	try {
		const gnomeLog = join(logDir, "gnome-terminal.log");
		const xtermLog = join(logDir, "xterm.log");
		const binaries = {
			// gnome-terminal is detected first but its shim exits 1 immediately,
			// failing the 200ms probe; dispatcher should fall through.
			"gnome-terminal": shimLogAndExit1(gnomeLog),
			xterm: shimLogAndSleep(xtermLog),
		};
		const res = runLauncher({ args: ["run-fb"], binaries });
		assert.match(res.stdout, /WATCH_METHOD=xterm/);
		// gnome-terminal was tried (shim ran)...
		assert.ok(existsSync(gnomeLog));
		// ...and xterm was tried and stuck around.
		assert.ok(existsSync(xtermLog));
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: exits 0 even when every branch fails (dead child everywhere)", () => {
	const logDir = makeTempDir("launcher-all-fail-");
	try {
		const binaries = {
			"gnome-terminal": shimLogAndExit1(join(logDir, "gnome-terminal.log")),
			xterm: shimLogAndExit1(join(logDir, "xterm.log")),
		};
		const res = runLauncher({ args: ["run-allfail"], binaries });
		assert.equal(res.status, 0);
		assert.match(res.stdout, /WATCH_METHOD=manual/);
	} finally {
		removeTempDir(logDir);
	}
});

test("launcher: WATCH_METHOD line appears exactly once", () => {
	const logDir = makeTempDir("launcher-once-logs-");
	try {
		const logPath = join(logDir, "kitty.log");
		const binaries = { kitty: shimLogAndSleep(logPath) };
		const res = runLauncher({ args: ["run-once"], binaries });
		const matches = res.stdout.match(/^WATCH_METHOD=/gm) ?? [];
		assert.equal(matches.length, 1);
	} finally {
		removeTempDir(logDir);
	}
});
