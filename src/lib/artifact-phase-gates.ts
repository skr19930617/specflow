// Artifact-phase gate matrix.
// Maps (fromPhase, event) → { required, produced } artifact requirements.
// This codifies current implicit artifact checks from bins into a single constant.

import type {
	ChangeArtifactStore,
	RunArtifactStore,
} from "./artifact-store.js";
import {
	type ArtifactRequirement,
	type ChangeArtifactRef,
	ChangeArtifactType,
	changeRef,
	type ReviewLedgerKind,
	type RunArtifactRef,
	RunArtifactType,
	runRef,
} from "./artifact-types.js";

export interface GateEntry {
	readonly required: readonly ArtifactRequirement[];
	readonly produced: readonly ArtifactRequirement[];
}

function gateKey(fromPhase: string, event: string): string {
	return `${fromPhase}:${event}`;
}

function req(
	type: "proposal" | "design" | "tasks" | "current-phase" | "approval-summary",
): ArtifactRequirement {
	return { domain: "change", type };
}

function reqLedger(
	qualifier: "proposal" | "design" | "apply",
): ArtifactRequirement {
	return {
		domain: "change",
		type: ChangeArtifactType.ReviewLedger,
		qualifier: qualifier as typeof ReviewLedgerKind.Proposal,
	};
}

function reqRunState(): ArtifactRequirement {
	return { domain: "run", type: RunArtifactType.RunState };
}

// Gate matrix derived from current implicit checks across bins.
// Only transitions that have artifact requirements are listed.
const gateMatrix = new Map<string, GateEntry>([
	// propose: start → proposal_draft
	[
		gateKey("start", "propose"),
		{
			required: [req("proposal")],
			produced: [],
		},
	],

	// review_proposal: proposal_clarify → proposal_review
	[
		gateKey("proposal_clarify", "review_proposal"),
		{
			required: [req("proposal")],
			produced: [],
		},
	],

	// review_design: design_draft → design_review
	[
		gateKey("design_draft", "review_design"),
		{
			required: [req("proposal"), req("design"), req("tasks")],
			produced: [],
		},
	],

	// review_apply: apply_draft → apply_review
	[
		gateKey("apply_draft", "review_apply"),
		{
			required: [req("proposal"), req("design"), req("tasks")],
			produced: [],
		},
	],
]);

export function getGateEntry(
	fromPhase: string,
	event: string,
): GateEntry | undefined {
	return gateMatrix.get(gateKey(fromPhase, event));
}

export interface GateContext {
	readonly changeId: string | null;
	readonly runId: string;
}

export function resolveRequirement(
	requirement: ArtifactRequirement,
	context: GateContext,
): ChangeArtifactRef | RunArtifactRef | null {
	if (requirement.domain === "change") {
		if (!context.changeId) {
			return null;
		}
		if (requirement.type === ChangeArtifactType.ReviewLedger) {
			return changeRef(
				context.changeId,
				ChangeArtifactType.ReviewLedger,
				requirement.qualifier,
			);
		}
		if (requirement.type === ChangeArtifactType.SpecDelta) {
			// spec-delta requirements with qualifierFrom cannot be resolved without
			// additional context (which specific specs). Skip for now.
			return null;
		}
		return changeRef(context.changeId, requirement.type);
	}
	return runRef(context.runId);
}

export function checkGateRequirements(
	fromPhase: string,
	event: string,
	context: GateContext,
	changeStore: ChangeArtifactStore | null,
	_runStore: RunArtifactStore | null,
): ArtifactRequirement | null {
	const gate = getGateEntry(fromPhase, event);
	if (!gate) {
		return null;
	}
	for (const requirement of gate.required) {
		const ref = resolveRequirement(requirement, context);
		if (!ref) {
			continue;
		}
		if ("changeId" in ref) {
			if (changeStore && !changeStore.exists(ref)) {
				return requirement;
			}
		}
	}
	return null;
}

export { gateMatrix };
