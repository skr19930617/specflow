// LocalFsRunArtifactStore — local filesystem adapter for run-domain artifacts.
// Path layout: .specflow/runs/<runId>/run.json — this is adapter-specific, not core contract.

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { RunArtifactStore } from "./artifact-store.js";
import {
	ArtifactStoreError,
	isRunArtifactType,
	type RunArtifactQuery,
	type RunArtifactRef,
	RunArtifactType,
	runRef,
	UnknownArtifactTypeError,
} from "./artifact-types.js";
import { atomicWriteText, readText } from "./fs.js";

/**
 * Resolve the on-disk path for a run-domain artifact ref. `run-state` lives
 * at `<runsDir>/<runId>/run.json` (historical shape). `autofix-progress`
 * snapshots live at `<runsDir>/<runId>/autofix-progress-<phase>.json`,
 * keyed by `run_id + phase` per the
 * review-autofix-progress-observability contract.
 */
function resolvePath(runsDir: string, ref: RunArtifactRef): string {
	if (ref.type === RunArtifactType.AutofixProgress) {
		return resolve(
			runsDir,
			ref.runId,
			`autofix-progress-${ref.qualifier}.json`,
		);
	}
	return resolve(runsDir, ref.runId, "run.json");
}

function notFoundError(ref: RunArtifactRef): ArtifactStoreError {
	return new ArtifactStoreError({
		kind: "not_found",
		message: `Artifact not found: (${ref.runId}, ${ref.type})`,
		ref,
	});
}

export function createLocalFsRunArtifactStore(
	projectRoot: string,
): RunArtifactStore {
	const runsDir = resolve(projectRoot, ".specflow/runs");

	return {
		async read(ref: RunArtifactRef): Promise<string> {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			const path = resolvePath(runsDir, ref);
			if (!existsSync(path)) {
				return Promise.reject(notFoundError(ref));
			}
			try {
				return readText(path);
			} catch (e) {
				return Promise.reject(
					new ArtifactStoreError({
						kind: "read_failed",
						message: `Read failed: (${ref.runId}, ${ref.type}): ${e instanceof Error ? e.message : String(e)}`,
						ref,
					}),
				);
			}
		},

		async write(ref: RunArtifactRef, content: string): Promise<void> {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			try {
				atomicWriteText(resolvePath(runsDir, ref), content);
			} catch (e) {
				return Promise.reject(
					new ArtifactStoreError({
						kind: "write_failed",
						message: `Write failed: (${ref.runId}, ${ref.type}): ${e instanceof Error ? e.message : String(e)}`,
						ref,
					}),
				);
			}
		},

		async exists(ref: RunArtifactRef): Promise<boolean> {
			if (!isRunArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			return existsSync(resolvePath(runsDir, ref));
		},

		async list(query?: RunArtifactQuery): Promise<readonly RunArtifactRef[]> {
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
