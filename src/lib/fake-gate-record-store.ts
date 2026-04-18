// FakeGateRecordStore — in-memory adapter for runtime and transition tests.
//
// No filesystem access. Records are stored in a Map keyed by `${runId}/${gateId}`.
// Intentionally aliased as "Fake" rather than "InMemory" to match the task
// graph's naming (bundle gate-record-foundation task 1.3).

import type { GateRecord } from "../types/gate-records.js";
import type { GateRecordStore } from "./gate-record-store.js";

function key(runId: string, gateId: string): string {
	return `${runId}/${gateId}`;
}

export function createFakeGateRecordStore(): GateRecordStore {
	const store = new Map<string, GateRecord>();

	return {
		write(runId: string, record: GateRecord): void {
			store.set(key(runId, record.gate_id), { ...record });
		},

		read(runId: string, gateId: string): GateRecord | null {
			return store.get(key(runId, gateId)) ?? null;
		},

		list(runId: string): readonly GateRecord[] {
			const prefix = `${runId}/`;
			const records: GateRecord[] = [];
			for (const [k, v] of store) {
				if (k.startsWith(prefix)) {
					records.push(v);
				}
			}
			return records;
		},
	};
}
