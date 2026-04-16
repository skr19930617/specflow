// Internal helpers used by the core runtime command modules.
//
// These helpers must remain free of process.*, filesystem, and git access.
// They either operate on injected collaborators (stores) or pure data.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { ArtifactStoreError, runRef } from "../lib/artifact-types.js";
import { readRunState } from "../lib/run-store-ops.js";
import type { CoreRunState, RunState } from "../types/contracts.js";
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
 *
 * The generic parameter `T` defaults to `RunState`, preserving the observable
 * surface for every existing caller. External runtimes (or future callers
 * that only handle `CoreRunState`) may instantiate `loadRunState<CoreRunState>`
 * to receive a narrower view. The on-disk payload read from the store is
 * always the full local-adapter `RunState`; the cast is a type-level
 * narrowing, not a runtime change.
 *
 * NOTE: `REQUIRED_RUN_STATE_FIELDS` still contains local-adapter keys. This
 * is flagged as a follow-up in `openspec/changes/.../design.md` (Open
 * Questions) and will be relocated to the adapter layer in a separate
 * change under Epic #127.
 */
export async function loadRunState<T extends CoreRunState = RunState>(
	store: RunArtifactStore,
	runId: string,
): Promise<
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: CoreRuntimeError }
> {
	const exists = await store.exists(runRef(runId));
	if (!exists) {
		return err({
			kind: "run_not_found",
			message: `Error: run '${runId}' not found. No state file at ${runId}/run.json`,
		});
	}
	let state: RunState;
	try {
		state = await readRunState(store, runId);
	} catch (e) {
		if (e instanceof ArtifactStoreError && e.kind === "read_failed") {
			return err({
				kind: "run_not_found",
				message: `Error: run '${runId}' not found. No state file at ${runId}/run.json`,
			});
		}
		throw e;
	}
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
	return { ok: true, value: state as unknown as T };
}

/**
 * Persist run state through the injected RunArtifactStore. Generic over
 * `T extends CoreRunState` so call sites holding a narrower type keep their
 * precision; default `T = RunState` keeps all existing callers unchanged.
 */
export async function writeRunState<T extends CoreRunState = RunState>(
	store: RunArtifactStore,
	runId: string,
	state: T,
): Promise<void> {
	await store.write(runRef(runId), `${JSON.stringify(state, null, 2)}\n`);
}
