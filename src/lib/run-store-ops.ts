// High-level run operations built on RunArtifactStore.
// Replaces run-identity.ts filesystem helpers with store-backed equivalents.

import type { Result } from "../core/types.js";
import type { RunState, RunStatus } from "../types/contracts.js";
import type { RunArtifactStore } from "./artifact-store.js";
import { runRef } from "./artifact-types.js";
import { isTerminalPhase } from "./workflow-machine.js";

// --- resolveRunId error types ------------------------------------------------

export type ResolveRunIdErrorKind =
	| "no_active_run"
	| "change_not_found"
	| "multiple_active_runs";

export interface ResolveRunIdError {
	readonly kind: ResolveRunIdErrorKind;
	readonly message: string;
}

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
export async function readRunState(
	store: RunArtifactStore,
	runId: string,
): Promise<RunState> {
	const content = await store.read(runRef(runId));
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
export async function findRunsForChange(
	store: RunArtifactStore,
	changeId: string,
): Promise<RunState[]> {
	const refs = await store.list({ changeId });
	const runsWithSeq = refs
		.map((ref) => {
			const seq = extractSequence(ref.runId, changeId);
			if (seq === null) return null;
			return { ref, seq };
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	runsWithSeq.sort((a, b) => a.seq - b.seq);

	const results: RunState[] = [];
	for (const entry of runsWithSeq) {
		results.push(await readRunState(store, entry.ref.runId));
	}
	return results;
}

/**
 * Find the most recent run for a change by computing the maximum sequence number.
 * Does not rely on store.list() ordering or findRunsForChange() array position.
 */
export async function findLatestRun(
	store: RunArtifactStore,
	changeId: string,
): Promise<RunState | null> {
	const refs = await store.list({ changeId });
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
export async function generateRunId(
	store: RunArtifactStore,
	changeId: string,
): Promise<string> {
	const refs = await store.list({ changeId });
	let maxSeq = 0;
	for (const ref of refs) {
		const seq = extractSequence(ref.runId, changeId);
		if (seq !== null && seq > maxSeq) {
			maxSeq = seq;
		}
	}
	return `${changeId}-${maxSeq + 1}`;
}

/**
 * Resolve a Change ID to the run_id of its single non-terminal run.
 * Relies on the "one non-terminal run per change" invariant from run-identity-model.
 */
export async function resolveRunId(
	store: RunArtifactStore,
	changeId: string,
): Promise<Result<string, ResolveRunIdError>> {
	const runs = await findRunsForChange(store, changeId);
	if (runs.length === 0) {
		return {
			ok: false,
			error: {
				kind: "change_not_found",
				message: `No runs found for change '${changeId}'`,
			},
		};
	}

	const nonTerminal = runs.filter((r) => r.status !== "terminal");

	if (nonTerminal.length === 0) {
		return {
			ok: false,
			error: {
				kind: "no_active_run",
				message: `No active or suspended run for change '${changeId}'`,
			},
		};
	}

	if (nonTerminal.length > 1) {
		return {
			ok: false,
			error: {
				kind: "multiple_active_runs",
				message: `Invariant violation: multiple non-terminal runs for change '${changeId}'`,
			},
		};
	}

	return { ok: true, value: nonTerminal[0].run_id };
}
