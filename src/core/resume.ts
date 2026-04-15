// Core runtime: mark a suspended run active again.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { CoreRunState, RunState, RunStatus } from "../types/contracts.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { CoreRuntimeError, Result, ResumeInput } from "./types.js";
import { err, ok } from "./types.js";

export interface ResumeDeps {
	readonly runs: RunArtifactStore;
}

export function resumeRun<T extends CoreRunState = RunState>(
	input: ResumeInput,
	deps: ResumeDeps,
): Result<T, CoreRuntimeError> {
	const loaded = loadRunState<T>(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	if (runState.status !== "suspended") {
		return err({
			kind: "run_not_suspended",
			message: "Error: Run is not suspended",
		});
	}

	const updated: T = {
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

	writeRunState<T>(deps.runs, input.runId, updated);
	return ok(updated);
}
