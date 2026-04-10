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

test("workflow OpenSpec stays aligned with current workflow, run-state, and review specs", () => {
	const workflowSpec = readFileSync(
		"openspec/specs/workflow-run-state/spec.md",
		"utf8",
	);
	const slashCommandSpec = readFileSync(
		"openspec/specs/slash-command-guides/spec.md",
		"utf8",
	);
	const reviewSpec = readFileSync(
		"openspec/specs/review-orchestration/spec.md",
		"utf8",
	);

	assert.ok(workflowSpec.includes("version `3.0`"));
	assert.ok(workflowSpec.includes("update-field <run_id> last_summary_path"));
	assert.ok(workflowSpec.includes("run_kind"));
	assert.ok(workflowSpec.includes("--run-kind synthetic"));
	assert.ok(slashCommandSpec.includes("apply_ready"));
	assert.ok(slashCommandSpec.includes("continue-on-validation-error path"));
	assert.ok(slashCommandSpec.includes("specflow.explore.md"));
	assert.ok(reviewSpec.includes("specflow-review-proposal"));
	assert.ok(reviewSpec.includes("proposal ledger"));
	assert.ok(reviewSpec.includes("current-phase.md"));
});
