// Internal helpers used by the core runtime command modules.
//
// These helpers must remain free of process.*, filesystem, and git access.
// They either operate on injected collaborators (stores) or pure data.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { runRef } from "../lib/artifact-types.js";
import { readRunState } from "../lib/run-store-ops.js";
import type { RunState } from "../types/contracts.js";
import type { CoreRuntimeError } from "./types.js";
import { err } from "./types.js";

const REQUIRED_RUN_STATE_FIELDS = [
	"project_id",
	"repo_name",
	"repo_path",
	"branch_name",
	"worktree_path",
	"agents",
	"source",
	"last_summary_path",
] as const;

export function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Return a CoreRuntimeError if the run_id is invalid, or null otherwise.
 */
export function checkRunId(
	runId: string,
): { readonly ok: false; readonly error: CoreRuntimeError } | null {
	if (runId.includes("/") || runId.includes("..") || runId === ".") {
		return err({
			kind: "invalid_run_id",
			message: `Error: invalid run_id '${runId}'. Must not contain '/' or '..'`,
		});
	}
	return null;
}

/**
 * Load the run state for a runId or return a typed `run_not_found` error.
 */
export function loadRunState(
	store: RunArtifactStore,
	runId: string,
):
	| { readonly ok: true; readonly value: RunState }
	| { readonly ok: false; readonly error: CoreRuntimeError } {
	if (!store.exists(runRef(runId))) {
		return err({
			kind: "run_not_found",
			message: `Error: run '${runId}' not found. No state file at ${runId}/run.json`,
		});
	}
	const state = readRunState(store, runId);
	const missing = REQUIRED_RUN_STATE_FIELDS.filter(
		(field) => !(field in state),
	);
	if (missing.length > 0) {
		return err({
			kind: "run_schema_mismatch",
			message: `Error: run state is missing required fields: ${missing.join(" ")}. This run was created with an older schema. Please delete it and re-create with 'specflow-run start'.`,
			details: { missing_fields: missing },
		});
	}
	return { ok: true, value: state };
}

/**
 * Persist run state through the injected RunArtifactStore.
 */
export function writeRunState(
	store: RunArtifactStore,
	runId: string,
	state: RunState,
): void {
	store.write(runRef(runId), `${JSON.stringify(state, null, 2)}\n`);
}
