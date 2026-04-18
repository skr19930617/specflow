// Bundle completion check and next execution window selection from task graph.

import type { Bundle, TaskGraph } from "./types.js";

export type ArtifactChecker = (artifactRef: string) => boolean;

export function checkBundleCompletion(
	bundle: Bundle,
	artifactChecker: ArtifactChecker,
): boolean {
	return bundle.outputs.every((output) => artifactChecker(output));
}

export function selectNextWindow(
	taskGraph: TaskGraph,
	artifactChecker: ArtifactChecker,
): readonly Bundle[] {
	const bundleMap = new Map(taskGraph.bundles.map((b) => [b.id, b]));

	return taskGraph.bundles.filter((bundle) => {
		if (bundle.status !== "pending") return false;

		return bundle.depends_on.every((depId) => {
			const dep = bundleMap.get(depId);
			if (!dep) return false;
			return dep.outputs.every((output) => artifactChecker(output));
		});
	});
}
