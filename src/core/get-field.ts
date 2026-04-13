// Core runtime: read a single field from run state.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { runRef } from "../lib/artifact-types.js";
import { readRunState } from "../lib/run-store-ops.js";
import type { JsonMap } from "../types/contracts.js";
import type { CoreRuntimeError, GetFieldInput, Result } from "./types.js";
import { err, ok } from "./types.js";

export interface GetFieldDeps {
	readonly runs: RunArtifactStore;
}

export function getRunField(
	input: GetFieldInput,
	deps: GetFieldDeps,
): Result<unknown, CoreRuntimeError> {
	const { runId, field } = input;
	if (!deps.runs.exists(runRef(runId))) {
		return err({
			kind: "run_not_found",
			message: `Error: run '${runId}' not found. No state file at ${runId}/run.json`,
		});
	}
	// Note: get-field does NOT validate the run schema because a valid use
	// case is inspecting fields on legacy/partial run states.
	const runState = readRunState(deps.runs, runId) as unknown as JsonMap;
	const value = runState[field];
	if (value === undefined) {
		return err({
			kind: "field_not_found",
			message: `Error: field '${field}' not found in run state`,
		});
	}
	return ok(value);
}
