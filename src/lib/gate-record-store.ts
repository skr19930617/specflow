// GateRecordStore — persistence abstraction for gate records.
//
// The unified successor to InteractionRecordStore. Deliberately omits a
// per-record `delete` operation: persistent gate objects are audit-relevant and
// removal happens only through run-directory cascade deletion.

import type { GateRecord } from "../types/gate-records.js";

export interface GateRecordStore {
	/** Persist a new or updated gate record. Atomic at the single-file level. */
	write(runId: string, record: GateRecord): void;

	/**
	 * Read a single gate record. Returns null if not found. MUST throw
	 * `UnmigratedRecordError` when a legacy-shaped file is encountered so callers
	 * never silently consume unmigrated data.
	 */
	read(runId: string, gateId: string): GateRecord | null;

	/**
	 * List all gate records (including superseded ones) for a given run. MUST
	 * throw `UnmigratedRecordError` if any file in the records directory uses
	 * the legacy shape, because concurrency checks rely on list to be
	 * authoritative.
	 */
	list(runId: string): readonly GateRecord[];

	// No delete: run-directory cascade deletion is the only supported removal
	// path. See workflow-gate-semantics and approval-clarify-persistence specs.
}
