// Bundle completion check — output artifact existence.

import type { Bundle } from "./types.js";

export type ArtifactChecker = (artifactRef: string) => boolean;

export function checkBundleCompletion(
	bundle: Bundle,
	artifactChecker: ArtifactChecker,
): boolean {
	return bundle.outputs.every((output) => artifactChecker(output));
}
