// LocalFsInteractionRecordStore — local filesystem adapter for interaction records.
// Path layout: .specflow/runs/<runId>/records/<recordId>.json
//
// Post-migration: if the `.migrated` sentinel exists in a run's records
// directory, this store fails fast so callers are forced onto GateRecordStore.

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { InteractionRecord } from "../types/interaction-records.js";
import { atomicWriteText, readText } from "./fs.js";
import type { InteractionRecordStore } from "./interaction-record-store.js";

const MIGRATED_SENTINEL = ".migrated";

/**
 * Thrown when a run directory has been migrated to gate records and the legacy
 * InteractionRecordStore should no longer be used. Callers should switch to
 * GateRecordStore.
 */
export class MigratedDirectoryError extends Error {
	readonly runId: string;
	constructor(runId: string, detail?: string) {
		super(
			detail ??
				`Run '${runId}' has been migrated to gate records. Use GateRecordStore instead of InteractionRecordStore.`,
		);
		this.name = "MigratedDirectoryError";
		this.runId = runId;
	}
}

function isGateRecordShape(parsed: unknown): boolean {
	if (parsed === null || typeof parsed !== "object") return false;
	const obj = parsed as Record<string, unknown>;
	return typeof obj.gate_id === "string" && typeof obj.gate_kind === "string";
}

function isInteractionRecordShape(parsed: unknown): boolean {
	if (parsed === null || typeof parsed !== "object") return false;
	const obj = parsed as Record<string, unknown>;
	return (
		typeof obj.record_id === "string" && typeof obj.record_kind === "string"
	);
}

function assertNotMigrated(dir: string, runId: string): void {
	if (existsSync(resolve(dir, MIGRATED_SENTINEL))) {
		throw new MigratedDirectoryError(runId);
	}
}

function recordsDir(runsDir: string, runId: string): string {
	return resolve(runsDir, runId, "records");
}

function recordPath(runsDir: string, runId: string, recordId: string): string {
	return resolve(recordsDir(runsDir, runId), `${recordId}.json`);
}

export function createLocalFsInteractionRecordStore(
	projectRoot: string,
): InteractionRecordStore {
	const runsDir = resolve(projectRoot, ".specflow/runs");

	return {
		write(runId: string, record: InteractionRecord): void {
			const dir = recordsDir(runsDir, runId);
			assertNotMigrated(dir, runId);
			const path = recordPath(runsDir, runId, record.record_id);
			atomicWriteText(path, `${JSON.stringify(record, null, 2)}\n`);
		},

		read(runId: string, recordId: string): InteractionRecord | null {
			const dir = recordsDir(runsDir, runId);
			assertNotMigrated(dir, runId);
			const path = recordPath(runsDir, runId, recordId);
			if (!existsSync(path)) {
				return null;
			}
			const parsed = JSON.parse(readText(path)) as unknown;
			if (isGateRecordShape(parsed)) {
				throw new MigratedDirectoryError(
					runId,
					`Gate-shaped record found at ${path}. ` +
						`Run 'specflow-migrate-records' or use GateRecordStore.`,
				);
			}
			if (!isInteractionRecordShape(parsed)) {
				throw new MigratedDirectoryError(
					runId,
					`Unrecognized record format at ${path}. ` +
						`Run 'specflow-migrate-records' to ensure all records are in the expected format.`,
				);
			}
			return parsed as InteractionRecord;
		},

		list(runId: string): readonly InteractionRecord[] {
			const dir = recordsDir(runsDir, runId);
			if (!existsSync(dir)) {
				return [];
			}
			assertNotMigrated(dir, runId);
			let entries: string[];
			try {
				entries = readdirSync(dir);
			} catch {
				return [];
			}
			const records: InteractionRecord[] = [];
			for (const entry of entries) {
				if (!entry.endsWith(".json")) continue;
				if (entry.startsWith(".")) continue;
				const path = resolve(dir, entry);
				try {
					const parsed = JSON.parse(readText(path)) as unknown;
					// Fail fast if a gate-shaped file is found; the directory
					// contains migrated data and callers must use GateRecordStore.
					if (isGateRecordShape(parsed)) {
						throw new MigratedDirectoryError(
							runId,
							`Gate-shaped record found at ${path}. ` +
								`Run 'specflow-migrate-records' or use GateRecordStore.`,
						);
					}
					// Fail fast on unrecognized JSON shapes — partial migration
					// or unexpected files must not be silently tolerated. Every
					// JSON file in the records directory must be a recognized
					// InteractionRecord shape.
					if (!isInteractionRecordShape(parsed)) {
						throw new MigratedDirectoryError(
							runId,
							`Unrecognized record format at ${path}. ` +
								`Run 'specflow-migrate-records' to ensure all records are in the expected format.`,
						);
					}
					records.push(parsed as InteractionRecord);
				} catch (cause) {
					if (cause instanceof MigratedDirectoryError) throw cause;
					// Skip files that cannot be parsed as JSON (corrupt/truncated).
					// Recognizable-but-wrong shapes fail fast above.
				}
			}
			return records;
		},

		delete(runId: string, recordId: string): void {
			const dir = recordsDir(runsDir, runId);
			assertNotMigrated(dir, runId);
			const path = recordPath(runsDir, runId, recordId);
			if (existsSync(path)) {
				unlinkSync(path);
			}
		},
	};
}
