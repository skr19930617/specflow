// Core runtime: start a run (change run or synthetic run).

import type {
	ChangeArtifactStore,
	RunArtifactStore,
} from "../lib/artifact-store.js";
import {
	ChangeArtifactType,
	changeRef,
	runRef,
} from "../lib/artifact-types.js";
import { findRunsForChange, generateRunId } from "../lib/run-store-ops.js";
import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { WorkspaceContext } from "../lib/workspace-context.js";
import type { RunState, RunStatus } from "../types/contracts.js";
import { checkRunId, nowIso, writeRunState } from "./_helpers.js";
import type {
	CoreRuntimeError,
	Result,
	StartChangeInput,
	StartSyntheticInput,
} from "./types.js";
import { err, ok } from "./types.js";

export interface StartChangeDeps {
	readonly runs: RunArtifactStore;
	readonly changes: ChangeArtifactStore;
	readonly workspace: WorkspaceContext;
}

export interface StartSyntheticDeps {
	readonly runs: RunArtifactStore;
	readonly workspace: WorkspaceContext;
}

/**
 * Start a change run. Requires an existing OpenSpec proposal for the
 * change id. Enforces the "one non-terminal run per change" invariant and
 * the --retry rule for prior terminal runs.
 */
export function startChangeRun(
	input: StartChangeInput,
	deps: StartChangeDeps,
): Result<RunState, CoreRuntimeError> {
	const { changeId, retry } = input;
	const idCheck = checkRunId(changeId);
	if (idCheck) return idCheck;

	if (!deps.changes.exists(changeRef(changeId, ChangeArtifactType.Proposal))) {
		return err({
			kind: "change_proposal_missing",
			message: `Error: no OpenSpec proposal found for '${changeId}'. Expected file: openspec/changes/${changeId}/proposal.md`,
		});
	}

	const existingRuns = findRunsForChange(deps.runs, changeId);

	const nonTerminalRun = existingRuns.find((run) => run.status !== "terminal");
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

	if (existingRuns.length > 0 && !retry) {
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
		const latestRun = existingRuns[existingRuns.length - 1];
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

	const newRunId = generateRunId(deps.runs, changeId);

	const state: RunState = {
		run_id: newRunId,
		change_name: changeId,
		current_phase: "start",
		status: "active" as RunStatus,
		allowed_events: deriveAllowedEvents("active", "start"),
		source,
		project_id: deps.workspace.projectIdentity(),
		repo_name: deps.workspace.projectDisplayName(),
		repo_path: deps.workspace.projectRoot(),
		branch_name: deps.workspace.branchName() ?? "HEAD",
		worktree_path: deps.workspace.worktreePath(),
		agents,
		last_summary_path: null,
		created_at: nowIso(),
		updated_at: nowIso(),
		history: [],
		previous_run_id: previousRunId,
	};

	writeRunState(deps.runs, newRunId, state);
	return ok(state);
}

/**
 * Start a synthetic run (no associated OpenSpec change). The caller owns
 * the run_id verbatim; no sequence number is generated.
 */
export function startSyntheticRun(
	input: StartSyntheticInput,
	deps: StartSyntheticDeps,
): Result<RunState, CoreRuntimeError> {
	const { runId } = input;
	const idCheck = checkRunId(runId);
	if (idCheck) return idCheck;

	if (deps.runs.exists(runRef(runId))) {
		return err({
			kind: "run_already_exists",
			message: `Error: run '${runId}' already exists`,
		});
	}

	const state: RunState = {
		run_id: runId,
		change_name: null,
		current_phase: "start",
		status: "active" as RunStatus,
		allowed_events: deriveAllowedEvents("active", "start"),
		source: input.source,
		project_id: deps.workspace.projectIdentity(),
		repo_name: deps.workspace.projectDisplayName(),
		repo_path: deps.workspace.projectRoot(),
		branch_name: deps.workspace.branchName() ?? "HEAD",
		worktree_path: deps.workspace.worktreePath(),
		agents: { ...input.agents },
		last_summary_path: null,
		created_at: nowIso(),
		updated_at: nowIso(),
		history: [],
		run_kind: "synthetic" as const,
		previous_run_id: null,
	};

	writeRunState(deps.runs, runId, state);
	return ok(state);
}
