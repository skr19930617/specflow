// InteractionRecordStore — persistence abstraction for interaction records.
//
// Core modules depend on this interface. Adapter implementations (LocalFs, InMemory)
// are provided separately. Responsibility is limited to interaction records;
// run-state persistence remains with RunArtifactStore.

import type { InteractionRecord } from "../types/interaction-records.js";

export interface InteractionRecordStore {
	/** Persist a new or updated interaction record. */
	write(runId: string, record: InteractionRecord): void;

	/** Read a single interaction record. Returns null if not found. */
	read(runId: string, recordId: string): InteractionRecord | null;

	/** List all interaction records for a given run. */
	list(runId: string): readonly InteractionRecord[];

	/** Delete a single interaction record. */
	delete(runId: string, recordId: string): void;
}
