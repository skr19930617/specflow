import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunState, RunStatus } from "../types/contracts.js";
import { isTerminalPhase } from "./workflow-machine.js";

/**
 * Extract the sequence number from a run_id in `<change_id>-<N>` format.
 * Returns null if the run_id does not match the expected pattern for the given changeId.
 */
export function extractSequence(
	runId: string,
	changeId: string,
): number | null {
	const prefix = `${changeId}-`;
	if (!runId.startsWith(prefix)) {
		return null;
	}
	const suffix = runId.slice(prefix.length);
	const num = Number.parseInt(suffix, 10);
	if (Number.isNaN(num) || num < 1 || String(num) !== suffix) {
		return null;
	}
	return num;
}

/**
 * Scan `.specflow/runs/` for all run directories belonging to a change_id.
 * Returns run_id strings (directory names) sorted by sequence number.
 */
export function findRunIdsForChange(
	runsDir: string,
	changeId: string,
): string[] {
	let entries: string[];
	try {
		entries = readdirSync(runsDir);
	} catch {
		return [];
	}
	const prefix = `${changeId}-`;
	return entries
		.filter((entry) => {
			if (!entry.startsWith(prefix)) {
				return false;
			}
			const seq = extractSequence(entry, changeId);
			return seq !== null;
		})
		.sort((a, b) => {
			const seqA = extractSequence(a, changeId) ?? 0;
			const seqB = extractSequence(b, changeId) ?? 0;
			return seqA - seqB;
		});
}

/**
 * Read a run.json file with backward-compatible fallback for missing fields.
 */
export function readRunStateWithFallback(
	runJsonPath: string,
	dirName: string,
): RunState {
	const raw = JSON.parse(readFileSync(runJsonPath, "utf8")) as Record<
		string,
		unknown
	>;
	const runId = typeof raw.run_id === "string" ? raw.run_id : dirName;
	const previousRunId =
		raw.previous_run_id === undefined ? null : raw.previous_run_id;
	let status: RunStatus | string;
	if (
		typeof raw.status === "string" &&
		(raw.status === "active" ||
			raw.status === "suspended" ||
			raw.status === "terminal")
	) {
		status = raw.status;
	} else if (
		typeof raw.current_phase === "string" &&
		isTerminalPhase(raw.current_phase as string)
	) {
		status = "terminal";
	} else {
		status = "active";
	}
	return {
		...(raw as unknown as RunState),
		run_id: runId,
		previous_run_id: previousRunId,
		status,
	} as RunState;
}

/**
 * Load all RunState objects for a given change_id from `.specflow/runs/`.
 */
export function findRunsForChange(
	runsDir: string,
	changeId: string,
): RunState[] {
	const runIds = findRunIdsForChange(runsDir, changeId);
	return runIds.map((runId) => {
		const jsonPath = resolve(runsDir, runId, "run.json");
		return readRunStateWithFallback(jsonPath, runId);
	});
}

/**
 * Find the most recent (highest sequence) run for a change_id.
 */
export function findLatestRun(
	runsDir: string,
	changeId: string,
): RunState | null {
	const runs = findRunsForChange(runsDir, changeId);
	return runs.length > 0 ? runs[runs.length - 1]! : null;
}

/**
 * Generate the next run_id for a change_id by scanning existing runs.
 */
export function generateRunId(runsDir: string, changeId: string): string {
	const runIds = findRunIdsForChange(runsDir, changeId);
	if (runIds.length === 0) {
		return `${changeId}-1`;
	}
	const lastId = runIds[runIds.length - 1]!;
	const lastSeq = extractSequence(lastId, changeId) ?? 0;
	return `${changeId}-${lastSeq + 1}`;
}
