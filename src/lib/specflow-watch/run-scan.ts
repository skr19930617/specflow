// Filesystem scan for `specflow-watch` — lists all runs under
// `.specflow/runs/<run_id>/run.json` without using the async artifact store.
//
// The watcher is strictly read-only and prefers direct filesystem reads over
// store adapters, so this helper returns a plain `RunState[]` with tolerant
// parsing: malformed or unreadable individual `run.json` files are skipped
// rather than crashing the watcher.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RunState } from "../../types/contracts.js";

export const DEFAULT_RUNS_SUBDIR = ".specflow/runs";

/**
 * Parse a `run.json` string into a `RunState`-shaped object if possible.
 * Returns `null` when the file is missing required fields.
 */
export function parseRunJson(raw: string): RunState | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	if (typeof obj.run_id !== "string" || !obj.run_id) return null;
	if (typeof obj.current_phase !== "string") return null;
	if (typeof obj.status !== "string") return null;
	if (typeof obj.created_at !== "string" || !obj.created_at) return null;
	if (typeof obj.updated_at !== "string" || !obj.updated_at) return null;
	// change_name may be null per CoreRunState; accept both
	if (
		obj.change_name !== null &&
		typeof obj.change_name !== "string" &&
		obj.change_name !== undefined
	) {
		return null;
	}
	return obj as unknown as RunState;
}

/**
 * Scan `.specflow/runs/*` and return every parseable `run.json`.
 * Directories without `run.json` or with unreadable content are skipped.
 */
export function scanRuns(projectRoot: string): readonly RunState[] {
	const runsDir = join(projectRoot, DEFAULT_RUNS_SUBDIR);
	if (!existsSync(runsDir)) return [];
	let entries: string[];
	try {
		entries = readdirSync(runsDir);
	} catch {
		return [];
	}
	const out: RunState[] = [];
	for (const name of entries) {
		const runJsonPath = join(runsDir, name, "run.json");
		if (!existsSync(runJsonPath)) continue;
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(runJsonPath);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;
		let raw: string;
		try {
			raw = readFileSync(runJsonPath, "utf8");
		} catch {
			continue;
		}
		const run = parseRunJson(raw);
		if (run !== null) {
			out.push(run);
		}
	}
	return out;
}
