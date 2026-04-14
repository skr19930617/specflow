// Immutable bundle status transitions.

import type { BundleStatus, TaskGraph } from "./types.js";

export interface StatusUpdateResult {
	readonly ok: true;
	readonly taskGraph: TaskGraph;
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

	const updatedBundle = { ...bundle, status: newStatus };
	const updatedBundles = taskGraph.bundles.map((b, i) =>
		i === bundleIndex ? updatedBundle : b,
	);

	return {
		ok: true,
		taskGraph: { ...taskGraph, bundles: updatedBundles },
	};
}
