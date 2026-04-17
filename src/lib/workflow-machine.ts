import { createMachine } from "xstate";

export const workflowVersion = "6.1";

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
				challenge_proposal: { target: "proposal_challenge" },
				reject: { target: "rejected" },
			},
		},
		proposal_challenge: {
			on: {
				reclarify: { target: "proposal_reclarify" },
				reject: { target: "rejected" },
			},
		},
		proposal_reclarify: {
			on: {
				accept_proposal: { target: "spec_draft" },
				reject: { target: "rejected" },
			},
		},
		spec_draft: {
			on: {
				reclarify: { target: "proposal_reclarify" },
				validate_spec: { target: "spec_validate" },
				reject: { target: "rejected" },
			},
		},
		spec_validate: {
			on: {
				revise_spec: { target: "spec_draft" },
				spec_validated: { target: "spec_verify" },
				reject: { target: "rejected" },
			},
		},
		spec_verify: {
			on: {
				revise_spec: { target: "spec_draft" },
				spec_verified: { target: "spec_ready" },
				reject: { target: "rejected" },
			},
		},
		spec_ready: {
			on: {
				accept_spec: { target: "design_draft" },
				reject: { target: "rejected" },
			},
		},
		design_draft: {
			on: {
				review_design: { target: "design_review" },
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
	"challenge_proposal",
	"reclarify",
	"accept_proposal",
	"validate_spec",
	"revise_spec",
	"spec_validated",
	"spec_verified",
	"accept_spec",
	"review_design",
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

function normalizeTargets(
	target: WorkflowTarget | undefined,
): readonly string[] {
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
		"",
		"```mermaid",
		renderWorkflowMermaid(),
		"```",
		"",
		"<!-- END GENERATED WORKFLOW DIAGRAM -->",
	].join("\n");
}

// --- Lifecycle Contract ---
// suspend/resume are status-based lifecycle events, orthogonal to the phase graph.
// They do not add states to the machine; instead they gate phase events via status.

export type RunStatus = "active" | "suspended" | "terminal";

export const lifecycleEvents = ["suspend", "resume"] as const;
export type LifecycleEvent = (typeof lifecycleEvents)[number];

export interface LifecycleTransitionRule {
	readonly event: LifecycleEvent;
	readonly fromStatus: RunStatus;
	readonly toStatus: RunStatus;
}

export const lifecycleTransitionRules: readonly LifecycleTransitionRule[] = [
	{ event: "suspend", fromStatus: "active", toStatus: "suspended" },
	{ event: "resume", fromStatus: "suspended", toStatus: "active" },
];

/**
 * Derive allowed_events from (status, current_phase).
 * - active: phase events from the workflow machine + "suspend"
 * - suspended: only "resume"
 * - terminal: empty
 */
export function deriveAllowedEvents(
	status: RunStatus,
	currentPhase: string,
): string[] {
	switch (status) {
		case "active":
			return [...allowedEventsForState(currentPhase), "suspend"];
		case "suspended":
			return ["resume"];
		case "terminal":
			return [];
	}
}

/**
 * Check if a phase is terminal (no outgoing transitions in the machine).
 */
export function isTerminalPhase(phase: string): boolean {
	return workflowFinalStates.includes(phase);
}
