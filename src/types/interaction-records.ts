// Interaction Record types — persistence units for approval and clarify interactions.
//
// These types define the structured records stored under
// .specflow/runs/<runId>/records/<recordId>.json by the InteractionRecordStore.

import type { ActorIdentity } from "../contracts/surface-events.js";

// ---------------------------------------------------------------------------
// Record kind discriminator
// ---------------------------------------------------------------------------

export type RecordKind = "approval" | "clarify";

// ---------------------------------------------------------------------------
// ApprovalRecord
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRecord {
	readonly record_id: string;
	readonly record_kind: "approval";
	readonly run_id: string;
	readonly phase_from: string;
	readonly phase_to: string;
	readonly status: ApprovalStatus;
	readonly requested_at: string;
	readonly decided_at: string | null;
	readonly decision_actor: ActorIdentity | null;
	readonly event_ids: readonly string[];
}

// ---------------------------------------------------------------------------
// ClarifyRecord
// ---------------------------------------------------------------------------

export type ClarifyStatus = "pending" | "resolved";

export interface ClarifyRecord {
	readonly record_id: string;
	readonly record_kind: "clarify";
	readonly run_id: string;
	readonly phase: string;
	readonly question: string;
	readonly question_context?: string;
	readonly answer: string | null;
	readonly status: ClarifyStatus;
	readonly asked_at: string;
	readonly answered_at: string | null;
	readonly event_ids: readonly string[];
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type InteractionRecord = ApprovalRecord | ClarifyRecord;

// ---------------------------------------------------------------------------
// Record ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic record_id in `<kind>-<runId>-<sequence>` format.
 */
export function generateRecordId(
	kind: RecordKind,
	runId: string,
	sequence: number,
): string {
	return `${kind}-${runId}-${sequence}`;
}
