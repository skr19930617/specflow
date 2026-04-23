// Immutable bundle status transitions with child-task normalization on
// terminal transitions. Normalization keeps the bundle (execution truth) and
// its child task statuses (informational view) aligned inside the returned
// TaskGraph, and reports every actual coercion so callers can emit audit logs.

import type {
	Bundle,
	BundleStatus,
	Task,
	TaskGraph,
	TaskStatus,
} from "./types.js";

/**
 * One entry per child `Task` whose `status` was rewritten to match a terminal
 * bundle status. Callers (apply-phase) use this to emit structured audit logs.
 * No-op coercions (child already matched the target) are NOT included.
 */
export interface TaskStatusCoercion {
	readonly bundleId: string;
	readonly taskId: string;
	readonly from: TaskStatus;
	readonly to: TaskStatus;
}

export interface StatusUpdateResult {
	readonly ok: true;
	readonly taskGraph: TaskGraph;
	/**
	 * Child-task coercions applied as part of a terminal bundle transition.
	 * Empty for non-terminal transitions, empty-`tasks` bundles, and for
	 * terminal transitions where every child already matched the target.
	 */
	readonly coercions: readonly TaskStatusCoercion[];
}

export interface StatusUpdateError {
	readonly ok: false;
	readonly error: string;
}

// Default (non-reset) transitions. These are what apply-class workflows are
// allowed to invoke. Transitions OUT of `subagent_failed` / `integration_rejected`
// require `allowReset: true` — see `updateBundleStatus` options.
const VALID_TRANSITIONS: ReadonlyMap<BundleStatus, readonly BundleStatus[]> =
	new Map([
		["pending", ["in_progress", "skipped"]],
		["in_progress", ["done", "subagent_failed", "integration_rejected"]],
		["done", []],
		["skipped", []],
		["subagent_failed", []],
		["integration_rejected", []],
	]);

// Reset-only transitions. These are allowed ONLY when the caller passes
// `allowReset: true` — i.e., from /specflow.fix_apply or an explicit operator
// reset flow. Apply-class workflows SHALL NOT pass this flag.
const RESET_TRANSITIONS: ReadonlyMap<BundleStatus, readonly BundleStatus[]> =
	new Map([
		["subagent_failed", ["pending"]],
		["integration_rejected", ["pending"]],
	]);

// Only `done` and `skipped` trigger child-task normalization. The two new
// apply-worktree statuses (`subagent_failed`, `integration_rejected`) preserve
// child statuses as-is so /specflow.fix_apply can inspect what was in flight.
// The type predicate narrows to `TaskStatus` because both terminal bundle
// statuses are also valid task statuses (child tasks never carry the
// apply-worktree-specific bundle statuses).
const TERMINAL_BUNDLE_STATUSES: ReadonlySet<BundleStatus> =
	new Set<BundleStatus>(["done", "skipped"]);

function isTerminal(status: BundleStatus): status is TaskStatus & BundleStatus {
	return TERMINAL_BUNDLE_STATUSES.has(status);
}

function isTransitionAllowed(
	from: BundleStatus,
	to: BundleStatus,
	allowReset: boolean,
): boolean {
	if (VALID_TRANSITIONS.get(from)?.includes(to)) {
		return true;
	}
	if (allowReset && RESET_TRANSITIONS.get(from)?.includes(to)) {
		return true;
	}
	return false;
}

/**
 * Rebuild a bundle's `tasks` array so every `task.status` equals `target`.
 * Returns the rebuilt tasks plus the per-task coercion entries (only for
 * tasks whose status actually changed).
 */
function normalizeChildTasks(
	bundleId: string,
	tasks: readonly Task[],
	target: TaskStatus,
): {
	readonly tasks: readonly Task[];
	readonly coercions: readonly TaskStatusCoercion[];
} {
	const coercions: TaskStatusCoercion[] = [];
	const rebuilt = tasks.map((task) => {
		if (task.status === target) {
			return task;
		}
		coercions.push({
			bundleId,
			taskId: task.id,
			from: task.status,
			to: target,
		});
		return { ...task, status: target };
	});
	return { tasks: rebuilt, coercions };
}

export interface UpdateBundleStatusOptions {
	/**
	 * When true, permits reset transitions out of `subagent_failed` or
	 * `integration_rejected` back to `pending`. Only /specflow.fix_apply or an
	 * explicit operator reset flow should set this to true; apply-class
	 * workflows SHALL NOT enable it.
	 */
	readonly allowReset?: boolean;
}

export function updateBundleStatus(
	taskGraph: TaskGraph,
	bundleId: string,
	newStatus: BundleStatus,
	options: UpdateBundleStatusOptions = {},
): StatusUpdateResult | StatusUpdateError {
	const bundleIndex = taskGraph.bundles.findIndex((b) => b.id === bundleId);
	if (bundleIndex === -1) {
		return { ok: false, error: `Bundle not found: ${bundleId}` };
	}

	const bundle = taskGraph.bundles[bundleIndex];
	const allowReset = options.allowReset === true;
	if (!isTransitionAllowed(bundle.status, newStatus, allowReset)) {
		return {
			ok: false,
			error: `Invalid status transition: ${bundle.status} → ${newStatus} for bundle '${bundleId}'`,
		};
	}

	let updatedBundle: Bundle;
	let coercions: readonly TaskStatusCoercion[];
	if (isTerminal(newStatus)) {
		// Terminal transitions force-coerce every child task to match. Empty
		// `tasks` arrays are a vacuous success (no coercions emitted).
		const normalized = normalizeChildTasks(bundle.id, bundle.tasks, newStatus);
		updatedBundle = {
			...bundle,
			status: newStatus,
			tasks: normalized.tasks,
		};
		coercions = normalized.coercions;
	} else {
		// Non-terminal transitions (e.g. pending → in_progress) do NOT touch
		// child task statuses. Preserves the "tasks are informational" model.
		updatedBundle = { ...bundle, status: newStatus };
		coercions = [];
	}

	const updatedBundles = taskGraph.bundles.map((b, i) =>
		i === bundleIndex ? updatedBundle : b,
	);

	return {
		ok: true,
		taskGraph: { ...taskGraph, bundles: updatedBundles },
		coercions,
	};
}
