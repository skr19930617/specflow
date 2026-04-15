// LocalFsInteractionRecordStore — local filesystem adapter for interaction records.
// Path layout: .specflow/runs/<runId>/records/<recordId>.json

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { InteractionRecord } from "../types/interaction-records.js";
import { atomicWriteText, readText } from "./fs.js";
import type { InteractionRecordStore } from "./interaction-record-store.js";

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
			const path = recordPath(runsDir, runId, record.record_id);
			atomicWriteText(path, `${JSON.stringify(record, null, 2)}\n`);
		},

		read(runId: string, recordId: string): InteractionRecord | null {
			const path = recordPath(runsDir, runId, recordId);
			if (!existsSync(path)) {
				return null;
			}
			return JSON.parse(readText(path)) as InteractionRecord;
		},

		list(runId: string): readonly InteractionRecord[] {
			const dir = recordsDir(runsDir, runId);
			if (!existsSync(dir)) {
				return [];
			}
			let entries: string[];
			try {
				entries = readdirSync(dir);
			} catch {
				return [];
			}
			const records: InteractionRecord[] = [];
			for (const entry of entries) {
				if (!entry.endsWith(".json")) continue;
				const path = resolve(dir, entry);
				try {
					records.push(JSON.parse(readText(path)) as InteractionRecord);
				} catch {
					// Skip malformed files
				}
			}
			return records;
		},

		delete(runId: string, recordId: string): void {
			const path = recordPath(runsDir, runId, recordId);
			if (existsSync(path)) {
				unlinkSync(path);
			}
		},
	};
}
