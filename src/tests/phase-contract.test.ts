import assert from "node:assert/strict";
import test from "node:test";
import {
	type ArtifactRef,
	type CliStep,
	createPhaseContractRegistry,
	type GatedDecisionSpec,
	type PhaseContract,
	phaseContractRegistry,
	renderPhaseMarkdown,
} from "../contracts/phase-contract.js";
import {
	workflowFinalStates,
	workflowStates,
	workflowTransitions,
} from "../lib/workflow-machine.js";

// ---------------------------------------------------------------------------
// Type shape tests
// ---------------------------------------------------------------------------

test("ArtifactRef accepts input and output roles", () => {
	const input: ArtifactRef = { path: "proposal.md", role: "input" };
	const output: ArtifactRef = { path: "design.md", role: "output" };
	assert.equal(input.role, "input");
	assert.equal(output.role, "output");
});

test("CliStep has command and description", () => {
	const step: CliStep = {
		command: 'specflow-run advance "RUN_ID" review_design',
		description: "Enter design review gate",
	};
	assert.equal(typeof step.command, "string");
	assert.equal(typeof step.description, "string");
});

test("GatedDecisionSpec has options and advanceEvents", () => {
	const spec: GatedDecisionSpec = {
		options: ["approve", "reject"],
		advanceEvents: {
			approve: "design_review_approved",
			reject: "reject",
		},
	};
	assert.equal(spec.options.length, 2);
	assert.equal(spec.advanceEvents.approve, "design_review_approved");
});

// ---------------------------------------------------------------------------
// PhaseContract shape
// ---------------------------------------------------------------------------

const sampleContract: PhaseContract = {
	phase: "design_review",
	next_action: "await_user",
	gated: true,
	terminal: false,
	gated_event_kind: "design_review",
	gated_event_type: "design_review_approved",
	next_phase: "design_ready",
	requiredInputs: [
		{ path: "openspec/changes/<CHANGE_ID>/design.md", role: "input" },
	],
	producedOutputs: [
		{
			path: "openspec/changes/<CHANGE_ID>/review-ledger-design.json",
			role: "output",
		},
	],
	cliCommands: [
		{
			command: 'specflow-run advance "<RUN_ID>" review_design',
			description: "Enter design review gate",
		},
	],
	gatedDecision: {
		options: ["approve", "fix", "reject"],
		advanceEvents: {
			approve: "design_review_approved",
			fix: "revise_design",
			reject: "reject",
		},
	},
};

test("PhaseContract includes both routing and execution fields", () => {
	// Routing fields
	assert.equal(sampleContract.next_action, "await_user");
	assert.equal(sampleContract.gated, true);
	assert.equal(sampleContract.terminal, false);

	// Execution fields
	assert.equal(sampleContract.requiredInputs.length, 1);
	assert.equal(sampleContract.producedOutputs.length, 1);
	assert.equal(sampleContract.cliCommands.length, 1);
	assert.ok(sampleContract.gatedDecision);
});

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

test("createPhaseContractRegistry returns contracts by phase name", () => {
	const registry = createPhaseContractRegistry([sampleContract]);
	const result = registry.get("design_review");
	assert.deepStrictEqual(result, sampleContract);
});

test("createPhaseContractRegistry returns undefined for unknown phase", () => {
	const registry = createPhaseContractRegistry([sampleContract]);
	assert.equal(registry.get("nonexistent"), undefined);
});

test("createPhaseContractRegistry lists all phases", () => {
	const contracts: PhaseContract[] = [
		sampleContract,
		{
			phase: "apply_draft",
			next_action: "invoke_agent",
			gated: false,
			terminal: false,
			agent: "claude",
			requiredInputs: [],
			producedOutputs: [],
			cliCommands: [],
		},
	];
	const registry = createPhaseContractRegistry(contracts);
	assert.deepStrictEqual(registry.phases(), ["design_review", "apply_draft"]);
});

test("createPhaseContractRegistry throws on duplicate phase", () => {
	assert.throws(
		() => createPhaseContractRegistry([sampleContract, sampleContract]),
		/Duplicate PhaseContract for phase: design_review/,
	);
});

// ---------------------------------------------------------------------------
// Markdown renderer tests
// ---------------------------------------------------------------------------

test("renderPhaseMarkdown includes CLI commands as fenced code blocks", () => {
	const md = renderPhaseMarkdown(sampleContract);
	assert.ok(md.includes("```bash"));
	assert.ok(md.includes('specflow-run advance "<RUN_ID>" review_design'));
});

test("renderPhaseMarkdown includes artifact refs", () => {
	const md = renderPhaseMarkdown(sampleContract);
	assert.ok(md.includes("**Required Inputs:**"));
	assert.ok(md.includes("design.md"));
	assert.ok(md.includes("**Produced Outputs:**"));
	assert.ok(md.includes("review-ledger-design.json"));
});

test("renderPhaseMarkdown includes gated decision options", () => {
	const md = renderPhaseMarkdown(sampleContract);
	assert.ok(md.includes("**User Decision:**"));
	assert.ok(md.includes("**approve**"));
	assert.ok(md.includes("design_review_approved"));
});

test("renderPhaseMarkdown includes agent task when present", () => {
	const contract: PhaseContract = {
		phase: "apply_draft",
		next_action: "invoke_agent",
		gated: false,
		terminal: false,
		agent: "claude",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [],
		agentTask: { agent: "claude", description: "Implement the feature" },
	};
	const md = renderPhaseMarkdown(contract);
	assert.ok(md.includes("**Agent Task:**"));
	assert.ok(md.includes("`claude`"));
});

test("renderPhaseMarkdown returns empty string for empty contract", () => {
	const contract: PhaseContract = {
		phase: "start",
		next_action: "advance",
		gated: false,
		terminal: false,
		advance_event: "propose",
		requiredInputs: [],
		producedOutputs: [],
		cliCommands: [],
	};
	assert.equal(renderPhaseMarkdown(contract), "");
});

// ---------------------------------------------------------------------------
// Production registry cross-check tests
// ---------------------------------------------------------------------------

test("production registry phases match workflowStates exactly", () => {
	const registryPhases = [...phaseContractRegistry.phases()].sort();
	const machineStates = [...workflowStates].sort();
	assert.deepStrictEqual(registryPhases, machineStates);
});

test("production registry has no orphaned phases", () => {
	const machineSet = new Set(workflowStates);
	for (const phase of phaseContractRegistry.phases()) {
		assert.ok(
			machineSet.has(phase),
			`Registry phase "${phase}" not in workflow machine`,
		);
	}
});

test("every workflow state has a PhaseContract", () => {
	for (const state of workflowStates) {
		const contract = phaseContractRegistry.get(state);
		assert.ok(
			contract !== undefined,
			`Missing PhaseContract for workflow state: ${state}`,
		);
		assert.equal(contract.phase, state);
	}
});

// ---------------------------------------------------------------------------
// phase-semantics conformance: terminal sentinel behavior
// ---------------------------------------------------------------------------

test("terminal phases encode the terminal sentinel for all six roles", () => {
	// AUTHORITATIVE REFERENCE: phase-semantics §approved, §decomposed, §rejected
	// (openspec/specs/phase-semantics/spec.md, Requirement "Per-phase semantic
	// definitions", Scenarios: approved, decomposed, rejected).
	//
	// phase-semantics per-phase scenarios define terminal-specific values for
	// ALL six roles per Decision D7:
	//
	//   Role 1 (identity): the phase name
	//   Role 2 (inputs): "empty" — this IS the terminal-specific value.
	//     phase-semantics §approved: "inputs: empty"
	//     phase-semantics §decomposed: "inputs: empty"
	//     phase-semantics §rejected: "inputs: empty"
	//   Role 3 (outputs): "empty" — this IS the terminal-specific value.
	//     phase-semantics §approved: "outputs: empty (archived artifacts
	//       persist but are not *produced* by this phase)"
	//     phase-semantics §decomposed: "outputs: empty (sub-issue references
	//       persist outside the run)"
	//     phase-semantics §rejected: "outputs: empty"
	//     Empty arrays encode the explicit empty-set, NOT a missing value.
	//   Role 4 (completion): run lifecycle status has reached terminal
	//   Role 5 (branching): "no transition / terminal" with terminal_reason
	//   Role 6 (delegation): deterministic (no agent)
	//
	// These empty-set values are the REQUIRED terminal-specific encoding per
	// the phase-semantics meaning authority (requirement 1). The phase-semantics
	// spec explicitly chose "empty" over artifact references because terminal
	// phases do not produce new artifacts — they merely persist what prior
	// phases created. This is a deliberate semantic decision, not an omission.
	//
	// NOTE: If the phase-semantics spec is later revised to define non-empty
	// terminal outputs, this test MUST be updated to match. The test asserts
	// the current authoritative definition, not a placeholder.
	const expectedTerminals: Record<
		string,
		{ terminal_reason: string; inputs: number; outputs: number }
	> = {
		approved: {
			terminal_reason: "Implementation approved and merged",
			inputs: 0,
			outputs: 0,
		},
		decomposed: {
			terminal_reason: "Proposal decomposed into sub-issues",
			inputs: 0,
			outputs: 0,
		},
		rejected: {
			terminal_reason: "Change rejected",
			inputs: 0,
			outputs: 0,
		},
	};
	for (const phase of workflowFinalStates) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(
			contract !== undefined,
			`Missing PhaseContract for terminal phase: ${phase}`,
		);
		const expected = expectedTerminals[phase];
		assert.ok(expected !== undefined, `No expected terminal data for ${phase}`);
		// Role 1: identity
		assert.equal(contract.phase, phase);
		// Role 5: branching — terminal sentinel
		assert.equal(contract.terminal, true, `${phase}: terminal SHALL be true`);
		assert.equal(
			contract.next_action,
			"terminal",
			`${phase}: next_action SHALL be "terminal"`,
		);
		assert.equal(
			contract.terminal_reason,
			expected.terminal_reason,
			`${phase}: terminal_reason SHALL match phase-semantics`,
		);
		// Role 2: required inputs — phase-semantics defines empty for all terminals
		assert.ok(
			Array.isArray(contract.requiredInputs),
			`${phase}: requiredInputs SHALL be an array (explicit empty-set encoding)`,
		);
		assert.equal(
			contract.requiredInputs.length,
			expected.inputs,
			`${phase}: requiredInputs count SHALL match phase-semantics terminal definition`,
		);
		// Role 3: expected outputs — phase-semantics defines empty for all terminals
		assert.ok(
			Array.isArray(contract.producedOutputs),
			`${phase}: producedOutputs SHALL be an array (explicit empty-set encoding)`,
		);
		assert.equal(
			contract.producedOutputs.length,
			expected.outputs,
			`${phase}: producedOutputs count SHALL match phase-semantics terminal definition`,
		);
		// Role 6: delegation boundary — deterministic (no agent)
		assert.equal(
			contract.agent,
			undefined,
			`${phase}: agent SHALL be undefined (deterministic)`,
		);
		assert.equal(
			contract.agentTask,
			undefined,
			`${phase}: agentTask SHALL be undefined (deterministic)`,
		);
		// Role 4: completion condition — encoded via cliCommands (empty for terminals)
		assert.ok(
			Array.isArray(contract.cliCommands),
			`${phase}: cliCommands SHALL be an array`,
		);
		assert.equal(
			contract.cliCommands.length,
			0,
			`${phase}: cliCommands SHALL be empty (terminal phases have no deterministic work)`,
		);
		// No gated decision on terminal phases
		assert.equal(contract.gated, false, `${phase}: gated SHALL be false`);
		assert.equal(
			contract.gatedDecision,
			undefined,
			`${phase}: gatedDecision SHALL be undefined`,
		);
	}
});

// ---------------------------------------------------------------------------
// phase-semantics conformance: phase-set parity with canonical-workflow-state
// ---------------------------------------------------------------------------

test("terminal phases in workflow machine match terminal phases in registry", () => {
	for (const phase of workflowFinalStates) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(
			contract !== undefined,
			`Missing PhaseContract for final state: ${phase}`,
		);
		assert.equal(
			contract.terminal,
			true,
			`${phase} is a workflow final state but PhaseContract.terminal is false`,
		);
	}
	// Converse: every contract marked terminal must be a workflow final state
	const finalSet = new Set(workflowFinalStates);
	for (const phase of phaseContractRegistry.phases()) {
		const contract = phaseContractRegistry.get(phase);
		if (contract?.terminal) {
			assert.ok(
				finalSet.has(phase),
				`PhaseContract for ${phase} is marked terminal but is not a workflow final state`,
			);
		}
	}
});

// ---------------------------------------------------------------------------
// phase-semantics conformance: lossless coverage of all six roles
// ---------------------------------------------------------------------------

test("every non-terminal PhaseContract encodes all six semantic roles", () => {
	// For non-terminal phases, verify that the PhaseContract expresses:
	// 1. identity (phase field)
	// 2. required inputs (requiredInputs array present)
	// 3. expected outputs (producedOutputs array present)
	// 4. completion condition (implicitly via producedOutputs + advance/gate)
	// 5. branching (advance_event, cliCommands with transition events, or gatedDecision)
	// 6. delegation boundary (agent/agentTask for agent-delegated, cliCommands for deterministic)
	const finalSet = new Set(workflowFinalStates);
	for (const phase of phaseContractRegistry.phases()) {
		if (finalSet.has(phase)) continue;
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		// Role 1: identity
		assert.equal(
			typeof contract.phase,
			"string",
			`${phase}: phase identity must be a string`,
		);
		assert.equal(contract.phase, phase);
		// Role 2: required inputs (array present, may be empty)
		assert.ok(
			Array.isArray(contract.requiredInputs),
			`${phase}: requiredInputs must be an array`,
		);
		// Role 3: expected outputs (array present, may be empty)
		assert.ok(
			Array.isArray(contract.producedOutputs),
			`${phase}: producedOutputs must be an array`,
		);
		// Role 5: branching — at least one transition mechanism must be defined
		const hasBranching =
			contract.advance_event !== undefined ||
			contract.cliCommands.length > 0 ||
			contract.gatedDecision !== undefined;
		assert.ok(
			hasBranching,
			`${phase}: must encode branching via advance_event, cliCommands, or gatedDecision`,
		);
		// Role 6: delegation boundary — either agent-delegated or deterministic
		const hasAgent =
			contract.agent !== undefined || contract.agentTask !== undefined;
		const hasCli = contract.cliCommands.length > 0;
		const hasDelegation =
			hasAgent || hasCli || contract.next_action === "advance";
		assert.ok(
			hasDelegation,
			`${phase}: must encode delegation boundary via agent, agentTask, cliCommands, or next_action=advance`,
		);
	}
});

test("gated phases encode every allowed outcome in gatedDecision", () => {
	// phase-semantics: gatedDecision.advanceEvents SHALL list exactly the
	// event names enumerated as allowed outcomes of the gate.
	for (const phase of phaseContractRegistry.phases()) {
		const contract = phaseContractRegistry.get(phase);
		if (!contract?.gated) continue;
		assert.ok(
			contract.gatedDecision !== undefined,
			`${phase}: gated phase must have gatedDecision`,
		);
		// Every gatedDecision event must correspond to a workflow transition
		const phaseTransitions = workflowTransitions.filter(
			(t) => t.from === phase,
		);
		const validEvents = new Set(phaseTransitions.map((t) => t.event));
		for (const event of Object.values(contract.gatedDecision.advanceEvents)) {
			assert.ok(
				validEvents.has(event),
				`${phase}: gatedDecision event "${event}" is not a valid transition from this phase`,
			);
		}
	}
});

// ---------------------------------------------------------------------------
// phase-semantics conformance: non-universal successor event encoding
// ---------------------------------------------------------------------------

test("start phase encodes all three branches but advance_event covers only mainline (AC3)", () => {
	// phase-semantics: start has three outgoing branches (propose,
	// explore_start, spec_bootstrap_start). The routing model's "advance"
	// only supports single-successor transitions, so advance_event encodes
	// only the mainline branch (propose). The two utility branches are
	// encoded in cliCommands and recoverable by consumers reading the full
	// contract. This is Accepted Spec Conflict AC3 in design.md.
	const contract = phaseContractRegistry.get("start");
	assert.ok(contract !== undefined);
	// advance_event covers only the mainline branch
	assert.equal(
		contract.advance_event,
		"propose",
		"start: advance_event encodes the mainline branch only (AC3)",
	);
	// All three branches must be discoverable in cliCommands
	const allStartTransitions = workflowTransitions.filter(
		(t) => t.from === "start",
	);
	for (const transition of allStartTransitions) {
		assert.ok(
			contract.cliCommands.some((step) =>
				step.command.includes(transition.event),
			),
			`start: cliCommands must encode transition event "${transition.event}" for full branch discoverability (AC3)`,
		);
	}
	// The router can only auto-fire advance_event, so two branches are
	// NOT surfaceable via the routing model alone — this is the accepted
	// limitation documented in AC3.
	const routerOnlyEvents = contract.advance_event
		? [contract.advance_event]
		: [];
	const allEvents = allStartTransitions.map((t) => t.event);
	const nonRouterEvents = allEvents.filter(
		(e) => !routerOnlyEvents.includes(e),
	);
	assert.ok(
		nonRouterEvents.length > 0,
		"start: utility branches exist that the router cannot auto-fire (AC3 limitation)",
	);
});

test("every non-universal successor event is encoded in the source PhaseContract", () => {
	// phase-semantics: for every non-terminal phase, every non-universal
	// successor-transition event enumerated by the workflow state machine
	// SHALL be recoverable from the PhaseContract via advance_event,
	// cliCommands, or gatedDecision.advanceEvents. The universal `reject`
	// event MAY be omitted per the universal-rejection rule.
	for (const transition of workflowTransitions) {
		if (transition.event === "reject") continue;
		const contract = phaseContractRegistry.get(transition.from);
		assert.ok(
			contract !== undefined,
			`Missing PhaseContract for transition source: ${transition.from}`,
		);
		const encodedInAdvance = contract.advance_event === transition.event;
		const encodedInCli = contract.cliCommands.some((step) =>
			step.command.includes(transition.event),
		);
		const encodedInGate = contract.gatedDecision
			? Object.values(contract.gatedDecision.advanceEvents).includes(
					transition.event,
				)
			: false;
		assert.ok(
			encodedInAdvance || encodedInCli || encodedInGate,
			`PhaseContract for ${transition.from} does not encode non-universal transition event "${transition.event}" via advance_event, cliCommands, or gatedDecision`,
		);
	}
});

// ---------------------------------------------------------------------------
// phase-semantics conformance: per-phase required inputs / expected outputs
// ---------------------------------------------------------------------------

test("per-phase requiredInputs match phase-semantics definitions", () => {
	// Verify that specific phases encode the inputs defined by phase-semantics.
	// Phases with non-empty inputs per phase-semantics MUST have non-empty
	// requiredInputs in their PhaseContract.
	const phasesWithInputs: Record<
		string,
		{ minCount: number; mustContain?: string }
	> = {
		proposal_draft: { minCount: 1, mustContain: "source-metadata" },
		proposal_scope: { minCount: 1, mustContain: "proposal.md" },
		proposal_clarify: { minCount: 1, mustContain: "proposal.md" },
		proposal_challenge: { minCount: 1, mustContain: "proposal.md" },
		proposal_reclarify: { minCount: 2, mustContain: "challenge-result-set" },
		spec_draft: { minCount: 1, mustContain: "proposal.md" },
		spec_validate: { minCount: 1, mustContain: "spec.md" },
		spec_verify: { minCount: 2, mustContain: "proposal.md" },
		spec_ready: { minCount: 1, mustContain: "spec.md" },
		design_draft: { minCount: 2, mustContain: "proposal.md" },
		design_review: { minCount: 2, mustContain: "design.md" },
		design_ready: { minCount: 2, mustContain: "design.md" },
		apply_draft: { minCount: 3, mustContain: "design.md" },
		apply_review: { minCount: 1, mustContain: "applied-implementation-state" },
		apply_ready: { minCount: 1, mustContain: "review-ledger.json" },
		spec_bootstrap: { minCount: 1, mustContain: "project-source-tree" },
	};
	for (const [phase, expected] of Object.entries(phasesWithInputs)) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined, `Missing PhaseContract for ${phase}`);
		assert.ok(
			contract.requiredInputs.length >= expected.minCount,
			`${phase}: requiredInputs count ${contract.requiredInputs.length} < expected minimum ${expected.minCount}`,
		);
		if (expected.mustContain) {
			assert.ok(
				contract.requiredInputs.some((r) =>
					r.path.includes(expected.mustContain!),
				),
				`${phase}: requiredInputs must contain a path matching "${expected.mustContain}"`,
			);
		}
	}
});

test("per-phase producedOutputs match phase-semantics definitions", () => {
	// Verify that specific phases encode the outputs defined by phase-semantics.
	// Phases with non-empty outputs per phase-semantics MUST have non-empty
	// producedOutputs in their PhaseContract.
	const phasesWithOutputs: Record<
		string,
		{ minCount: number; mustContain?: string }
	> = {
		proposal_draft: { minCount: 1, mustContain: "proposal.md" },
		proposal_clarify: { minCount: 1, mustContain: "proposal.md" },
		proposal_challenge: { minCount: 1, mustContain: "challenge-result-set" },
		proposal_reclarify: { minCount: 1, mustContain: "proposal.md" },
		spec_draft: { minCount: 1, mustContain: "spec.md" },
		spec_verify: { minCount: 1, mustContain: "design.md" },
		design_draft: { minCount: 2, mustContain: "design.md" },
		design_review: { minCount: 1, mustContain: "review-ledger-design.json" },
		apply_draft: { minCount: 1, mustContain: "task-graph-bundle-transitions" },
		apply_review: { minCount: 1, mustContain: "review-ledger.json" },
		apply_ready: { minCount: 1, mustContain: "approval-summary.md" },
		explore: { minCount: 1, mustContain: "exploration-summary" },
		spec_bootstrap: { minCount: 1, mustContain: "spec.md" },
	};
	for (const [phase, expected] of Object.entries(phasesWithOutputs)) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined, `Missing PhaseContract for ${phase}`);
		assert.ok(
			contract.producedOutputs.length >= expected.minCount,
			`${phase}: producedOutputs count ${contract.producedOutputs.length} < expected minimum ${expected.minCount}`,
		);
		if (expected.mustContain) {
			assert.ok(
				contract.producedOutputs.some((r) =>
					r.path.includes(expected.mustContain!),
				),
				`${phase}: producedOutputs must contain a path matching "${expected.mustContain}"`,
			);
		}
	}
});

test("phases with empty outputs per phase-semantics have empty producedOutputs", () => {
	// phase-semantics explicitly defines these phases as having empty outputs.
	// The empty array is the correct encoding, not a missing value.
	const phasesWithEmptyOutputs = [
		"start",
		"proposal_scope",
		"spec_validate",
		"spec_ready",
		"design_ready",
		"approved",
		"decomposed",
		"rejected",
	];
	for (const phase of phasesWithEmptyOutputs) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined, `Missing PhaseContract for ${phase}`);
		assert.equal(
			contract.producedOutputs.length,
			0,
			`${phase}: producedOutputs SHALL be empty per phase-semantics`,
		);
	}
});

test("agent-delegated phases with agent field populate agentTask", () => {
	// R4-F11: phase-contract-types claims delegation is recoverable from
	// agent, agentTask, and cliCommands. For phases with agent set,
	// agentTask must describe the delegated work so a consumer can tell
	// what work is delegated and what condition makes the phase complete
	// without falling back to slash-command prose.
	const finalSet = new Set(workflowFinalStates);
	for (const phase of phaseContractRegistry.phases()) {
		if (finalSet.has(phase)) continue;
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		if (contract.agent !== undefined) {
			assert.ok(
				contract.agentTask !== undefined,
				`${phase}: agent-delegated phase with agent="${contract.agent}" SHALL have agentTask describing the delegated work`,
			);
			assert.equal(
				contract.agentTask.agent,
				contract.agent,
				`${phase}: agentTask.agent SHALL match the phase's agent field`,
			);
			assert.ok(
				contract.agentTask.description.length > 0,
				`${phase}: agentTask.description SHALL be non-empty`,
			);
		}
	}
});

test("delegation boundary matches phase-semantics classification", () => {
	// phase-semantics classifies each phase as agent-delegated, deterministic,
	// or mixed. This test verifies the ENCODING matches the expected
	// classification, accounting for accepted spec conflicts where the
	// encoding-level representation diverges from the semantic classification.

	// Phases classified as deterministic by phase-semantics AND encoded as
	// deterministic (no agent field) in the PhaseContract.
	const deterministicPhases = ["start", "approved", "decomposed", "rejected"];

	// Phases classified as agent-delegated by phase-semantics.
	const agentDelegatedPhases = [
		"proposal_draft",
		"proposal_scope",
		"proposal_clarify",
		"proposal_challenge",
		"proposal_reclarify",
		"spec_draft",
		"spec_ready",
		"design_draft",
		"design_review",
		"design_ready",
		"apply_draft",
		"apply_review",
		"apply_ready",
		"explore",
		"spec_bootstrap",
	];

	// Phases classified as mixed by phase-semantics.
	const mixedPhases = ["spec_verify"];

	// ACCEPTED SPEC CONFLICT AC4: spec_validate is classified as
	// "deterministic" by phase-semantics — its output-producing work is
	// the deterministic `openspec validate` CLI command. However, the
	// PhaseContract ENCODING uses `agent: "claude"` because the routing
	// model's "advance" mode only supports single-successor transitions,
	// and spec_validate has three outcomes (spec_validated, revise_spec,
	// reject). The agent encoding is a routing workaround; the actual
	// deterministic work is in cliCommands. This test verifies the
	// ENCODING (agent present) and confirms the deterministic work is
	// correctly placed in cliCommands. See design.md AC4.
	const semanticallyDeterministicButEncodedWithAgent = ["spec_validate"];

	for (const phase of deterministicPhases) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		assert.equal(
			contract.agent,
			undefined,
			`${phase}: deterministic phase SHALL have no agent`,
		);
	}
	for (const phase of agentDelegatedPhases) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		assert.ok(
			contract.agent !== undefined || contract.gated === true,
			`${phase}: agent-delegated phase SHALL have an agent or be gated (actor decision)`,
		);
	}
	for (const phase of mixedPhases) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		assert.ok(
			contract.agent !== undefined,
			`${phase}: mixed phase SHALL have an agent for the delegated portion`,
		);
	}
	for (const phase of semanticallyDeterministicButEncodedWithAgent) {
		const contract = phaseContractRegistry.get(phase);
		assert.ok(contract !== undefined);
		// Encoding-level: agent is present due to routing model limitation (AC4)
		assert.equal(
			contract.agent,
			"claude",
			`${phase}: encoding uses agent for multi-branch routing (AC4 — semantically deterministic per phase-semantics)`,
		);
		// Semantic-level: the ACTUAL deterministic output-producing work
		// must be in cliCommands, not delegated to the agent
		assert.ok(
			contract.cliCommands.some((step) =>
				step.command.includes("openspec validate"),
			),
			`${phase}: deterministic output-producing work SHALL be in cliCommands (confirms semantic determinism despite agent encoding, AC4)`,
		);
	}
});
