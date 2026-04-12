// High-level run operations built on RunArtifactStore.
// Replaces run-identity.ts filesystem helpers with store-backed equivalents.

import type { RunState, RunStatus } from "../types/contracts.js";
import type { RunArtifactStore } from "./artifact-store.js";
import { runRef } from "./artifact-types.js";
import { isTerminalPhase } from "./workflow-machine.js";

/**
 * Extract the sequence number from a run_id in `<changeId>-<N>` format.
 * Returns null if the run_id does not match the expected pattern.
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
 * Read a run state from the store with backward-compatible fallback for missing fields.
 */
export function readRunState(store: RunArtifactStore, runId: string): RunState {
	const content = store.read(runRef(runId));
	const raw = JSON.parse(content) as Record<string, unknown>;
	const resolvedRunId = typeof raw.run_id === "string" ? raw.run_id : runId;
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
		run_id: resolvedRunId,
		previous_run_id: previousRunId,
		status,
	} as RunState;
}

/**
 * Find all runs for a change, sorted by numeric sequence ascending.
 * Store.list() returns lexicographic order; this function re-sorts by parsed sequence.
 */
export function findRunsForChange(
	store: RunArtifactStore,
	changeId: string,
): RunState[] {
	const refs = store.list({ changeId });
	const runsWithSeq = refs
		.map((ref) => {
			const seq = extractSequence(ref.runId, changeId);
			if (seq === null) return null;
			return { ref, seq };
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	runsWithSeq.sort((a, b) => a.seq - b.seq);

	return runsWithSeq.map((entry) => readRunState(store, entry.ref.runId));
}

/**
 * Find the most recent run for a change by computing the maximum sequence number.
 * Does not rely on store.list() ordering or findRunsForChange() array position.
 */
export function findLatestRun(
	store: RunArtifactStore,
	changeId: string,
): RunState | null {
	const refs = store.list({ changeId });
	if (refs.length === 0) return null;

	let maxSeq = -1;
	let maxRunId: string | null = null;
	for (const ref of refs) {
		const seq = extractSequence(ref.runId, changeId);
		if (seq !== null && seq > maxSeq) {
			maxSeq = seq;
			maxRunId = ref.runId;
		}
	}
	if (maxRunId === null) return null;
	return readRunState(store, maxRunId);
}

/**
 * Generate the next run_id for a change by computing max(sequence) + 1.
 * Does not rely on store.list() ordering or list length.
 */
export function generateRunId(
	store: RunArtifactStore,
	changeId: string,
): string {
	const refs = store.list({ changeId });
	let maxSeq = 0;
	for (const ref of refs) {
		const seq = extractSequence(ref.runId, changeId);
		if (seq !== null && seq > maxSeq) {
			maxSeq = seq;
		}
	}
	return `${changeId}-${maxSeq + 1}`;
}
