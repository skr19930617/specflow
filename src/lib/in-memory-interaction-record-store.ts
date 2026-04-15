// InMemoryInteractionRecordStore — in-memory adapter for testing.
// No filesystem access. Records are stored in a Map keyed by `${runId}/${recordId}`.

import type { InteractionRecord } from "../types/interaction-records.js";
import type { InteractionRecordStore } from "./interaction-record-store.js";

function key(runId: string, recordId: string): string {
	return `${runId}/${recordId}`;
}

export function createInMemoryInteractionRecordStore(): InteractionRecordStore {
	const store = new Map<string, InteractionRecord>();

	return {
		write(runId: string, record: InteractionRecord): void {
			store.set(key(runId, record.record_id), { ...record });
		},

		read(runId: string, recordId: string): InteractionRecord | null {
			return store.get(key(runId, recordId)) ?? null;
		},

		list(runId: string): readonly InteractionRecord[] {
			const prefix = `${runId}/`;
			const records: InteractionRecord[] = [];
			for (const [k, v] of store) {
				if (k.startsWith(prefix)) {
					records.push(v);
				}
			}
			return records;
		},

		delete(runId: string, recordId: string): void {
			store.delete(key(runId, recordId));
		},
	};
}
