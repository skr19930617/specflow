// Minimal filesystem watch runtime for `specflow-watch`.
//
// Exposes `watchPaths`: given a list of absolute file paths, emits one
// normalised change callback whenever any of them are created, modified,
// renamed, or deleted. Uses `fs.watch` as the primary trigger and adds a
// slow `setInterval` mtime+size poll as a fallback for platforms where
// `fs.watch` drops events (macOS FSEvents oddities, atomic-replace writes,
// NFS/container mounts). Both primary and fallback feed the same debounced
// redraw pipeline so consumers only see one coalesced "something changed"
// event per 80 ms burst.
//
// Implementation notes:
//   - For each target path we open a watch on the file itself (when it
//     exists) AND on its parent directory. The parent-dir watch is how we
//     detect file creation without restart.
//   - We track `(mtimeMs, size)` per path. The 2s poll re-stats each path;
//     any change (including disappearance) triggers a change event.
//   - Errors from `fs.watch` are swallowed (the poll carries us through).
//
// The module is pure Node built-ins; no external dependencies.

import type { FSWatcher } from "node:fs";
import { statSync, watch } from "node:fs";
import { dirname, resolve } from "node:path";

export interface WatchPathsOptions {
	readonly onChange: () => void;
	/** Coalesce repeated change signals within this window. Default 80 ms. */
	readonly debounceMs?: number;
	/** Polling fallback interval. Default 2000 ms. 0 disables polling. */
	readonly pollIntervalMs?: number;
}

export interface Disposable {
	dispose(): void;
}

interface PathState {
	readonly path: string;
	mtimeMs: number | null;
	size: number | null;
	exists: boolean;
	fileWatcher: FSWatcher | null;
	dirWatcher: FSWatcher | null;
}

function statPath(path: string): { mtimeMs: number; size: number } | null {
	try {
		const st = statSync(path);
		return { mtimeMs: st.mtimeMs, size: st.size };
	} catch {
		return null;
	}
}

function tryWatch(
	path: string,
	handler: (eventType: string, filename: string | null) => void,
): FSWatcher | null {
	try {
		const w = watch(path, { persistent: false }, (event, name) => {
			handler(event, typeof name === "string" ? name : null);
		});
		w.on("error", () => {
			// Best-effort; poll fallback will still notice changes.
		});
		return w;
	} catch {
		return null;
	}
}

/**
 * Watch the given file paths and invoke `onChange` whenever any of them
 * appears to have changed. Returns a disposable that tears down every
 * watcher and timer cleanly.
 */
export function watchPaths(
	paths: readonly string[],
	opts: WatchPathsOptions,
): Disposable {
	const debounceMs = opts.debounceMs ?? 80;
	const pollIntervalMs = opts.pollIntervalMs ?? 2000;
	const absolutePaths = paths.map((p) => resolve(p));
	const states: PathState[] = absolutePaths.map((p) => {
		const st = statPath(p);
		return {
			path: p,
			mtimeMs: st ? st.mtimeMs : null,
			size: st ? st.size : null,
			exists: st !== null,
			fileWatcher: null,
			dirWatcher: null,
		};
	});

	let disposed = false;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function trigger(): void {
		if (disposed) return;
		if (debounceTimer !== null) return;
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			if (disposed) return;
			try {
				opts.onChange();
			} catch {
				// Consumer errors are not this layer's concern.
			}
		}, debounceMs);
	}

	function pollOnce(): void {
		if (disposed) return;
		let anyChange = false;
		for (const state of states) {
			const st = statPath(state.path);
			if (st === null) {
				if (state.exists) {
					// Transitioned to missing.
					state.exists = false;
					state.mtimeMs = null;
					state.size = null;
					anyChange = true;
				}
				continue;
			}
			if (!state.exists) {
				state.exists = true;
				state.mtimeMs = st.mtimeMs;
				state.size = st.size;
				anyChange = true;
				// (Re)attach file watcher now that the file exists.
				attachFileWatcher(state);
				continue;
			}
			if (state.mtimeMs !== st.mtimeMs || state.size !== st.size) {
				state.mtimeMs = st.mtimeMs;
				state.size = st.size;
				anyChange = true;
			}
		}
		if (anyChange) trigger();
	}

	function attachFileWatcher(state: PathState): void {
		if (state.fileWatcher !== null) return;
		state.fileWatcher = tryWatch(state.path, () => {
			trigger();
		});
	}

	// Watch each directory once (shared across paths in same dir).
	const dirHandlers = new Map<string, Set<string>>();
	for (const state of states) {
		const dir = dirname(state.path);
		let names = dirHandlers.get(dir);
		if (!names) {
			names = new Set();
			dirHandlers.set(dir, names);
		}
		// We intern by basename from the filename-handler.
		const base = state.path.slice(dir.length + 1);
		names.add(base);
	}

	const dirWatchers: FSWatcher[] = [];
	for (const [dir, names] of dirHandlers) {
		const w = tryWatch(dir, (_event, filename) => {
			if (filename === null) {
				// Some platforms don't report the filename; fall back to a poll.
				pollOnce();
				return;
			}
			if (names.has(filename)) {
				// A watched path inside this dir changed; the poll will
				// reconcile state so we just re-trigger.
				trigger();
			}
		});
		if (w) dirWatchers.push(w);
	}

	for (const state of states) {
		if (state.exists) attachFileWatcher(state);
	}

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	if (pollIntervalMs > 0) {
		pollTimer = setInterval(pollOnce, pollIntervalMs);
		if (typeof pollTimer === "object" && pollTimer !== null) {
			(pollTimer as { unref?: () => void }).unref?.();
		}
	}

	return {
		dispose(): void {
			if (disposed) return;
			disposed = true;
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			if (pollTimer !== null) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			for (const state of states) {
				try {
					state.fileWatcher?.close();
				} catch {
					/* ignore */
				}
				state.fileWatcher = null;
			}
			for (const w of dirWatchers) {
				try {
					w.close();
				} catch {
					/* ignore */
				}
			}
			dirWatchers.length = 0;
		},
	};
}
