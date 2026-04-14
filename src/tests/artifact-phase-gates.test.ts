import assert from "node:assert/strict";
import test from "node:test";
import {
	checkGateRequirements,
	type GateContext,
	getGateEntry,
} from "../lib/artifact-phase-gates.js";
import {
	ChangeArtifactType,
	changeRef,
	MissingRequiredArtifactError,
} from "../lib/artifact-types.js";
import { createInMemoryChangeArtifactStore } from "./helpers/in-memory-change-store.js";

function ctx(changeId: string): GateContext {
	return { changeId, runId: `${changeId}-1` };
}

test("gate: design_draft → review_design requires proposal, design, and oneOf(task-graph, tasks)", () => {
	const gate = getGateEntry("design_draft", "review_design");
	assert.ok(gate);
	assert.equal(gate.required.length, 3);
});

test("gate: design review passes when task-graph exists (no tasks)", () => {
	const store = createInMemoryChangeArtifactStore();
	store.seed(changeRef("c", ChangeArtifactType.Proposal), "p");
	store.seed(changeRef("c", ChangeArtifactType.Design), "d");
	store.seed(changeRef("c", ChangeArtifactType.TaskGraph), "{}");

	const missing = checkGateRequirements(
		"design_draft",
		"review_design",
		ctx("c"),
		store,
		null,
	);
	assert.equal(missing, null);
});

test("gate: design review passes when tasks exists (no task-graph, legacy fallback)", () => {
	const store = createInMemoryChangeArtifactStore();
	store.seed(changeRef("c", ChangeArtifactType.Proposal), "p");
	store.seed(changeRef("c", ChangeArtifactType.Design), "d");
	store.seed(changeRef("c", ChangeArtifactType.Tasks), "- [ ] task");

	const missing = checkGateRequirements(
		"design_draft",
		"review_design",
		ctx("c"),
		store,
		null,
	);
	assert.equal(missing, null);
});

test("gate: design review fails when neither task-graph nor tasks exist", () => {
	const store = createInMemoryChangeArtifactStore();
	store.seed(changeRef("c", ChangeArtifactType.Proposal), "p");
	store.seed(changeRef("c", ChangeArtifactType.Design), "d");

	const missing = checkGateRequirements(
		"design_draft",
		"review_design",
		ctx("c"),
		store,
		null,
	);
	assert.ok(missing);
	assert.equal(missing.domain, "change");
	assert.ok("oneOf" in missing);
});

test("gate: apply review uses same oneOf fallback", () => {
	const store = createInMemoryChangeArtifactStore();
	store.seed(changeRef("c", ChangeArtifactType.Proposal), "p");
	store.seed(changeRef("c", ChangeArtifactType.Design), "d");
	store.seed(changeRef("c", ChangeArtifactType.Tasks), "tasks");

	const missing = checkGateRequirements(
		"apply_draft",
		"review_apply",
		ctx("c"),
		store,
		null,
	);
	assert.equal(missing, null);
});

test("gate: task-graph is preferred over tasks when both exist", () => {
	const store = createInMemoryChangeArtifactStore();
	store.seed(changeRef("c", ChangeArtifactType.Proposal), "p");
	store.seed(changeRef("c", ChangeArtifactType.Design), "d");
	store.seed(changeRef("c", ChangeArtifactType.TaskGraph), "{}");
	store.seed(changeRef("c", ChangeArtifactType.Tasks), "tasks");

	const missing = checkGateRequirements(
		"design_draft",
		"review_design",
		ctx("c"),
		store,
		null,
	);
	assert.equal(missing, null);
});

test("MissingRequiredArtifactError formats oneOf correctly", () => {
	const requirement = {
		domain: "change" as const,
		oneOf: ["task-graph" as const, "tasks" as const],
	};
	const error = new MissingRequiredArtifactError(requirement, {
		changeId: "my-change",
	});
	assert.ok(error.message.includes("oneOf[task-graph, tasks]"));
	assert.ok(error.message.includes("my-change"));
});
