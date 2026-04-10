import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workflowContract } from "../contracts/workflow.js";
import {
	renderWorkflowReadmeBlock,
	workflowEvents,
	workflowStates,
	workflowTransitions,
	workflowVersion,
} from "../lib/workflow-machine.js";

test("workflow contract matches generated state-machine", () => {
	const rendered = JSON.parse(
		readFileSync("dist/package/global/workflow/state-machine.json", "utf8"),
	) as {
		version: string;
		states: string[];
		events: string[];
		transitions: unknown[];
	};

	assert.equal(rendered.version, workflowContract.version);
	assert.deepEqual(rendered.states, workflowContract.states);
	assert.deepEqual(rendered.events, workflowContract.events);
	assert.deepEqual(rendered.transitions, workflowContract.transitions);
	assert.equal(rendered.version, workflowVersion);
	assert.deepEqual(rendered.states, workflowStates);
	assert.deepEqual(rendered.events, workflowEvents);
	assert.deepEqual(rendered.transitions, workflowTransitions);
});

test("README workflow diagram stays aligned with the generated workflow block", () => {
	const readme = readFileSync("README.md", "utf8");
	const expected = renderWorkflowReadmeBlock();
	const start = readme.indexOf("<!-- BEGIN GENERATED WORKFLOW DIAGRAM -->");
	const end = readme.indexOf("<!-- END GENERATED WORKFLOW DIAGRAM -->");
	assert.notEqual(start, -1);
	assert.notEqual(end, -1);
	const actual = readme
		.slice(start, end + "<!-- END GENERATED WORKFLOW DIAGRAM -->".length)
		.trim();
	assert.equal(actual, expected.trim());
});

test("workflow OpenSpec stays aligned with detailed states, strict validation gates, and proposal review runtime", () => {
	const workflowSpec = readFileSync(
		"openspec/specs/workflow-definition/spec.md",
		"utf8",
	);
	const transitionSpec = readFileSync(
		"openspec/specs/transition-core/spec.md",
		"utf8",
	);
	const runStateSpec = readFileSync(
		"openspec/specs/run-state-management/spec.md",
		"utf8",
	);
	const commandRuntimeSpec = readFileSync(
		"openspec/specs/command-runtime-integration/spec.md",
		"utf8",
	);

	assert.ok(workflowSpec.includes("proposal_draft"));
	assert.ok(workflowSpec.includes("proposal_review"));
	assert.ok(workflowSpec.includes("apply_ready"));
	assert.ok(workflowSpec.includes('"3.0"'));
	assert.ok(transitionSpec.includes("update-field"));
	assert.ok(runStateSpec.includes("update-field <run_id> <field> <value>"));
	assert.ok(runStateSpec.includes("run_kind"));
	assert.ok(commandRuntimeSpec.includes("specflow-review-proposal"));
	assert.ok(commandRuntimeSpec.includes("proposal_ready"));
	assert.ok(
		commandRuntimeSpec.includes(
			"Do **not** continue despite validation errors",
		),
	);
	assert.ok(commandRuntimeSpec.includes("--run-kind synthetic"));
});
