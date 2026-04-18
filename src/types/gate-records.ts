// GateRecord types — unified persistence unit for workflow gates.
//
// Defined by the workflow-gate-semantics capability. A Gate is a first-class
// persistent workflow object representing a pending decision point in a run.
// Each Gate is one of three kinds (approval, clarify, review_decision) and
// carries kind-specific context in its `payload`.

import type { ActorIdentity } from "../contracts/surface-events.js";

// ---------------------------------------------------------------------------
// Discriminators
// ---------------------------------------------------------------------------

/** The three supported gate kinds. */
export type GateKind = "approval" | "clarify" | "review_decision";

/** Terminal status machine: pending is initial; resolved and superseded are terminal. */
export type GateStatus = "pending" | "resolved" | "superseded";

// ---------------------------------------------------------------------------
// Payload shapes (discriminated by kind)
// ---------------------------------------------------------------------------

export interface ApprovalGatePayload {
	readonly kind: "approval";
	readonly phase_from: string;
	readonly phase_to: string;
}

export interface ClarifyGatePayload {
	readonly kind: "clarify";
	readonly question: string;
	readonly question_context?: string;
	readonly answer?: string;
}

/** Review-round provenance persisted with the gate so surfaces can render without replaying the ledger. */
export interface ReviewDecisionGatePayload {
	readonly kind: "review_decision";
	readonly review_round_id: string;
	readonly findings: readonly ReviewFindingSnapshot[];
	readonly reviewer_actor: string;
	readonly reviewer_actor_id: string;
	readonly approval_binding: "binding" | "advisory" | "not_applicable";
}

/**
 * A minimal snapshot of a review finding carried in a review_decision gate payload.
 * Full finding objects still live in the review ledger; the gate only needs enough
 * context for surfaces to render the pending decision.
 */
export interface ReviewFindingSnapshot {
	readonly id: string;
	readonly severity: "critical" | "high" | "medium" | "low";
	readonly status: string;
	readonly title: string;
}

export type GatePayload =
	| ApprovalGatePayload
	| ClarifyGatePayload
	| ReviewDecisionGatePayload;

// ---------------------------------------------------------------------------
// GateRecord
// ---------------------------------------------------------------------------

/**
 * The canonical persistence shape for every workflow gate. Stored at
 * `.specflow/runs/<run_id>/records/<gate_id>.json`.
 */
export interface GateRecord {
	readonly gate_id: string;
	readonly gate_kind: GateKind;
	readonly run_id: string;
	readonly originating_phase: string;
	readonly status: GateStatus;
	readonly reason: string;
	readonly payload: GatePayload;
	readonly eligible_responder_roles: readonly string[];
	readonly allowed_responses: readonly string[];
	readonly created_at: string;
	readonly resolved_at: string | null;
	readonly decision_actor: ActorIdentity | null;
	/** When resolved, the response token (accept/reject/request_changes/clarify_response) that produced the terminal state. Null for pending and superseded. */
	readonly resolved_response: string | null;
	readonly event_ids: readonly string[];
}

// ---------------------------------------------------------------------------
// Runtime-owned policy tables
// ---------------------------------------------------------------------------

/**
 * Fixed `allowed_responses` set for each gate kind. The runtime is the single
 * source of truth; the table is intentionally inspectable in one place and
 * MUST match the workflow-gate-semantics spec.
 */
export const ALLOWED_RESPONSES_BY_KIND: {
	readonly [K in GateKind]: readonly string[];
} = {
	approval: ["accept", "reject"],
	clarify: ["clarify_response"],
	review_decision: ["accept", "reject", "request_changes"],
} as const;

/**
 * Default per-kind eligible responder role policy. All three kinds default to
 * `human-author` in this change; delegated or multi-role cases remain a future
 * extension point per the design's Open Questions.
 */
export const DEFAULT_ELIGIBLE_ROLES_BY_KIND: {
	readonly [K in GateKind]: readonly string[];
} = {
	approval: ["human-author"],
	clarify: ["human-author"],
	review_decision: ["human-author"],
} as const;

/** Returns a copy of the fixed allowed_responses list for the given gate kind. */
export function allowedResponsesFor(kind: GateKind): readonly string[] {
	return ALLOWED_RESPONSES_BY_KIND[kind];
}

/** Returns a copy of the default eligible_responder_roles list for the given gate kind. */
export function defaultEligibleRolesFor(kind: GateKind): readonly string[] {
	return DEFAULT_ELIGIBLE_ROLES_BY_KIND[kind];
}

// ---------------------------------------------------------------------------
// Gate ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic gate_id in `<kind>-<runId>-<sequence>` format.
 * Matches the legacy record_id scheme so migration can preserve ids byte-for-byte.
 */
export function generateGateId(
	kind: GateKind,
	runId: string,
	sequence: number,
): string {
	return `${kind}-${runId}-${sequence}`;
}

// ---------------------------------------------------------------------------
// Error type for unmigrated legacy records
// ---------------------------------------------------------------------------

/**
 * Thrown when `GateRecordStore.read` or `list` encounters a legacy-shaped file
 * (record_kind present, gate_kind absent). The runtime fails fast so that
 * concurrency checks and pending-gate queries never silently consume unmigrated
 * data. Callers should direct users to run `specflow-migrate-records` first.
 */
export class UnmigratedRecordError extends Error {
	readonly gate_id_or_path: string;
	constructor(gateIdOrPath: string, message?: string) {
		super(
			message ??
				`Legacy interaction record found at ${gateIdOrPath}. Run 'specflow-migrate-records' before continuing.`,
		);
		this.name = "UnmigratedRecordError";
		this.gate_id_or_path = gateIdOrPath;
	}
}

/**
 * Type guard: does the parsed JSON object look like a legacy ApprovalRecord or
 * ClarifyRecord (has `record_kind` and/or `record_id` but no `gate_kind`)?
 */
export function isLegacyRecordShape(parsed: unknown): boolean {
	if (parsed === null || typeof parsed !== "object") return false;
	const obj = parsed as Record<string, unknown>;
	const hasLegacyMarker =
		typeof obj.record_kind === "string" || typeof obj.record_id === "string";
	const hasGateMarker =
		typeof obj.gate_kind === "string" && typeof obj.gate_id === "string";
	return hasLegacyMarker && !hasGateMarker;
}

/** Type guard: does the parsed JSON object satisfy the GateRecord shape? */
export function isGateRecordShape(parsed: unknown): parsed is GateRecord {
	if (parsed === null || typeof parsed !== "object") return false;
	const obj = parsed as Record<string, unknown>;
	return (
		typeof obj.gate_id === "string" &&
		typeof obj.gate_kind === "string" &&
		typeof obj.run_id === "string" &&
		typeof obj.originating_phase === "string" &&
		typeof obj.status === "string" &&
		Array.isArray(obj.eligible_responder_roles) &&
		Array.isArray(obj.allowed_responses) &&
		Array.isArray(obj.event_ids)
	);
}
