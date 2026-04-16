// In-memory RunArtifactStore for core-runtime tests.
// Stores run-state content keyed by runId, with no filesystem access.

import type { RunArtifactStore } from "../../lib/artifact-store.js";
import {
	ArtifactStoreError,
	isRunArtifactType,
	type RunArtifactQuery,
	type RunArtifactRef,
	runRef,
	UnknownArtifactTypeError,
} from "../../lib/artifact-types.js";

export interface InMemoryRunArtifactStore extends RunArtifactStore {
	readonly snapshot: () => Map<string, string>;
}

export function createInMemoryRunArtifactStore(
	initial?: Iterable<readonly [string, string]>,
): InMemoryRunArtifactStore {
	const store = new Map<string, string>(initial);

	function ensureType(ref: RunArtifactRef): void {
		if (!isRunArtifactType(ref.type)) {
			throw new UnknownArtifactTypeError(ref.type);
		}
	}

	return {
		async read(ref: RunArtifactRef): Promise<string> {
			ensureType(ref);
			const content = store.get(ref.runId);
			if (content === undefined) {
				return Promise.reject(
					new ArtifactStoreError({
						kind: "not_found",
						message: `Artifact not found: ${ref.runId} (${ref.type})`,
						ref,
					}),
				);
			}
			return content;
		},
		async write(ref: RunArtifactRef, content: string): Promise<void> {
			ensureType(ref);
			store.set(ref.runId, content);
		},
		async exists(ref: RunArtifactRef): Promise<boolean> {
			ensureType(ref);
			return store.has(ref.runId);
		},
		async list(query?: RunArtifactQuery): Promise<readonly RunArtifactRef[]> {
			const refs: RunArtifactRef[] = [];
			for (const runId of store.keys()) {
				if (query?.changeId) {
					const prefix = `${query.changeId}-`;
					if (!runId.startsWith(prefix)) continue;
					const suffix = runId.slice(prefix.length);
					const num = Number.parseInt(suffix, 10);
					if (Number.isNaN(num) || num < 1 || String(num) !== suffix) continue;
				}
				refs.push(runRef(runId));
			}
			refs.sort((a, b) => a.runId.localeCompare(b.runId));
			return refs;
		},
		snapshot(): Map<string, string> {
			return new Map(store);
		},
	};
}
