// Main-agent integration authority for apply-worktree-isolation.
//
// Takes a subagent's success result plus a worktree handle and decides
// whether to import the worktree's changes into the main workspace or reject
// them. The only observable side effect on the accept path is a successful
// `git apply --binary` at the repo root. The reject path surfaces a
// structured cause and leaves the main workspace untouched so the caller can
// transition the bundle to `integration_rejected`.
//
// Phase 1 rejection causes (all exhaustively enumerated):
//   - empty_diff_on_success  (subagent claimed success but produced no diff)
//   - protected_path          (diff touches task-graph.json / tasks.md / .specflow/**)
//   - undeclared_path         (diff touches a path not in produced_artifacts)
//   - patch_apply_failure     (git apply --binary exited non-zero)
//
// Checks are ordered so that the MOST SEVERE cause is surfaced first:
// empty-diff (subagent contract violation) → protected-path (main-agent-only
// invariant) → undeclared-path (subagent contract violation) →
// patch-apply-failure (last, since it requires actually invoking apply).

import {
	computeDiff,
	importPatch,
	isProtectedPath,
	listTouchedPaths,
	WorktreeError,
	type WorktreeHandle,
	type WorktreeRuntime,
} from "./worktree.js";

export type IntegrationRejectionCause =
	| {
			readonly kind: "empty_diff_on_success";
	  }
	| {
			readonly kind: "protected_path";
			readonly path: string;
	  }
	| {
			readonly kind: "undeclared_path";
			readonly path: string;
	  }
	| {
			readonly kind: "patch_apply_failure";
			readonly stderr: string;
	  };

export type IntegrationOutcome =
	| {
			readonly ok: true;
			readonly touched: readonly string[];
			readonly overDeclared: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly cause: IntegrationRejectionCause;
			readonly touched: readonly string[];
	  };

export interface SubagentSuccessResult {
	readonly status: "success";
	readonly produced_artifacts: readonly string[];
}

export interface IntegrateBundleOptions {
	readonly runtime: WorktreeRuntime;
	readonly handle: WorktreeHandle;
	readonly changeId: string;
	readonly subagentResult: SubagentSuccessResult;
}

/**
 * Run the main-agent integration authority contract for a single bundle.
 *
 * This function does NOT handle subagent failures — the caller SHALL NOT
 * invoke `integrateBundle` when the subagent returned `status: "failure"`;
 * the bundle transitions straight to `subagent_failed` instead. This
 * function ONLY decides accept-vs-reject for subagent successes.
 *
 * On accept (`ok: true`), the patch has been applied at the repo root and
 * the caller SHOULD advance the bundle to `done`. On reject (`ok: false`),
 * the main workspace is untouched and the caller SHOULD advance the bundle
 * to `integration_rejected` while retaining the worktree.
 */
export function integrateBundle(
	options: IntegrateBundleOptions,
): IntegrationOutcome {
	const { runtime, handle, changeId, subagentResult } = options;

	// Step 1: compute diff.
	const patch = computeDiff(runtime, handle);

	// Step 2: if the subagent returned success but the diff is empty, that
	// means the subagent claimed to produce work but the worktree shows no
	// changes. Contract violation — reject with empty_diff_on_success.
	if (patch.length === 0) {
		return {
			ok: false,
			cause: { kind: "empty_diff_on_success" },
			touched: [],
		};
	}

	// Step 3: enumerate touched paths and the declared-artifacts set.
	const touched = listTouchedPaths(patch);
	const touchedArr = [...touched].sort();
	const declared = new Set(subagentResult.produced_artifacts);

	// Step 4: protected-path check. Runs BEFORE the undeclared-paths check so
	// a subagent that declares a protected path in `produced_artifacts` still
	// gets rejected (declaration does not bypass the invariant).
	for (const path of touchedArr) {
		if (isProtectedPath(path, changeId)) {
			return {
				ok: false,
				cause: { kind: "protected_path", path },
				touched: touchedArr,
			};
		}
	}

	// Step 5: undeclared-paths check. Every touched path SHALL be in the
	// declared set. Over-declaration (declared but not touched) is a warning,
	// not a rejection, per spec.
	for (const path of touchedArr) {
		if (!declared.has(path)) {
			return {
				ok: false,
				cause: { kind: "undeclared_path", path },
				touched: touchedArr,
			};
		}
	}

	const overDeclared = [...declared].filter((p) => !touched.has(p)).sort();

	// Step 6: apply the patch at the repo root. Any non-zero exit from
	// `git apply --binary` is a patch-apply failure — we reject rather than
	// attempt a --3way retry, per the Phase 1 spec.
	try {
		importPatch(runtime, patch);
	} catch (err) {
		if (err instanceof WorktreeError && err.cause.operation === "apply") {
			return {
				ok: false,
				cause: {
					kind: "patch_apply_failure",
					stderr: err.cause.stderr?.trim() ?? err.message,
				},
				touched: touchedArr,
			};
		}
		// Unexpected error class — rethrow so the caller's top-level handler
		// can surface it. This is distinct from a recognized patch-apply
		// failure; rethrowing preserves the stack trace for debugging.
		throw err;
	}

	return { ok: true, touched: touchedArr, overDeclared };
}

/**
 * Human-readable one-liner for an integration rejection cause. Used by the
 * apply orchestrator when surfacing the failure to the user.
 */
export function formatRejectionCause(cause: IntegrationRejectionCause): string {
	switch (cause.kind) {
		case "empty_diff_on_success":
			return "empty_diff_on_success: subagent returned status: success but the worktree diff is empty.";
		case "protected_path":
			return `protected_path: diff touches ${cause.path}, which is reserved for main-agent mutation.`;
		case "undeclared_path":
			return `undeclared_path: diff touches ${cause.path}, which is not in produced_artifacts.`;
		case "patch_apply_failure":
			return `patch_apply_failure: git apply --binary rejected the patch — ${cause.stderr}`;
	}
}
