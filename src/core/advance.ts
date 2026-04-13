// Core runtime: apply a state-machine event to an existing run.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import {
	deriveAllowedEvents,
	isTerminalPhase,
} from "../lib/workflow-machine.js";
import type { RunState, RunStatus } from "../types/contracts.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { AdvanceInput, CoreRuntimeError, Result } from "./types.js";
import { err, ok } from "./types.js";

export interface WorkflowDefinition {
	readonly version: string;
	readonly states: readonly string[];
	readonly events: readonly string[];
	readonly transitions: readonly {
		readonly from: string;
		readonly event: string;
		readonly to: string;
	}[];
}

export interface AdvanceDeps {
	readonly runs: RunArtifactStore;
	readonly workflow: WorkflowDefinition;
}

export function advanceRun(
	input: AdvanceInput,
	deps: AdvanceDeps,
): Result<RunState, CoreRuntimeError> {
	const loaded = loadRunState(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	if (runState.status === "suspended") {
		return err({
			kind: "run_suspended",
			message: `Error: Run is suspended — resume first. Only 'resume' is allowed.`,
		});
	}

	const transition = deps.workflow.transitions.find(
		(candidate) =>
			candidate.from === runState.current_phase &&
			candidate.event === input.event,
	);
	if (!transition) {
		const allowed = deriveAllowedEvents(
			runState.status as RunStatus,
			runState.current_phase,
		);
		return err({
			kind: "invalid_event",
			message: `Error: invalid transition. Event '${input.event}' is not allowed in state '${runState.current_phase}'. Allowed events: ${allowed.join(", ")}`,
			details: {
				current_phase: runState.current_phase,
				allowed_events: allowed,
			},
		});
	}

	const newStatus: RunStatus = isTerminalPhase(transition.to)
		? "terminal"
		: (runState.status as RunStatus);

	const updated: RunState = {
		...runState,
		current_phase: transition.to,
		status: newStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents(newStatus, transition.to),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: transition.to,
				event: input.event,
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(deps.runs, input.runId, updated);
	return ok(updated);
}
