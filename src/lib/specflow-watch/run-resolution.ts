// Run resolution for `specflow-watch`.
//
// Given an optional positional argument (run_id or change_name) and the current
// git branch, resolve which run the watcher should track. The rule is defined
// by the `realtime-progress-ui` spec:
//
//   1. If arg is provided and matches an exact run_id → pick that run.
//   2. Else if arg is provided → treat as change_name, pick latest active run.
//   3. Else (no arg) → use current git branch as change_name, same active-run
//      rule as step 2.
//
// "Latest active" means `status == 'active'`, sorted by `updated_at DESC` then
// `created_at DESC`, picking the first.
//
// The function is pure — it takes the prescanned list of `RunState` and the
// branch name as input, so tests can drive it without touching the filesystem.

import type { RunState } from "../../types/contracts.js";

export interface ResolveRunArgs {
	readonly arg: string | null;
	readonly branch: string | null;
	readonly runs: readonly RunState[];
}

export type ResolveRunErrorKind =
	| "no_active_run_for_change"
	| "no_active_run_for_branch"
	| "branch_unknown";

export interface ResolveRunError {
	readonly kind: ResolveRunErrorKind;
	readonly message: string;
}

export type ResolveRunResult =
	| { readonly ok: true; readonly run: RunState }
	| { readonly ok: false; readonly error: ResolveRunError };

/**
 * Sort active runs by `updated_at DESC`, then `created_at DESC`. Returns a
 * new array; input is not mutated.
 */
function sortActiveRuns(runs: readonly RunState[]): readonly RunState[] {
	const copy = runs.slice();
	copy.sort((a, b) => {
		if (a.updated_at !== b.updated_at) {
			return a.updated_at < b.updated_at ? 1 : -1;
		}
		if (a.created_at === b.created_at) return 0;
		return a.created_at < b.created_at ? 1 : -1;
	});
	return copy;
}

function filterActiveForChange(
	runs: readonly RunState[],
	changeName: string,
): readonly RunState[] {
	return runs.filter(
		(r) => r.change_name === changeName && r.status === "active",
	);
}

export function resolveTrackedRun({
	arg,
	branch,
	runs,
}: ResolveRunArgs): ResolveRunResult {
	if (arg !== null && arg !== "") {
		const exact = runs.find((r) => r.run_id === arg);
		if (exact) {
			return { ok: true, run: exact };
		}
		const active = sortActiveRuns(filterActiveForChange(runs, arg));
		if (active.length > 0) {
			return { ok: true, run: active[0] };
		}
		return {
			ok: false,
			error: {
				kind: "no_active_run_for_change",
				message: `No run with id or active run with change_name '${arg}' found.`,
			},
		};
	}

	if (branch === null || branch === "") {
		return {
			ok: false,
			error: {
				kind: "branch_unknown",
				message:
					"Could not determine the current git branch. Provide an explicit run id or change name argument.",
			},
		};
	}

	const active = sortActiveRuns(filterActiveForChange(runs, branch));
	if (active.length > 0) {
		return { ok: true, run: active[0] };
	}
	return {
		ok: false,
		error: {
			kind: "no_active_run_for_branch",
			message: `No active run for current git branch '${branch}'.`,
		},
	};
}
