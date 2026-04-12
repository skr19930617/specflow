// LocalFsRunArtifactStore — local filesystem adapter for run-domain artifacts.
// Path layout: .specflow/runs/<runId>/run.json — this is adapter-specific, not core contract.

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { RunArtifactStore } from "./artifact-store.js";
import {
	ArtifactNotFoundError,
	isRunArtifactType,
	type RunArtifactQuery,
	type RunArtifactRef,
	runRef,
	UnknownArtifactTypeError,
} from "./artifact-types.js";
import { atomicWriteText, readText } from "./fs.js";

function resolvePath(runsDir: string, ref: RunArtifactRef): string {
	return resolve(runsDir, ref.runId, "run.json");
}

export function createLocalFsRunArtifactStore(
	projectRoot: string,
): RunArtifactStore {
	const runsDir = resolve(projectRoot, ".specflow/runs");

	return {
		read(ref: RunArtifactRef): string {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			const path = resolvePath(runsDir, ref);
			if (!existsSync(path)) {
				throw new ArtifactNotFoundError(ref);
			}
			return readText(path);
		},

		write(ref: RunArtifactRef, content: string): void {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			atomicWriteText(resolvePath(runsDir, ref), content);
		},

		exists(ref: RunArtifactRef): boolean {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			return existsSync(resolvePath(runsDir, ref));
		},

		list(query?: RunArtifactQuery): readonly RunArtifactRef[] {
			if (!existsSync(runsDir)) {
				return [];
			}
			let entries: string[];
			try {
				entries = readdirSync(runsDir);
			} catch {
				return [];
			}

			const refs: RunArtifactRef[] = [];
			for (const entry of entries) {
				const runJsonPath = resolve(runsDir, entry, "run.json");
				if (!existsSync(runJsonPath)) {
					continue;
				}
				if (query?.changeId) {
					// Filter by changeId prefix: run_id format is `<changeId>-<N>`
					const prefix = `${query.changeId}-`;
					if (!entry.startsWith(prefix)) {
						continue;
					}
					const suffix = entry.slice(prefix.length);
					const num = Number.parseInt(suffix, 10);
					if (Number.isNaN(num) || num < 1 || String(num) !== suffix) {
						continue;
					}
				}
				refs.push(runRef(entry));
			}
			refs.sort((a, b) => a.runId.localeCompare(b.runId));
			return refs;
		},
	};
}
