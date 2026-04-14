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
	type RunArtifactRef,
	runRef,
	type SingletonChangeArtifactType,
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

function oneOf(...types: SingletonChangeArtifactType[]): ArtifactRequirement {
	return { domain: "change", oneOf: types };
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

	// challenge_proposal: proposal_clarify → proposal_challenge
	[
		gateKey("proposal_clarify", "challenge_proposal"),
		{
			required: [req("proposal")],
			produced: [],
		},
	],

	// review_design: design_draft → design_review
	[
		gateKey("design_draft", "review_design"),
		{
			required: [req("proposal"), req("design"), oneOf("task-graph", "tasks")],
			produced: [],
		},
	],

	// review_apply: apply_draft → apply_review
	[
		gateKey("apply_draft", "review_apply"),
		{
			required: [req("proposal"), req("design"), oneOf("task-graph", "tasks")],
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

/**
 * Resolve an artifact requirement to a concrete ref.
 * When the requirement contains `oneOf`, `changeStore` is required to check
 * which candidate artifact exists. If `changeStore` is not provided for a
 * `oneOf` requirement, this function returns `null` (unsatisfied).
 */
export function resolveRequirement(
	requirement: ArtifactRequirement,
	context: GateContext,
	changeStore?: ChangeArtifactStore | null,
): ChangeArtifactRef | RunArtifactRef | null {
	if (requirement.domain === "change") {
		if (!context.changeId) {
			return null;
		}
		// oneOf: resolve by checking existence of each candidate in order.
		// changeStore is required for oneOf — callers must supply it.
		if ("oneOf" in requirement) {
			if (!changeStore) {
				throw new Error(
					`resolveRequirement: changeStore is required for oneOf requirements (candidates: ${requirement.oneOf.join(", ")})`,
				);
			}
			for (const type of requirement.oneOf) {
				const ref = changeRef(context.changeId, type);
				if (changeStore.exists(ref)) {
					return ref;
				}
			}
			// None found — return null to signal unsatisfied requirement
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
	runStore: RunArtifactStore | null,
): ArtifactRequirement | null {
	const gate = getGateEntry(fromPhase, event);
	if (!gate) {
		return null;
	}
	for (const requirement of gate.required) {
		// oneOf requirements: resolveRequirement returns null if none of the
		// candidates exist — that means the requirement is unsatisfied.
		if (requirement.domain === "change" && "oneOf" in requirement) {
			const ref = resolveRequirement(requirement, context, changeStore);
			if (!ref) {
				return requirement;
			}
			continue;
		}

		const ref = resolveRequirement(requirement, context, changeStore);
		if (!ref) {
			continue;
		}
		if ("changeId" in ref) {
			if (changeStore && !changeStore.exists(ref)) {
				return requirement;
			}
		}
		if ("runId" in ref) {
			if (runStore && !runStore.exists(ref)) {
				return requirement;
			}
		}
	}
	return null;
}

export { gateMatrix };
