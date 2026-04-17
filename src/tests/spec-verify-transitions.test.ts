import assert from "node:assert/strict";
import test from "node:test";
import {
	allowedEventsForState,
	deriveAllowedEvents,
	workflowEvents,
	workflowStates,
	workflowTransitions,
	workflowVersion,
} from "../lib/workflow-machine.js";

test("workflowVersion bumped to 6.1 for spec_verify", () => {
	assert.equal(workflowVersion, "6.1");
});

test("workflowStates includes spec_verify between spec_validate and spec_ready", () => {
	assert.ok(workflowStates.includes("spec_verify"));
	assert.ok(workflowStates.includes("spec_validate"));
	assert.ok(workflowStates.includes("spec_ready"));
});

test("workflowEvents includes spec_verified", () => {
	assert.ok(workflowEvents.includes("spec_verified"));
});

test("spec_validated retargets from spec_ready to spec_verify", () => {
	const match = workflowTransitions.find(
		(t) => t.from === "spec_validate" && t.event === "spec_validated",
	);
	assert.ok(match, "spec_validate.spec_validated transition missing");
	assert.equal(match?.to, "spec_verify");
});

test("spec_verify.spec_verified transitions to spec_ready", () => {
	const match = workflowTransitions.find(
		(t) => t.from === "spec_verify" && t.event === "spec_verified",
	);
	assert.ok(match, "spec_verify.spec_verified transition missing");
	assert.equal(match?.to, "spec_ready");
});

test("spec_verify.revise_spec loops back to spec_draft", () => {
	const match = workflowTransitions.find(
		(t) => t.from === "spec_verify" && t.event === "revise_spec",
	);
	assert.ok(match, "spec_verify.revise_spec transition missing");
	assert.equal(match?.to, "spec_draft");
});

test("allowedEventsForState(spec_verify) exposes spec_verified and revise_spec", () => {
	const allowed = allowedEventsForState("spec_verify");
	assert.ok(allowed.includes("spec_verified"));
	assert.ok(allowed.includes("revise_spec"));
	assert.ok(allowed.includes("reject"));
});

test("deriveAllowedEvents for spec_verify active run includes suspend", () => {
	const allowed = deriveAllowedEvents("active", "spec_verify");
	assert.ok(allowed.includes("spec_verified"));
	assert.ok(allowed.includes("revise_spec"));
	assert.ok(allowed.includes("suspend"));
});
