// Temporary compatibility helper: map a GateRecord to the `record_id` field
// still referenced by `surface-event-contract` consumers.
//
// The follow-up change that updates `surface-event-contract` and
// `workflow-run-state` will remove these references and delete this helper.
//
// Tracking reference: https://github.com/skr19930617/specflow/issues (create
// a follow-up issue titled "Remove record_id alias from surface-event-contract
// and workflow-run-state" immediately after archiving this change).

import type { GateRecord } from "../types/gate-records.js";
import type { InteractionRecord } from "../types/interaction-records.js";

/**
 * Return the string a surface-event `record_id` field should carry, given a
 * gate record. During the transition period this is identical to the gate's
 * own id so downstream consumers see no behavioral change.
 */
export function recordIdForGate(gate: GateRecord): string {
	return gate.gate_id;
}

/**
 * Return the string a surface-event `record_id` field should carry, given an
 * either-shape record. Accepts legacy records unchanged so existing call sites
 * continue to pass their typed record directly.
 */
export function recordIdFor(record: InteractionRecord | GateRecord): string {
	if (isGateLike(record)) return record.gate_id;
	return record.record_id;
}

function isGateLike(r: InteractionRecord | GateRecord): r is GateRecord {
	return typeof (r as GateRecord).gate_id === "string";
}
