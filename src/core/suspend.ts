// Core runtime: mark a run suspended.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { RunState, RunStatus } from "../types/contracts.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { CoreRuntimeError, Result, SuspendInput } from "./types.js";
import { err, ok } from "./types.js";

export interface SuspendDeps {
	readonly runs: RunArtifactStore;
}

export function suspendRun(
	input: SuspendInput,
	deps: SuspendDeps,
): Result<RunState, CoreRuntimeError> {
	const loaded = loadRunState(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	if (runState.status === "terminal") {
		return err({
			kind: "terminal_suspend",
			message: "Error: Cannot suspend a terminal run",
		});
	}
	if (runState.status === "suspended") {
		return err({
			kind: "already_suspended",
			message: "Error: Run is already suspended",
		});
	}

	const updated: RunState = {
		...runState,
		status: "suspended" as RunStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents("suspended", runState.current_phase),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: runState.current_phase,
				event: "suspend",
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(deps.runs, input.runId, updated);
	return ok(updated);
}
