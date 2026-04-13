// Core runtime: patch a single allowed field on run state.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import type { RunState } from "../types/contracts.js";
import { loadRunState, nowIso, writeRunState } from "./_helpers.js";
import type { CoreRuntimeError, Result, UpdateFieldInput } from "./types.js";
import { err, ok } from "./types.js";

export interface UpdateFieldDeps {
	readonly runs: RunArtifactStore;
}

export function updateRunField(
	input: UpdateFieldInput,
	deps: UpdateFieldDeps,
): Result<RunState, CoreRuntimeError> {
	const { field, value } = input;
	if (field !== "last_summary_path") {
		return err({
			kind: "field_not_updatable",
			message: `Error: field '${field}' is not updatable. Allowed fields: last_summary_path`,
		});
	}

	const loaded = loadRunState(deps.runs, input.runId);
	if (!loaded.ok) return loaded;
	const runState = loaded.value;

	const updated: RunState = {
		...runState,
		[field]: value,
		updated_at: nowIso(),
	};
	writeRunState(deps.runs, input.runId, updated);
	return ok(updated);
}
