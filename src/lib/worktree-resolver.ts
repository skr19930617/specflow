// Shared resolver for `state.worktree_path` from a `run_id`.
//
// Phase commands invoked by the user from anywhere must resolve their
// integration target — the main-session worktree — through run-state, NOT via
// `process.cwd()` or `git rev-parse --show-toplevel`. This resolver is the
// single sanctioned indirection point: feed it a run id (and a repo root for
// the run-store lookup) and it returns the worktree path.

import type { RunState } from "../types/contracts.js";
import type { RunArtifactStore } from "./artifact-store.js";
import { runRef } from "./artifact-types.js";
import { readRunState } from "./run-store-ops.js";

export interface WorktreeResolution {
	readonly repoPath: string;
	readonly worktreePath: string;
	readonly branchName: string;
	readonly baseCommit: string;
	readonly baseBranch: string | null;
	readonly cleanupPending: boolean;
}

/**
 * Read run-state for `runId` from `store` and return the worktree-mode path
 * tuple. Throws if the run-state is unreadable or if the record is malformed
 * (the store / parser surface those errors).
 */
export async function resolveWorktreeForRun(
	store: RunArtifactStore,
	runId: string,
): Promise<WorktreeResolution> {
	const state = await readRunState(store, runId);
	return {
		repoPath: state.repo_path,
		worktreePath: state.worktree_path,
		branchName: state.branch_name,
		baseCommit: state.base_commit,
		baseBranch: state.base_branch,
		cleanupPending: state.cleanup_pending,
	};
}

/**
 * Variant that does not throw when the run record is absent. Returns `null`
 * for missing runs. Useful for read-only inspection commands that may be
 * invoked against a run that has not yet been started.
 */
export async function resolveWorktreeForRunOrNull(
	store: RunArtifactStore,
	runId: string,
): Promise<WorktreeResolution | null> {
	const exists = await store.exists(runRef(runId));
	if (!exists) return null;
	return resolveWorktreeForRun(store, runId);
}

/**
 * Resolve the "change root" — the path where `openspec/changes/<CHANGE_ID>/`
 * lives — from run-state. In worktree mode this is `state.worktree_path`; for
 * synthetic runs or when no run exists, it falls back to `repoRoot`.
 *
 * Applies the legacy guard: if a non-synthetic run has `worktree_path ==
 * repo_path` (the old branch-checkout layout), this function throws instead of
 * silently operating against the user's repo root. Callers must drain the
 * legacy run via `/specflow.approve` or `/specflow.reject` before proceeding.
 */
export async function resolveChangeRootForRun(
	store: RunArtifactStore,
	runId: string | undefined,
	repoRoot: string,
): Promise<string> {
	if (!runId) return repoRoot;
	const exists = await store.exists(runRef(runId));
	if (!exists) return repoRoot;
	const state: RunState = await readRunState(store, runId);
	if (
		(state as unknown as Record<string, unknown>).run_kind !== "synthetic" &&
		state.worktree_path === state.repo_path
	) {
		throw new Error(
			`Run '${runId}' uses the legacy layout (worktree_path == repo_path). ` +
				`Drain via /specflow.approve or /specflow.reject before using this command.`,
		);
	}
	return state.worktree_path;
}
