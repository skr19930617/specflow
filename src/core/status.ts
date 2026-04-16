// Core runtime: read the current run state.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import type { RunState } from "../types/contracts.js";
import { loadRunState } from "./_helpers.js";
import type { CoreRuntimeError, Result, StatusInput } from "./types.js";

export interface StatusDeps {
	readonly runs: RunArtifactStore;
}

export async function readRunStatus(
	input: StatusInput,
	deps: StatusDeps,
): Promise<Result<RunState, CoreRuntimeError>> {
	return await loadRunState(deps.runs, input.runId);
}
