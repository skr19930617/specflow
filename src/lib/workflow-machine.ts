import { createMachine } from "xstate";

export const workflowVersion = "3.0";

const workflowMachineConfig = {
	id: "specflow-workflow",
	initial: "start",
	states: {
		start: {
			on: {
				propose: { target: "proposal_draft" },
				explore_start: { target: "explore" },
				spec_bootstrap_start: { target: "spec_bootstrap" },
			},
		},
		proposal_draft: {
			on: {
				check_scope: { target: "proposal_scope" },
				reject: { target: "rejected" },
			},
		},
		proposal_scope: {
			on: {
				continue_proposal: { target: "proposal_clarify" },
				decompose: { target: "decomposed" },
				reject: { target: "rejected" },
			},
		},
		proposal_clarify: {
			on: {
				review_proposal: { target: "proposal_review" },
				reject: { target: "rejected" },
			},
		},
		proposal_review: {
			on: {
				proposal_review_approved: { target: "proposal_validate" },
				revise_proposal: { target: "proposal_clarify" },
				reject: { target: "rejected" },
			},
		},
		proposal_validate: {
			on: {
				revise_proposal: { target: "proposal_clarify" },
				proposal_validated: { target: "proposal_ready" },
				reject: { target: "rejected" },
			},
		},
		proposal_ready: {
			on: {
				accept_proposal: { target: "design_draft" },
				reject: { target: "rejected" },
			},
		},
		design_draft: {
			on: {
				validate_design: { target: "design_validate" },
				reject: { target: "rejected" },
			},
		},
		design_validate: {
			on: {
				design_validated: { target: "design_review" },
				revise_design: { target: "design_draft" },
				reject: { target: "rejected" },
			},
		},
		design_review: {
			on: {
				revise_design: { target: "design_draft" },
				design_review_approved: { target: "design_ready" },
				reject: { target: "rejected" },
			},
		},
		design_ready: {
			on: {
				accept_design: { target: "apply_draft" },
				reject: { target: "rejected" },
			},
		},
		apply_draft: {
			on: {
				review_apply: { target: "apply_review" },
				reject: { target: "rejected" },
			},
		},
		apply_review: {
			on: {
				revise_apply: { target: "apply_draft" },
				apply_review_approved: { target: "apply_ready" },
				reject: { target: "rejected" },
			},
		},
		apply_ready: {
			on: {
				accept_apply: { target: "approved" },
				reject: { target: "rejected" },
			},
		},
		approved: {
			type: "final",
		},
		decomposed: {
			type: "final",
		},
		rejected: {
			type: "final",
		},
		explore: {
			on: {
				explore_complete: { target: "start" },
			},
		},
		spec_bootstrap: {
			on: {
				spec_bootstrap_complete: { target: "start" },
			},
		},
	},
} as const;

const workflowEventOrder = [
	"propose",
	"check_scope",
	"continue_proposal",
	"decompose",
	"review_proposal",
	"proposal_review_approved",
	"revise_proposal",
	"proposal_validated",
	"accept_proposal",
	"validate_design",
	"design_validated",
	"revise_design",
	"design_review_approved",
	"accept_design",
	"review_apply",
	"revise_apply",
	"apply_review_approved",
	"accept_apply",
	"reject",
	"explore_start",
	"explore_complete",
	"spec_bootstrap_start",
	"spec_bootstrap_complete",
] as const;

type WorkflowTarget =
	| string
	| readonly string[]
	| {
			target?: string | readonly string[];
	  }
	| readonly {
			target?: string | readonly string[];
	  }[];

type WorkflowStateConfig = {
	on?: Readonly<Record<string, WorkflowTarget>>;
	type?: string;
};

export interface WorkflowTransition {
	readonly from: string;
	readonly event: string;
	readonly to: string;
}

export const workflowMachine = createMachine(workflowMachineConfig);

function normalizeTargets(target: WorkflowTarget | undefined): readonly string[] {
	if (!target) {
		return [];
	}
	if (typeof target === "string") {
		return [target];
	}
	if (Array.isArray(target)) {
		if (target.every((item) => typeof item === "string")) {
			return target;
		}
		return target.flatMap((item) =>
			item && typeof item === "object" && "target" in item
				? normalizeTargets(item.target)
				: [],
			);
	}
	if (typeof target === "object" && "target" in target) {
		return normalizeTargets(target.target);
	}
	return [];
}

function stateConfigs(): readonly [string, WorkflowStateConfig][] {
	return Object.entries(
		workflowMachineConfig.states as Record<string, WorkflowStateConfig>,
	);
}

function deriveTransitions(): readonly WorkflowTransition[] {
	const transitions: WorkflowTransition[] = [];
	for (const [from, config] of stateConfigs()) {
		if (!config.on) {
			continue;
		}
		for (const [event, target] of Object.entries(config.on)) {
			for (const to of normalizeTargets(target)) {
				transitions.push({ from, event, to });
			}
		}
	}
	return transitions;
}

export const workflowStates = stateConfigs().map(([state]) => state);
export const workflowTransitions = deriveTransitions();
export const workflowEvents = workflowEventOrder.filter((event) =>
	workflowTransitions.some((transition) => transition.event === event),
);
export const workflowFinalStates = stateConfigs()
	.filter(([, config]) => config.type === "final")
	.map(([state]) => state);

function assertWorkflowShape(): void {
	const unknownEvents = workflowTransitions
		.map((transition) => transition.event)
		.filter((event) => !workflowEventOrder.includes(event as never));
	if (unknownEvents.length > 0) {
		throw new Error(
			`Workflow machine declares unknown events: ${unknownEvents.join(", ")}`,
		);
	}
	const seenStates = new Set(workflowStates);
	for (const transition of workflowTransitions) {
		if (!seenStates.has(transition.from) || !seenStates.has(transition.to)) {
			throw new Error(
				`Workflow transition references unknown state: ${transition.from} -> ${transition.to}`,
			);
		}
	}
}

assertWorkflowShape();

export function allowedEventsForState(state: string): string[] {
	return workflowTransitions
		.filter((transition) => transition.from === state)
		.map((transition) => transition.event);
}

export function renderWorkflowMermaid(): string {
	const lines = ["stateDiagram-v2", "  [*] --> start"];
	for (const transition of workflowTransitions) {
		lines.push(
			`  ${transition.from} --> ${transition.to}: ${transition.event}`,
		);
	}
	for (const state of workflowFinalStates) {
		lines.push(`  ${state} --> [*]`);
	}
	return lines.join("\n");
}

export function renderWorkflowReadmeBlock(): string {
	return [
		"<!-- BEGIN GENERATED WORKFLOW DIAGRAM -->",
		"```mermaid",
		renderWorkflowMermaid(),
		"```",
		"<!-- END GENERATED WORKFLOW DIAGRAM -->",
	].join("\n");
}
