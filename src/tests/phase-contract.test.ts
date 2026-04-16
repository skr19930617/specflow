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
import { workflowStates } from "../lib/workflow-machine.js";

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
