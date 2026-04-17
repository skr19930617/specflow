// Core runtime: start a run (change run or synthetic run). Pure — no I/O.
// The wiring layer computes preconditions (proposal existence, prior runs,
// next run_id, now-iso, existing-run collision) and supplies the adapter
// seed; this module only decides whether the start is permitted and, on
// success, assembles the initial run state.

import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { RunKind, RunStatus, SourceMetadata } from "../types/contracts.js";
import type {
	CoreRunState,
	CoreRuntimeError,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
import { err, ok } from "./types.js";
import { checkRunId } from "./validation.js";

export interface StartChangeInput<TAdapter> {
	readonly changeId: string;
	readonly source: SourceMetadata | null;
	readonly agents: { readonly main: string; readonly review: string };
	readonly retry: boolean;
	/** Whether `openspec/changes/<changeId>/proposal.md` exists. */
	readonly proposalExists: boolean;
	/** Existing runs for this change_id, oldest → newest. */
	readonly priorRuns: readonly CoreRunState[];
	/** The run_id to assign to the new run (format `<changeId>-<N>`). */
	readonly nextRunId: string;
	/** Deterministic ISO timestamp for created_at / updated_at. */
	readonly nowIso: string;
	/** Adapter-specific fields merged into the initial run state. */
	readonly adapterSeed: TAdapter;
}

export interface StartSyntheticInput<TAdapter> {
	readonly runId: string;
	readonly source: SourceMetadata | null;
	readonly agents: { readonly main: string; readonly review: string };
	/** Whether a run with `runId` already exists in the store. */
	readonly existingRunExists: boolean;
	readonly nowIso: string;
	readonly adapterSeed: TAdapter;
}

export function startChangeRun<TAdapter extends object>(
	input: StartChangeInput<TAdapter>,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { changeId, retry, priorRuns, nextRunId, nowIso, adapterSeed } = input;

	const idCheck = checkRunId(changeId);
	if (idCheck) return idCheck;

	if (!input.proposalExists) {
		return err({
			kind: "change_proposal_missing",
			message: `Error: no OpenSpec proposal found for '${changeId}'. Expected file: openspec/changes/${changeId}/proposal.md`,
		});
	}

	const nonTerminalRun = priorRuns.find((run) => run.status !== "terminal");
	if (nonTerminalRun) {
		if (nonTerminalRun.status === "suspended") {
			return err({
				kind: "run_suspended_exists",
				message: `Error: Suspended run exists (${nonTerminalRun.run_id}) — resume or reject it first`,
			});
		}
		return err({
			kind: "run_active_exists",
			message: `Error: Active run already exists (${nonTerminalRun.run_id})`,
		});
	}

	if (priorRuns.length > 0 && !retry) {
		return err({
			kind: "prior_runs_require_retry",
			message:
				"Error: prior runs exist for this change. Use --retry to create a new run",
		});
	}

	let previousRunId: string | null = null;
	let source = input.source;
	let agents = { ...input.agents };

	if (retry) {
		const latestRun = priorRuns[priorRuns.length - 1];
		if (!latestRun) {
			return err({
				kind: "retry_without_prior",
				message: "Error: --retry requires at least one prior run",
			});
		}
		if (latestRun.current_phase === "rejected") {
			return err({
				kind: "retry_on_rejected",
				message:
					"Error: Rejected changes cannot be retried — create a new change",
			});
		}
		previousRunId = latestRun.run_id;
		if (!source && latestRun.source) {
			source = latestRun.source;
		}
		agents = { ...latestRun.agents };
	}

	const core: CoreRunState = {
		run_id: nextRunId,
		change_name: changeId,
		current_phase: "start",
		status: "active" as RunStatus,
		allowed_events: deriveAllowedEvents("active", "start"),
		source,
		agents,
		created_at: nowIso,
		updated_at: nowIso,
		history: [],
		previous_run_id: previousRunId,
	};

	const state = { ...core, ...adapterSeed } as RunStateOf<TAdapter>;
	return ok({ state, recordMutations: [] });
}

export function startSyntheticRun<TAdapter extends object>(
	input: StartSyntheticInput<TAdapter>,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { runId, existingRunExists, nowIso, adapterSeed } = input;

	const idCheck = checkRunId(runId);
	if (idCheck) return idCheck;

	if (existingRunExists) {
		return err({
			kind: "run_already_exists",
			message: `Error: run '${runId}' already exists`,
		});
	}

	const core: CoreRunState = {
		run_id: runId,
		change_name: null,
		current_phase: "start",
		status: "active" as RunStatus,
		allowed_events: deriveAllowedEvents("active", "start"),
		source: input.source,
		agents: { ...input.agents },
		created_at: nowIso,
		updated_at: nowIso,
		history: [],
		run_kind: "synthetic" as RunKind,
		previous_run_id: null,
	};

	const state = { ...core, ...adapterSeed } as RunStateOf<TAdapter>;
	return ok({ state, recordMutations: [] });
}
