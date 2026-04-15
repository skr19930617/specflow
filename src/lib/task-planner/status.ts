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

const VALID_TRANSITIONS: ReadonlyMap<BundleStatus, readonly BundleStatus[]> =
	new Map([
		["pending", ["in_progress", "skipped"]],
		["in_progress", ["done"]],
		["done", []],
		["skipped", []],
	]);

const TERMINAL_BUNDLE_STATUSES: ReadonlySet<BundleStatus> = new Set([
	"done",
	"skipped",
]);

function isTerminal(status: BundleStatus): boolean {
	return TERMINAL_BUNDLE_STATUSES.has(status);
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

export function updateBundleStatus(
	taskGraph: TaskGraph,
	bundleId: string,
	newStatus: BundleStatus,
): StatusUpdateResult | StatusUpdateError {
	const bundleIndex = taskGraph.bundles.findIndex((b) => b.id === bundleId);
	if (bundleIndex === -1) {
		return { ok: false, error: `Bundle not found: ${bundleId}` };
	}

	const bundle = taskGraph.bundles[bundleIndex];
	const allowed = VALID_TRANSITIONS.get(bundle.status);
	if (!allowed || !allowed.includes(newStatus)) {
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
