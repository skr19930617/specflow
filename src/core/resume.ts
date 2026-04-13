// Core runtime: mark a suspended run active again.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { RunState, RunStatus } from "../types/contracts.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { CoreRuntimeError, Result, ResumeInput } from "./types.js";
import { err, ok } from "./types.js";

export interface ResumeDeps {
	readonly runs: RunArtifactStore;
}

export function resumeRun(
	input: ResumeInput,
	deps: ResumeDeps,
): Result<RunState, CoreRuntimeError> {
	const loaded = loadRunState(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	if (runState.status !== "suspended") {
		return err({
			kind: "run_not_suspended",
			message: "Error: Run is not suspended",
		});
	}

	const updated: RunState = {
		...runState,
		status: "active" as RunStatus,
		updated_at: nowIso(),
		allowed_events: deriveAllowedEvents("active", runState.current_phase),
		history: [
			...runState.history,
			{
				from: runState.current_phase,
				to: runState.current_phase,
				event: "resume",
				timestamp: nowIso(),
			},
		],
	};

	writeRunState(deps.runs, input.runId, updated);
	return ok(updated);
}
