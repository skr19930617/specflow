// Auto-fix progress snapshot contract — shared type definitions.
//
// See openspec/specs/review-autofix-progress-observability/spec.md for the
// authoritative contract. The snapshot is persisted per-run per-phase under
// the run-artifact store and refreshed on a bounded heartbeat.

import type {
	AutofixLoopState,
	AutofixRoundCounters,
	AutofixTerminalOutcome,
} from "./observation-events.js";

/** Review phase a snapshot belongs to. */
export type AutofixPhase = "design_review" | "apply_review";

export const AUTOFIX_PHASES: readonly AutofixPhase[] = [
	"design_review",
	"apply_review",
] as const;

/** Current snapshot schema version — bump when fields change shape. */
export const AUTOFIX_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Self-contained progress snapshot. Writers SHALL rewrite this atomically;
 * readers MAY rely on `heartbeat_at` to classify stalled loops as
 * `abandoned`.
 */
export interface AutofixProgressSnapshot {
	readonly schema_version: number;
	readonly run_id: string;
	readonly change_id: string;
	readonly phase: AutofixPhase;
	readonly round_index: number;
	readonly max_rounds: number;
	readonly loop_state: AutofixLoopState;
	readonly terminal_outcome: AutofixTerminalOutcome | null;
	readonly counters: AutofixRoundCounters;
	readonly heartbeat_at: string;
	readonly ledger_round_id: string | null;
}

/** Narrowing guard for `AutofixPhase`. */
export function isAutofixPhase(value: unknown): value is AutofixPhase {
	return (
		typeof value === "string" &&
		(AUTOFIX_PHASES as readonly string[]).includes(value)
	);
}

/** Validation error returned by `validateAutofixSnapshot`. */
export interface AutofixSnapshotValidationError {
	readonly field: string;
	readonly message: string;
}

/**
 * Shape-check a snapshot. Returns an empty array when `value` conforms.
 * Unknown extra fields are tolerated per the spec's forward-compatibility
 * rule; only missing / type-mismatched required fields are reported.
 */
export function validateAutofixSnapshot(
	value: unknown,
): readonly AutofixSnapshotValidationError[] {
	const errs: AutofixSnapshotValidationError[] = [];
	if (!value || typeof value !== "object") {
		errs.push({ field: "$root", message: "expected object" });
		return errs;
	}
	const v = value as Record<string, unknown>;
	if (typeof v.schema_version !== "number")
		errs.push({ field: "schema_version", message: "expected number" });
	if (typeof v.run_id !== "string" || !v.run_id)
		errs.push({ field: "run_id", message: "expected non-empty string" });
	if (typeof v.change_id !== "string" || !v.change_id)
		errs.push({ field: "change_id", message: "expected non-empty string" });
	if (!isAutofixPhase(v.phase))
		errs.push({
			field: "phase",
			message: `expected one of ${AUTOFIX_PHASES.join("|")}`,
		});
	if (typeof v.round_index !== "number" || v.round_index < 0)
		errs.push({ field: "round_index", message: "expected non-negative number" });
	if (typeof v.max_rounds !== "number" || v.max_rounds < 1)
		errs.push({ field: "max_rounds", message: "expected positive number" });
	if (typeof v.loop_state !== "string")
		errs.push({ field: "loop_state", message: "expected string" });
	if (v.terminal_outcome !== null && typeof v.terminal_outcome !== "string")
		errs.push({
			field: "terminal_outcome",
			message: "expected string or null",
		});
	if (!v.counters || typeof v.counters !== "object")
		errs.push({ field: "counters", message: "expected object" });
	if (typeof v.heartbeat_at !== "string")
		errs.push({ field: "heartbeat_at", message: "expected ISO 8601 string" });
	if (v.ledger_round_id !== null && typeof v.ledger_round_id !== "string")
		errs.push({
			field: "ledger_round_id",
			message: "expected string or null",
		});
	return errs;
}

/** Zero-initialized counters used before any round has completed. */
export const ZERO_AUTOFIX_COUNTERS: AutofixRoundCounters = {
	unresolvedCriticalHigh: 0,
	totalOpen: 0,
	resolvedThisRound: 0,
	newThisRound: 0,
	severitySummary: {},
};

/**
 * Build a baseline `starting` snapshot for a loop that has been invoked but
 * not yet entered round 1. Callers pass the wall-clock `now` so tests can
 * inject deterministic timestamps.
 */
export function buildStartingSnapshot(args: {
	readonly runId: string;
	readonly changeId: string;
	readonly phase: AutofixPhase;
	readonly maxRounds: number;
	readonly now: string;
}): AutofixProgressSnapshot {
	return {
		schema_version: AUTOFIX_SNAPSHOT_SCHEMA_VERSION,
		run_id: args.runId,
		change_id: args.changeId,
		phase: args.phase,
		round_index: 0,
		max_rounds: args.maxRounds,
		loop_state: "starting",
		terminal_outcome: null,
		counters: ZERO_AUTOFIX_COUNTERS,
		heartbeat_at: args.now,
		ledger_round_id: null,
	};
}
