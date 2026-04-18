// LocalFsGateRecordStore — local filesystem adapter for gate records.
// Path layout: .specflow/runs/<runId>/records/<gateId>.json
//
// Preserves the existing records/ directory so that run-directory cascade
// deletion continues to work and migration can keep gate_id byte-for-byte
// equal to the prior record_id.

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	type GateRecord,
	isGateRecordShape,
	isLegacyRecordShape,
	UnmigratedRecordError,
} from "../types/gate-records.js";
import { atomicWriteText, readText } from "./fs.js";
import type { GateRecordStore } from "./gate-record-store.js";

function recordsDir(runsDir: string, runId: string): string {
	return resolve(runsDir, runId, "records");
}

function gatePath(runsDir: string, runId: string, gateId: string): string {
	return resolve(recordsDir(runsDir, runId), `${gateId}.json`);
}

function parseOrThrow(path: string): GateRecord {
	const raw = readText(path);
	const parsed = JSON.parse(raw) as unknown;
	if (isLegacyRecordShape(parsed)) {
		throw new UnmigratedRecordError(path);
	}
	if (!isGateRecordShape(parsed)) {
		throw new Error(`Malformed gate record at ${path}`);
	}
	return parsed;
}

export function createLocalFsGateRecordStore(
	projectRoot: string,
): GateRecordStore {
	const runsDir = resolve(projectRoot, ".specflow/runs");

	return {
		write(runId: string, record: GateRecord): void {
			const path = gatePath(runsDir, runId, record.gate_id);
			atomicWriteText(path, `${JSON.stringify(record, null, 2)}\n`);
		},

		read(runId: string, gateId: string): GateRecord | null {
			const path = gatePath(runsDir, runId, gateId);
			if (!existsSync(path)) {
				return null;
			}
			return parseOrThrow(path);
		},

		list(runId: string): readonly GateRecord[] {
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
			const records: GateRecord[] = [];
			for (const entry of entries) {
				if (!entry.endsWith(".json")) continue;
				// Skip migration/journal sentinels; they are not record files.
				if (entry.startsWith(".")) continue;
				const path = resolve(dir, entry);
				// parseOrThrow will raise UnmigratedRecordError if any file in the
				// directory still uses the legacy shape, so callers cannot proceed
				// past list() without a migration.
				records.push(parseOrThrow(path));
			}
			return records;
		},
	};
}
