import test from "node:test";
import assert from "node:assert/strict";
import {
	allowedEventsForState,
	renderWorkflowMermaid,
	workflowEvents,
	workflowFinalStates,
	workflowMachine,
	workflowStates,
	workflowTransitions,
	workflowVersion,
} from "../lib/workflow-machine.js";

test("workflow machine exports the exact detailed state graph", () => {
	assert.equal(workflowVersion, "3.0");
	assert.deepEqual(workflowStates, [
		"start",
		"proposal_draft",
		"proposal_scope",
		"proposal_clarify",
		"proposal_review",
		"proposal_validate",
		"proposal_ready",
		"design_draft",
		"design_validate",
		"design_review",
		"design_ready",
		"apply_draft",
		"apply_review",
		"apply_ready",
		"approved",
		"decomposed",
		"rejected",
		"explore",
		"spec_bootstrap",
	]);
	assert.deepEqual(workflowEvents, [
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
	]);
	assert.deepEqual(workflowTransitions, [
		{ from: "start", event: "propose", to: "proposal_draft" },
		{ from: "start", event: "explore_start", to: "explore" },
		{ from: "start", event: "spec_bootstrap_start", to: "spec_bootstrap" },
		{ from: "proposal_draft", event: "check_scope", to: "proposal_scope" },
		{ from: "proposal_draft", event: "reject", to: "rejected" },
		{
			from: "proposal_scope",
			event: "continue_proposal",
			to: "proposal_clarify",
		},
		{ from: "proposal_scope", event: "decompose", to: "decomposed" },
		{ from: "proposal_scope", event: "reject", to: "rejected" },
		{
			from: "proposal_clarify",
			event: "review_proposal",
			to: "proposal_review",
		},
		{ from: "proposal_clarify", event: "reject", to: "rejected" },
		{
			from: "proposal_review",
			event: "proposal_review_approved",
			to: "proposal_validate",
		},
		{
			from: "proposal_review",
			event: "revise_proposal",
			to: "proposal_clarify",
		},
		{ from: "proposal_review", event: "reject", to: "rejected" },
		{
			from: "proposal_validate",
			event: "revise_proposal",
			to: "proposal_clarify",
		},
		{
			from: "proposal_validate",
			event: "proposal_validated",
			to: "proposal_ready",
		},
		{ from: "proposal_validate", event: "reject", to: "rejected" },
		{
			from: "proposal_ready",
			event: "accept_proposal",
			to: "design_draft",
		},
		{ from: "proposal_ready", event: "reject", to: "rejected" },
		{
			from: "design_draft",
			event: "validate_design",
			to: "design_validate",
		},
		{ from: "design_draft", event: "reject", to: "rejected" },
		{
			from: "design_validate",
			event: "design_validated",
			to: "design_review",
		},
		{
			from: "design_validate",
			event: "revise_design",
			to: "design_draft",
		},
		{ from: "design_validate", event: "reject", to: "rejected" },
		{
			from: "design_review",
			event: "revise_design",
			to: "design_draft",
		},
		{
			from: "design_review",
			event: "design_review_approved",
			to: "design_ready",
		},
		{ from: "design_review", event: "reject", to: "rejected" },
		{ from: "design_ready", event: "accept_design", to: "apply_draft" },
		{ from: "design_ready", event: "reject", to: "rejected" },
		{ from: "apply_draft", event: "review_apply", to: "apply_review" },
		{ from: "apply_draft", event: "reject", to: "rejected" },
		{ from: "apply_review", event: "revise_apply", to: "apply_draft" },
		{
			from: "apply_review",
			event: "apply_review_approved",
			to: "apply_ready",
		},
		{ from: "apply_review", event: "reject", to: "rejected" },
		{ from: "apply_ready", event: "accept_apply", to: "approved" },
		{ from: "apply_ready", event: "reject", to: "rejected" },
		{ from: "explore", event: "explore_complete", to: "start" },
		{
			from: "spec_bootstrap",
			event: "spec_bootstrap_complete",
			to: "start",
		},
	]);
});

test("workflow machine final states are terminal and reject coverage is explicit", () => {
	assert.deepEqual(workflowFinalStates, ["approved", "decomposed", "rejected"]);
	for (const state of workflowFinalStates) {
		assert.deepEqual(allowedEventsForState(state), []);
	}
	for (const state of [
		"proposal_draft",
		"proposal_scope",
		"proposal_clarify",
		"proposal_review",
		"proposal_validate",
		"proposal_ready",
		"design_draft",
		"design_validate",
		"design_review",
		"design_ready",
		"apply_draft",
		"apply_review",
		"apply_ready",
	]) {
		assert.ok(
			allowedEventsForState(state).includes("reject"),
			`${state} should allow reject`,
		);
	}
	assert.equal(workflowMachine.config.initial, "start");
});

test("workflow mermaid diagram is generated from the machine", () => {
	const diagram = renderWorkflowMermaid();
	assert.ok(diagram.startsWith("stateDiagram-v2\n  [*] --> start"));
	assert.ok(diagram.includes("proposal_review --> proposal_validate: proposal_review_approved"));
	assert.ok(diagram.includes("apply_ready --> approved: accept_apply"));
	assert.ok(diagram.includes("approved --> [*]"));
});
