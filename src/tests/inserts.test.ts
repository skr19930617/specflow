import assert from "node:assert/strict";
import test from "node:test";
import {
	buildDesignArtifactInstruction,
	insertRegistry,
	renderPhaseSection,
	resolveInsert,
} from "../contracts/inserts.js";
import { buildOpenspecPrereq } from "../contracts/prerequisites.js";

// ---------------------------------------------------------------------------
// Registry entries exist
// ---------------------------------------------------------------------------

test("insertRegistry contains openspec_prereq", () => {
	assert.ok(insertRegistry.has("openspec_prereq"));
});

test("insertRegistry contains design_artifact_instruction", () => {
	assert.ok(insertRegistry.has("design_artifact_instruction"));
});

test("insertRegistry contains render_phase_section", () => {
	assert.ok(insertRegistry.has("render_phase_section"));
});

// ---------------------------------------------------------------------------
// openspec_prereq matches direct call
// ---------------------------------------------------------------------------

test("resolveInsert openspec_prereq(specflow.apply) matches buildOpenspecPrereq", () => {
	const fromRegistry = resolveInsert("openspec_prereq(specflow.apply)");
	const direct = buildOpenspecPrereq("specflow.apply");
	assert.equal(fromRegistry, direct);
});

test("resolveInsert openspec_prereq(specflow) matches buildOpenspecPrereq", () => {
	const fromRegistry = resolveInsert("openspec_prereq(specflow)");
	const direct = buildOpenspecPrereq("specflow");
	assert.equal(fromRegistry, direct);
});

test("openspec_prereq without argument throws", () => {
	assert.throws(
		() => resolveInsert("openspec_prereq"),
		/requires a command name/,
	);
});

// ---------------------------------------------------------------------------
// design_artifact_instruction matches direct call
// ---------------------------------------------------------------------------

test("resolveInsert design_artifact_instruction matches buildDesignArtifactInstruction", () => {
	const fromRegistry = resolveInsert("design_artifact_instruction");
	const direct = buildDesignArtifactInstruction();
	assert.equal(fromRegistry, direct);
});

// ---------------------------------------------------------------------------
// render_phase_section
// ---------------------------------------------------------------------------

test("resolveInsert render_phase_section with unknown phase returns empty", () => {
	const result = resolveInsert("render_phase_section(nonexistent_phase_xyz)");
	assert.equal(result, "");
});

test("render_phase_section without argument throws", () => {
	assert.throws(
		() => resolveInsert("render_phase_section"),
		/requires a phase name/,
	);
});

test("renderPhaseSection exported function matches registry entry", () => {
	const fromFn = renderPhaseSection("proposal_draft");
	const fromRegistry = resolveInsert("render_phase_section(proposal_draft)");
	assert.equal(fromRegistry, fromFn);
});

// ---------------------------------------------------------------------------
// Error: unknown key
// ---------------------------------------------------------------------------

test("resolveInsert throws on unknown key", () => {
	assert.throws(() => resolveInsert("nonexistent_key"), /Unknown insert key/);
});

test("resolveInsert throws on unknown key with arg", () => {
	assert.throws(
		() => resolveInsert("nonexistent_key(arg)"),
		/Unknown insert key/,
	);
});
