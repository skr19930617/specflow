// Pure validation helpers used by the core runtime. No I/O.

import type { CoreRuntimeError, Result } from "./types.js";
import { err } from "./types.js";

/**
 * Return a typed `invalid_run_id` error if the run id is unsafe, otherwise
 * null. Used by start commands to reject path-traversal-style identifiers
 * before state is created.
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

// Re-export Result for call sites that only import from this module.
export type { CoreRuntimeError, Result } from "./types.js";
