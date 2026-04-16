// LocalFsChangeArtifactStore — local filesystem adapter for change-domain artifacts.
// Path layout: openspec/changes/<changeId>/ — this is adapter-specific, not core contract.

import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ChangeArtifactStore } from "./artifact-store.js";
import {
	ArtifactStoreError,
	type ChangeArtifactQuery,
	type ChangeArtifactRef,
	ChangeArtifactType,
	changeRef,
	isChangeArtifactType,
	type ReviewLedgerKind,
	UnknownArtifactTypeError,
} from "./artifact-types.js";
import { atomicWriteText, readText } from "./fs.js";

function resolvePath(projectRoot: string, ref: ChangeArtifactRef): string {
	const changeDir = resolve(projectRoot, "openspec/changes", ref.changeId);
	switch (ref.type) {
		case ChangeArtifactType.Proposal:
			return resolve(changeDir, "proposal.md");
		case ChangeArtifactType.Design:
			return resolve(changeDir, "design.md");
		case ChangeArtifactType.Tasks:
			return resolve(changeDir, "tasks.md");
		case ChangeArtifactType.TaskGraph:
			return resolve(changeDir, "task-graph.json");
		case ChangeArtifactType.CurrentPhase:
			return resolve(changeDir, "current-phase.md");
		case ChangeArtifactType.ApprovalSummary:
			return resolve(changeDir, "approval-summary.md");
		case ChangeArtifactType.SpecDelta:
			return resolve(changeDir, "specs", ref.qualifier, "spec.md");
		case ChangeArtifactType.ReviewLedger:
			return resolve(
				changeDir,
				ref.qualifier === "apply"
					? "review-ledger.json"
					: `review-ledger-${ref.qualifier}.json`,
			);
	}
}

function backupPath(filePath: string): string {
	return `${filePath}.bak`;
}

function notFoundError(ref: ChangeArtifactRef): ArtifactStoreError {
	const id = `(${ref.changeId}, ${ref.type}${"qualifier" in ref ? `, ${ref.qualifier}` : ""})`;
	return new ArtifactStoreError({
		kind: "not_found",
		message: `Artifact not found: ${id}`,
		ref,
	});
}

export function createLocalFsChangeArtifactStore(
	projectRoot: string,
): ChangeArtifactStore {
	return {
		async read(ref: ChangeArtifactRef): Promise<string> {
			if (!isChangeArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			const path = resolvePath(projectRoot, ref);
			if (!existsSync(path)) {
				return Promise.reject(notFoundError(ref));
			}
			try {
				return readText(path);
			} catch (e) {
				return Promise.reject(
					new ArtifactStoreError({
						kind: "read_failed",
						message: `Read failed: ${ref.changeId}/${ref.type}: ${e instanceof Error ? e.message : String(e)}`,
						ref,
					}),
				);
			}
		},

		async write(ref: ChangeArtifactRef, content: string): Promise<void> {
			if (!isChangeArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			try {
				const path = resolvePath(projectRoot, ref);
				// Unconditional backup for review-ledger before overwrite
				if (ref.type === ChangeArtifactType.ReviewLedger && existsSync(path)) {
					copyFileSync(path, backupPath(path));
				}
				atomicWriteText(path, content);
			} catch (e) {
				return Promise.reject(
					new ArtifactStoreError({
						kind: "write_failed",
						message: `Write failed: ${ref.changeId}/${ref.type}: ${e instanceof Error ? e.message : String(e)}`,
						ref,
					}),
				);
			}
		},

		async exists(ref: ChangeArtifactRef): Promise<boolean> {
			if (!isChangeArtifactType(ref.type)) {
				throw new UnknownArtifactTypeError(ref.type);
			}
			return existsSync(resolvePath(projectRoot, ref));
		},

		async listChanges(): Promise<readonly string[]> {
			const changesDir = resolve(projectRoot, "openspec/changes");
			if (!existsSync(changesDir)) {
				return [];
			}
			return readdirSync(changesDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		},

		async changeExists(changeId: string): Promise<boolean> {
			return existsSync(resolve(projectRoot, "openspec/changes", changeId));
		},

		async list(
			query: ChangeArtifactQuery,
		): Promise<readonly ChangeArtifactRef[]> {
			if (!isChangeArtifactType(query.type)) {
				throw new UnknownArtifactTypeError(query.type);
			}
			const changeDir = resolve(
				projectRoot,
				"openspec/changes",
				query.changeId,
			);

			if (query.type === ChangeArtifactType.SpecDelta) {
				const specsDir = resolve(changeDir, "specs");
				if (!existsSync(specsDir)) {
					return [];
				}
				const entries = readdirSync(specsDir, { withFileTypes: true });
				return entries
					.filter(
						(entry) =>
							entry.isDirectory() &&
							existsSync(resolve(specsDir, entry.name, "spec.md")),
					)
					.map((entry) =>
						changeRef(query.changeId, ChangeArtifactType.SpecDelta, entry.name),
					);
			}

			if (query.type === ChangeArtifactType.ReviewLedger) {
				const refs: ChangeArtifactRef[] = [];
				for (const kind of ["proposal", "design", "apply"] as const) {
					const path = resolve(
						changeDir,
						kind === "apply"
							? "review-ledger.json"
							: `review-ledger-${kind}.json`,
					);
					if (existsSync(path)) {
						refs.push(
							changeRef(
								query.changeId,
								ChangeArtifactType.ReviewLedger,
								kind as ReviewLedgerKind,
							),
						);
					}
				}
				return refs;
			}

			// Singleton artifact — check existence and return single-element or empty
			const ref = changeRef(query.changeId, query.type as never);
			return existsSync(resolvePath(projectRoot, ref)) ? [ref] : [];
		},
	};
}
