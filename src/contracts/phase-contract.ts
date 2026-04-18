// Canonical PhaseContract types and registry.
//
// PhaseContract is the single source of truth for what a workflow phase
// does (execution metadata) and how it routes (routing metadata).
// Previously owned by src/lib/phase-router/types.ts (#129).

import type { EventType } from "./surface-events.js";

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

/** Identifies an artifact consumed or produced by a phase. */
export interface ArtifactRef {
	readonly path: string;
	readonly role: "input" | "output";
}

/** A CLI command invocation within a phase. */
export interface CliStep {
	readonly command: string;
	readonly description: string;
}

/** Minimal description of work delegated to an AI agent. */
export interface AgentTaskSpec {
	readonly agent: string;
	readonly description: string;
}

/** A user decision point within a gated phase. */
export interface GatedDecisionSpec {
	readonly options: readonly string[];
	readonly advanceEvents: Readonly<Record<string, string>>;
}

/**
 * Declarative descriptor for data flowing into or out of a phase.
 * Compile-time only in Phase 1; runtime validation deferred to Phase 2.
 */
export interface PhaseIODescriptor {
	readonly artifacts: readonly string[];
}

/**
 * Declarative gate condition — describes what must hold before a phase
 * transition is allowed. Evaluation logic is deferred to Phase 2.
 */
export type GateConditionKind =
	| "artifact_exists"
	| "approval_required"
	| "validation_passed";

export interface GateCondition {
	readonly kind: GateConditionKind;
	readonly target?: string;
}

// ---------------------------------------------------------------------------
// PhaseNextAction (moved from phase-router/types.ts)
// ---------------------------------------------------------------------------

/** The four kinds of action the router can direct the orchestrator to take. */
export type PhaseNextAction =
	| "invoke_agent"
	| "await_user"
	| "advance"
	| "terminal";

// ---------------------------------------------------------------------------
// PhaseContract — unified routing + execution metadata
// ---------------------------------------------------------------------------

/**
 * Structured metadata attached to a single workflow phase.
 *
 * Routing fields (`next_action`, `gated`, `terminal`) drive the PhaseRouter.
 * Execution fields (`requiredInputs`, `producedOutputs`, `cliCommands`,
 * `agentTask`, `gatedDecision`) describe what the phase does operationally.
 */
export interface PhaseContract {
	// --- identity ---
	readonly phase: string;

	// --- routing metadata (consumed by PhaseRouter) ---
	readonly next_action: PhaseNextAction;
	readonly gated: boolean;
	readonly terminal: boolean;
	/** Agent name — required iff next_action === "invoke_agent". */
	readonly agent?: string;
	/** Name of the event to fire — required iff next_action === "advance". */
	readonly advance_event?: string;
	/** Surface event kind — required iff gated === true. */
	readonly gated_event_kind?: string;
	/** Concrete event type for the gated envelope — required iff gated === true. */
	readonly gated_event_type?: EventType;
	/** Phase the workflow transitions to upon approval — used in envelope payload. */
	readonly next_phase?: string;
	/** Terminal reason — required iff terminal === true. */
	readonly terminal_reason?: string;

	// --- execution metadata (consumed by renderer, orchestrator) ---
	readonly requiredInputs: readonly ArtifactRef[];
	readonly producedOutputs: readonly ArtifactRef[];
	readonly cliCommands: readonly CliStep[];
	readonly agentTask?: AgentTaskSpec;
	readonly gatedDecision?: GatedDecisionSpec;

	// --- structured phase descriptors (Phase 1: type-only, no evaluation) ---
	/** Declarative input descriptor — artifacts expected before entering this phase. */
	readonly input?: PhaseIODescriptor;
	/** Declarative output descriptor — artifacts produced by this phase. */
	readonly output?: PhaseIODescriptor;
	/** Declarative gate conditions — requirements that must hold for transition. */
	readonly gate_conditions?: readonly GateCondition[];
}

// ---------------------------------------------------------------------------
// PhaseContractRegistry
// ---------------------------------------------------------------------------

/**
 * Registry of PhaseContracts keyed by phase name.
 * Kept interface-only so production registries and test fixtures can both
 * implement it.
 */
export interface PhaseContractRegistry {
	get(phase: string): PhaseContract | undefined;
	phases(): readonly string[];
}

/**
 * Build a PhaseContractRegistry from a static array of contracts.
 * Throws on duplicate phase names.
 */
export function createPhaseContractRegistry(
	contracts: readonly PhaseContract[],
): PhaseContractRegistry {
	const map = new Map<string, PhaseContract>();
	for (const contract of contracts) {
		if (map.has(contract.phase)) {
			throw new Error(`Duplicate PhaseContract for phase: ${contract.phase}`);
		}
		map.set(contract.phase, contract);
	}
	const orderedPhases: readonly string[] = contracts.map((c) => c.phase);
	return {
		get(phase: string): PhaseContract | undefined {
			return map.get(phase);
		},
		phases(): readonly string[] {
			return orderedPhases;
		},
	};
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

/**
 * Render the structured execution metadata of a PhaseContract as Markdown.
 *
 * Produces sections for:
 * - Required inputs / produced outputs (bullet lists)
 * - CLI commands (fenced code blocks)
 * - Agent task (structured section)
 * - Gated decision (option block)
 *
 * Returns an empty string if the contract has no execution metadata worth
 * rendering.
 */
export function renderPhaseMarkdown(contract: PhaseContract): string {
	const sections: string[] = [];

	// Artifact refs
	const inputs = contract.requiredInputs;
	const outputs = contract.producedOutputs;
	if (inputs.length > 0 || outputs.length > 0) {
		const lines: string[] = [];
		if (inputs.length > 0) {
			lines.push("**Required Inputs:**");
			for (const ref of inputs) {
				lines.push(`- \`${ref.path}\``);
			}
		}
		if (outputs.length > 0) {
			if (lines.length > 0) lines.push("");
			lines.push("**Produced Outputs:**");
			for (const ref of outputs) {
				lines.push(`- \`${ref.path}\``);
			}
		}
		sections.push(lines.join("\n"));
	}

	// CLI commands
	if (contract.cliCommands.length > 0) {
		const lines: string[] = [];
		for (const step of contract.cliCommands) {
			lines.push(`${step.description}:`);
			lines.push("```bash");
			lines.push(step.command);
			lines.push("```");
		}
		sections.push(lines.join("\n"));
	}

	// Agent task
	if (contract.agentTask) {
		sections.push(
			[
				"**Agent Task:**",
				`- Agent: \`${contract.agentTask.agent}\``,
				`- ${contract.agentTask.description}`,
			].join("\n"),
		);
	}

	// Gated decision
	if (contract.gatedDecision) {
		const lines: string[] = ["**User Decision:**"];
		for (const option of contract.gatedDecision.options) {
			const event = contract.gatedDecision.advanceEvents[option] ?? "—";
			lines.push(`- **${option}** → \`${event}\``);
		}
		sections.push(lines.join("\n"));
	}

	return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Production phase contract data
// ---------------------------------------------------------------------------

/** Phase contracts for all workflow states. */
const phaseContractData: readonly PhaseContract[] = [
	// --- Mainline workflow ---
	{
		phase: "start",
		// phase-semantics: start has three outgoing branches (propose,
		// explore_start, spec_bootstrap_start), but the routing model's
		// "advance" mode only supports single-successor transitions. The
		// mainline branch (propose) is encoded via advance_event; the two
		// utility branches are encoded in cliCommands only. Consumers that
		// need all three branches must read cliCommands, not rely on
		// advance_event alone. See Accepted Spec Conflict AC3 in design.md.
		next_action: "advance",
		gated: false,
		terminal: false,
		advance_event: "propose",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" propose',
				description:
					"Enter mainline proposal flow (also auto-fired by advance_event)",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" explore_start',
				description: "Enter exploratory mode (utility branch)",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" spec_bootstrap_start',
				description: "Enter baseline-spec bootstrap mode (utility branch)",
			},
		],
	},
	{
		phase: "proposal_draft",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Generate proposal document (WHY / WHAT / Capabilities / Impact) from the run's source metadata",
		},
		requiredInputs: [{ path: "<RUN_STATE>/source-metadata", role: "input" }],
		producedOutputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "output" },
		],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" check_scope',
				description: "Advance to scope check",
			},
		],
	},
	{
		phase: "proposal_scope",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Analyse proposal scope and recommend single-proposal continuation or decomposition into sub-issues",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
		],
		producedOutputs: [],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" continue_proposal',
				description: "Continue as single proposal",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" decompose',
				description: "Decompose into sub-issues",
			},
		],
	},
	{
		phase: "proposal_clarify",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Resolve clarification questions and integrate answers into the proposal document",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
		],
		producedOutputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "output" },
		],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" challenge_proposal',
				description: "Move to proposal challenge",
			},
		],
	},
	{
		phase: "proposal_challenge",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Produce a challenge result set (challenge items with id, category, question, context) for the proposal",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
		],
		producedOutputs: [
			{ path: "<RUN_STATE>/challenge-result-set", role: "output" },
		],
		cliCommands: [
			{
				command: "specflow-challenge-proposal challenge <CHANGE_ID>",
				description: "Run challenge agent",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" reclarify',
				description: "Enter reclarify phase",
			},
		],
	},
	{
		phase: "proposal_reclarify",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Address every challenge item and revise the proposal with integrated answers",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
			{ path: "<RUN_STATE>/challenge-result-set", role: "input" },
		],
		producedOutputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "output" },
		],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" accept_proposal',
				description: "Accept proposal and enter spec draft",
			},
		],
	},
	{
		phase: "spec_draft",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Generate spec delta files (one per capability listed in the proposal's Capabilities section)",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
		],
		producedOutputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/specs/*/spec.md",
				role: "output",
			},
		],
		cliCommands: [
			{
				command: 'openspec instructions specs --change "<CHANGE_ID>" --json',
				description: "Get spec instructions",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" validate_spec',
				description: "Enter spec validation",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" reclarify',
				description:
					"Return to proposal reclarify when capabilities cannot be resolved",
			},
		],
	},
	{
		phase: "spec_validate",
		// phase-semantics classifies spec_validate as deterministic, but the
		// routing model's "advance" only supports single-successor transitions.
		// spec_validate has three outcomes (spec_validated, revise_spec, reject),
		// so it is encoded as invoke_agent to allow multi-branch routing.
		// See Accepted Spec Conflict AC4 in design.md.
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Route multi-branch outcome of deterministic spec validation (AC4: agent encoding is a routing workaround; actual work is in cliCommands)",
		},
		requiredInputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/specs/*/spec.md",
				role: "input",
			},
		],
		producedOutputs: [],
		cliCommands: [
			{
				command: 'openspec validate "<CHANGE_ID>" --type change --json',
				description: "Run spec validation",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" spec_validated',
				description: "Mark spec as validated",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" revise_spec',
				description: "Return to spec draft for revisions",
			},
		],
	},
	{
		phase: "spec_verify",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Judge each baseline/delta conflict candidate (agent-delegated portion of mixed phase; deterministic helper computes candidates)",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
			{
				path: "openspec/changes/<CHANGE_ID>/specs/*/spec.md",
				role: "input",
			},
		],
		producedOutputs: [
			{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "output" },
		],
		cliCommands: [
			{
				command: 'specflow-spec-verify "<CHANGE_ID>" --json',
				description: "Run hybrid CLI + agent spec consistency verification",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" spec_verified',
				description: "Mark spec as verified and enter spec_ready",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" revise_spec',
				description:
					"Return to spec draft on conflict or missing/unparseable baseline",
			},
		],
	},
	{
		phase: "spec_ready",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "spec_ready",
		gated_event_type: "accept_spec",
		next_phase: "design_draft",
		requiredInputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/specs/*/spec.md",
				role: "input",
			},
		],
		producedOutputs: [],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" accept_spec',
				description: "Accept spec and enter design",
			},
		],
		gatedDecision: {
			options: ["Design に進む", "中止"],
			advanceEvents: {
				"Design に進む": "accept_spec",
				中止: "reject",
			},
		},
	},
	{
		phase: "design_draft",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Generate design document and task breakdown covering every delta spec",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/proposal.md", role: "input" },
			{
				path: "openspec/changes/<CHANGE_ID>/specs/*/spec.md",
				role: "input",
			},
		],
		producedOutputs: [
			{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "output" },
			{ path: "openspec/changes/<CHANGE_ID>/tasks.md", role: "output" },
		],
		cliCommands: [
			{
				command: "specflow-design-artifacts next <CHANGE_ID>",
				description: "Get next design artifact to generate",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" review_design',
				description: "Enter design review gate",
			},
		],
	},
	{
		phase: "design_review",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "design_review",
		gated_event_type: "design_review_approved",
		next_phase: "design_ready",
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "input" },
			{ path: "openspec/changes/<CHANGE_ID>/tasks.md", role: "input" },
		],
		producedOutputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/review-ledger-design.json",
				role: "output",
			},
		],
		cliCommands: [
			{
				command: "specflow-review-design review <CHANGE_ID>",
				description: "Run design review orchestrator",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" design_review_approved',
				description: "Approve design review",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" revise_design',
				description: "Return to design draft for revisions",
			},
		],
		gatedDecision: {
			options: ["実装に進む", "手動修正", "Reject"],
			advanceEvents: {
				実装に進む: "design_review_approved",
				手動修正: "revise_design",
				Reject: "reject",
			},
		},
	},
	{
		phase: "design_ready",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "design_ready",
		gated_event_type: "accept_design",
		next_phase: "apply_draft",
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "input" },
			{ path: "openspec/changes/<CHANGE_ID>/tasks.md", role: "input" },
		],
		producedOutputs: [],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" accept_design',
				description: "Accept design and enter apply",
			},
		],
		gatedDecision: {
			options: ["実装に進む", "中止"],
			advanceEvents: {
				実装に進む: "accept_design",
				中止: "reject",
			},
		},
	},
	{
		phase: "apply_draft",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Implement code changes for each task-graph bundle until all bundles reach terminal status",
		},
		requiredInputs: [
			{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "input" },
			{ path: "openspec/changes/<CHANGE_ID>/tasks.md", role: "input" },
			{
				path: "openspec/changes/<CHANGE_ID>/task-graph.json",
				role: "input",
			},
		],
		producedOutputs: [
			{ path: "<RUN_STATE>/task-graph-bundle-transitions", role: "output" },
		],
		cliCommands: [
			{
				command: "specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>",
				description: "Advance bundle status in task graph",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" review_apply',
				description: "Enter apply review gate",
			},
		],
	},
	{
		phase: "apply_review",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "apply_review",
		gated_event_type: "apply_review_approved",
		next_phase: "apply_ready",
		requiredInputs: [
			{ path: "<RUN_STATE>/applied-implementation-state", role: "input" },
		],
		producedOutputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/review-ledger.json",
				role: "output",
			},
		],
		cliCommands: [
			{
				command: "specflow-review-apply review <CHANGE_ID>",
				description: "Run apply review orchestrator",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" apply_review_approved',
				description: "Approve apply review",
			},
			{
				command: 'specflow-run advance "<RUN_ID>" revise_apply',
				description: "Return to apply draft for revisions",
			},
		],
		gatedDecision: {
			options: ["Approve", "手動修正", "Reject"],
			advanceEvents: {
				Approve: "apply_review_approved",
				手動修正: "revise_apply",
				Reject: "reject",
			},
		},
	},
	{
		phase: "apply_ready",
		next_action: "await_user",
		gated: true,
		terminal: false,
		gated_event_kind: "apply_ready",
		gated_event_type: "accept_apply",
		next_phase: "approved",
		requiredInputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/review-ledger.json",
				role: "input",
			},
		],
		producedOutputs: [
			{
				path: "openspec/changes/<CHANGE_ID>/approval-summary.md",
				role: "output",
			},
		],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" accept_apply',
				description: "Accept apply and finalize",
			},
		],
		gatedDecision: {
			options: ["Approve", "中止"],
			advanceEvents: {
				Approve: "accept_apply",
				中止: "reject",
			},
		},
	},

	// --- Terminal states ---
	//
	// phase-semantics defines all six roles for terminal phases with
	// explicit terminal-specific values (Decision D7 in design.md).
	// Each role encoding is documented inline per-phase below.
	//
	// The empty arrays for requiredInputs, producedOutputs, and cliCommands
	// are the DEFINED terminal-specific values — not missing data. The
	// phase-semantics spec (the meaning authority per D1) explicitly states:
	//   - approved outputs: "empty (archived artifacts persist but are not
	//     produced by this phase)"
	//   - decomposed outputs: "empty (sub-issue references persist outside
	//     the run)"
	//   - rejected outputs: "empty"
	// These empty-set encodings are distinguishable from non-terminal empty
	// arrays because the consumer reads `terminal === true` to identify
	// terminal phases.

	// phase-semantics §approved — all six roles:
	//   Role 1 (identity): "approved"
	//   Role 2 (inputs): empty (terminal-specific: no new inputs consumed)
	//   Role 3 (outputs): empty (terminal-specific: archived artifacts persist
	//     but are not *produced* by this phase)
	//   Role 4 (completion): run lifecycle status has reached terminal
	//   Role 5 (branching): "no transition / terminal" — encoded via
	//     terminal=true, terminal_reason, next_action="terminal"
	//   Role 6 (delegation): deterministic (no agent, no agentTask)
	{
		phase: "approved",
		next_action: "terminal",
		gated: false,
		terminal: true,
		terminal_reason: "Implementation approved and merged",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [],
	},
	// phase-semantics §decomposed — all six roles:
	//   Role 1 (identity): "decomposed"
	//   Role 2 (inputs): empty (terminal-specific: no new inputs consumed)
	//   Role 3 (outputs): empty (terminal-specific: sub-issue references
	//     persist outside the run)
	//   Role 4 (completion): run lifecycle status has reached terminal
	//   Role 5 (branching): "no transition / terminal" — encoded via
	//     terminal=true, terminal_reason, next_action="terminal"
	//   Role 6 (delegation): deterministic (no agent, no agentTask)
	{
		phase: "decomposed",
		next_action: "terminal",
		gated: false,
		terminal: true,
		terminal_reason: "Proposal decomposed into sub-issues",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [],
	},
	// phase-semantics §rejected — all six roles:
	//   Role 1 (identity): "rejected"
	//   Role 2 (inputs): empty (terminal-specific: no new inputs consumed)
	//   Role 3 (outputs): empty (terminal-specific)
	//   Role 4 (completion): run lifecycle status has reached terminal
	//   Role 5 (branching): "no transition / terminal" — encoded via
	//     terminal=true, terminal_reason, next_action="terminal"
	//   Role 6 (delegation): deterministic (no agent, no agentTask)
	{
		phase: "rejected",
		next_action: "terminal",
		gated: false,
		terminal: true,
		terminal_reason: "Change rejected",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [],
	},

	// --- Utility branches ---
	{
		phase: "explore",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Conduct exploratory session and produce a summary or GitHub issue reference",
		},
		requiredInputs: [],
		producedOutputs: [
			{ path: "<RUN_STATE>/exploration-summary", role: "output" },
		],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" explore_complete',
				description: "Return to start after exploration completes",
			},
		],
	},
	{
		phase: "spec_bootstrap",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		agentTask: {
			agent: "claude",
			description:
				"Generate baseline spec files for every identified capability in the project source tree",
		},
		requiredInputs: [
			{ path: "<RUN_STATE>/project-source-tree", role: "input" },
		],
		producedOutputs: [{ path: "openspec/specs/*/spec.md", role: "output" }],
		cliCommands: [
			{
				command: 'specflow-run advance "<RUN_ID>" spec_bootstrap_complete',
				description: "Return to start after baseline specs have been generated",
			},
		],
	},
];

/**
 * Production PhaseContractRegistry covering all workflow states.
 */
export const phaseContractRegistry: PhaseContractRegistry =
	createPhaseContractRegistry(phaseContractData);
