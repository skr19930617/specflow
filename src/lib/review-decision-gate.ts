// Helper to issue a review_decision gate at the end of a review round.
//
// Review CLIs (`specflow-challenge-proposal`, `specflow-review-design`,
// `specflow-review-apply`) call `issueReviewDecisionGate` after persisting a
// completed round to the ledger. The helper:
//   - builds the review_decision GateRecord payload with the full round
//     provenance (review_round_id, findings, reviewer_actor, approval_binding).
//   - issues the gate via `issueGate` so concurrency / supersede rules apply.
//   - writes the gate_id back-reference into the ledger via the supplied
//     `patchLedgerGateId` hook.
//
// The correlation-and-repair protocol (design D10) is:
//   1) Ledger round is appended with gate_id = null.
//   2) Gate is issued with review_round_id referencing the ledger round.
//   3) Ledger round is patched with the issued gate_id.
// If step 2 or 3 fails, the recovery routine can reconcile by listing pending
// gates with matching review_round_id and patching the ledger back-reference.

import type { ActorIdentity } from "../contracts/surface-events.js";
import type {
	GateRecord,
	ReviewFindingSnapshot,
} from "../types/gate-records.js";
import type { GateRecordStore } from "./gate-record-store.js";
import { type IssueGateInput, issueGate } from "./gate-runtime.js";

export type ReviewPhase =
	| "proposal_challenge"
	| "design_review"
	| "apply_review";

export interface ReviewRoundProvenance {
	readonly run_id: string;
	readonly review_phase: ReviewPhase;
	readonly review_round_id: string;
	readonly findings: readonly ReviewFindingSnapshot[];
	readonly reviewer_actor: "human" | "ai-agent" | "automation";
	readonly reviewer_actor_id: string;
	readonly approval_binding: "binding" | "advisory" | "not_applicable";
	readonly reason?: string;
}

export interface IssueReviewDecisionGateDeps {
	readonly store: GateRecordStore;
	readonly projectRoot: string;
	readonly gateId: string;
	readonly createdAt: string;
	readonly creationEventId?: string;
}

/**
 * Build the IssueGateInput for a review_decision gate. Exported for testing
 * payload construction without hitting the filesystem.
 */
export function buildReviewDecisionGateInput(
	round: ReviewRoundProvenance,
	gateId: string,
	createdAt: string,
	creationEventId?: string,
): IssueGateInput {
	return {
		gate_id: gateId,
		gate_kind: "review_decision",
		run_id: round.run_id,
		originating_phase: round.review_phase,
		reason:
			round.reason ??
			`Review round ${round.review_round_id} completed with ${round.findings.length} finding(s); human-author decision required.`,
		payload: {
			kind: "review_decision",
			review_round_id: round.review_round_id,
			findings: round.findings,
			reviewer_actor: round.reviewer_actor,
			reviewer_actor_id: round.reviewer_actor_id,
			approval_binding: round.approval_binding,
		},
		// eligible_responder_roles is intentionally omitted so the per-kind
		// default policy (human-author only) is applied by issueGate.
		created_at: createdAt,
		creation_event_id: creationEventId,
	};
}

/**
 * Issue exactly one review_decision gate for a completed review round. If a
 * prior pending review_decision gate exists for the same originating_phase, it
 * is superseded atomically by issueGate.
 */
export function issueReviewDecisionGate(
	round: ReviewRoundProvenance,
	deps: IssueReviewDecisionGateDeps,
): GateRecord {
	const input = buildReviewDecisionGateInput(
		round,
		deps.gateId,
		deps.createdAt,
		deps.creationEventId,
	);
	return issueGate(deps.store, deps.projectRoot, input);
}

/**
 * Given a list of a run's gates, find the review_decision gate whose
 * payload.review_round_id matches the given round id. Used by the
 * correlation-and-repair protocol to recover a dangling gate_id back-reference.
 */
export function findReviewDecisionGateByRoundId(
	gates: readonly GateRecord[],
	reviewRoundId: string,
): GateRecord | null {
	for (const g of gates) {
		if (
			g.gate_kind === "review_decision" &&
			g.payload.kind === "review_decision" &&
			g.payload.review_round_id === reviewRoundId
		) {
			return g;
		}
	}
	return null;
}

/** Convenience: derive an `ActorIdentity` from the round provenance. */
export function roundProvenanceToReviewerIdentity(
	round: ReviewRoundProvenance,
): ActorIdentity {
	return {
		actor: round.reviewer_actor,
		actor_id: round.reviewer_actor_id,
	};
}
