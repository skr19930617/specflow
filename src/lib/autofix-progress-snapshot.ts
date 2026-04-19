// Runtime helpers for the auto-fix loop progress snapshot.
//
// The snapshot is a per-run, per-phase JSON artifact persisted via the
// run-artifact store. It complements the `review_completed` observation
// events with a pollable current-state view plus a bounded-cadence
// heartbeat that lets surfaces classify stalled loops as `abandoned`.
//
// Spec: openspec/specs/review-autofix-progress-observability/spec.md

import {
	type AutofixProgressSnapshot,
	validateAutofixSnapshot,
	ZERO_AUTOFIX_COUNTERS,
} from "../types/autofix-progress.js";
import type { LedgerRoundSummary } from "../types/contracts.js";
import type { AutofixRoundCounters } from "../types/observation-events.js";
import type { RunArtifactStore } from "./artifact-store.js";
import {
	type AutofixProgressPhase,
	RunArtifactType,
	runRef,
} from "./artifact-types.js";

/**
 * Derive counters from a single ledger round summary. Round summaries
 * already carry aggregated `by_severity` data and per-round `open`, `new`,
 * `resolved` counts, so the snapshot matches the authoritative ledger view
 * without re-walking findings.
 */
export function buildAutofixCountersFromRound(
	summary: LedgerRoundSummary,
): AutofixRoundCounters {
	const bySev = (summary.by_severity ?? {}) as Record<string, number>;
	const crit = bySev.critical ?? 0;
	const high = bySev.high ?? 0;
	const severitySummary: Record<string, number> = {};
	for (const key of ["critical", "high", "medium", "low"]) {
		const value = bySev[key];
		if (typeof value === "number" && value > 0) {
			severitySummary[key.toUpperCase()] = value;
		}
	}
	return {
		unresolvedCriticalHigh: crit + high,
		totalOpen: summary.open ?? 0,
		resolvedThisRound: summary.resolved ?? 0,
		newThisRound: summary.new ?? 0,
		severitySummary,
	};
}

/**
 * Resolve the canonical ledger round id for an event / snapshot reference.
 * Prefers the persisted `gate_id` (back-reference to the
 * `review_decision` gate issued for the round) and falls back to a
 * stable `round-<N>` identifier when no gate has been issued.
 */
export function ledgerRoundIdFor(
	summary: LedgerRoundSummary | undefined | null,
): string | null {
	if (!summary) return null;
	if (summary.gate_id) return summary.gate_id;
	return `round-${summary.round}`;
}

/**
 * Return the round summary from the ledger that matches `roundIndex`, or
 * `undefined` if no such round has been appended yet.
 */
export function findRoundSummary(
	summaries: readonly LedgerRoundSummary[],
	roundIndex: number,
): LedgerRoundSummary | undefined {
	return summaries.find((s) => s.round === roundIndex);
}

/**
 * Persist the snapshot via the run-artifact store. Writes are atomic at
 * the store layer. Returns once the write completes.
 */
export async function writeAutofixSnapshot(
	store: RunArtifactStore,
	snapshot: AutofixProgressSnapshot,
): Promise<void> {
	const ref = runRef(
		snapshot.run_id,
		RunArtifactType.AutofixProgress,
		snapshot.phase,
	);
	await store.write(ref, `${JSON.stringify(snapshot, null, 2)}\n`);
}

/**
 * Read the most recent snapshot for a given run + phase, or `null` if no
 * snapshot has been written yet. Returns `null` on parse / validation
 * failure so surfaces can degrade to polling the event stream rather than
 * crashing on a torn write.
 */
export async function readAutofixSnapshot(
	store: RunArtifactStore,
	runId: string,
	phase: AutofixProgressPhase,
): Promise<AutofixProgressSnapshot | null> {
	const ref = runRef(runId, RunArtifactType.AutofixProgress, phase);
	if (!(await store.exists(ref))) return null;
	let text: string;
	try {
		text = await store.read(ref);
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	const errs = validateAutofixSnapshot(parsed);
	if (errs.length > 0) return null;
	return parsed as AutofixProgressSnapshot;
}

/**
 * Start a heartbeat interval that refreshes the snapshot's
 * `heartbeat_at` on the configured cadence. Returns a cancel function
 * that stops the interval.
 *
 * Implementations SHOULD call `unref()` on the underlying timer so the
 * process can exit naturally on loop completion even if cancellation is
 * forgotten. Heartbeat writes are fire-and-forget; transient write
 * failures (read-only filesystem, etc.) SHALL NOT crash the loop — the
 * event stream remains the authoritative progress signal per the
 * `ledger > events > snapshot` precedence rule.
 */
export function startAutofixHeartbeat(opts: {
	readonly getCurrent: () => AutofixProgressSnapshot;
	readonly write: (next: AutofixProgressSnapshot) => Promise<void>;
	readonly intervalMs: number;
	readonly now?: () => string;
}): () => void {
	const now = opts.now ?? (() => new Date().toISOString());
	let stopped = false;
	const tick = () => {
		if (stopped) return;
		const current = opts.getCurrent();
		const refreshed: AutofixProgressSnapshot = {
			...current,
			heartbeat_at: now(),
		};
		// Fire-and-forget; writes are atomic at the store layer.
		void opts.write(refreshed).catch(() => {
			// Swallow — see docblock rationale.
		});
	};
	const timer = setInterval(tick, opts.intervalMs);
	// unref() is a Node-specific no-op elsewhere; guard for safety.
	(timer as NodeJS.Timeout).unref?.();
	return () => {
		stopped = true;
		clearInterval(timer);
	};
}

/** Re-export for callers that need the zero-initialized counter shape. */
export { ZERO_AUTOFIX_COUNTERS };
