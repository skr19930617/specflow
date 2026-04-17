import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PhaseContract } from "../contracts/phase-contract.js";
import { resolveTemplate } from "../contracts/template-resolver.js";

function tmpTemplate(content: string): string {
	const dir = mkdtempSync(join(tmpdir(), "tmpl-test-"));
	const path = join(dir, "test.md.tmpl");
	writeFileSync(path, content, "utf8");
	return path;
}

const mockInserts = new Map<string, (arg?: string) => string>([
	["greeting", (arg?: string) => `Hello ${arg ?? "world"}`],
	["static_text", () => "This is static text."],
]);

const mockPhases = new Map<string, PhaseContract>([
	[
		"test_phase",
		{
			id: "test_phase",
			entryEvents: ["start"],
			exitEvents: ["done"],
			requiredInputs: [],
			producedOutputs: [],
			cliCommands: [],
			agentTasks: [],
			gateConditions: [],
		} as unknown as PhaseContract,
	],
]);

// ---------------------------------------------------------------------------
// Basic tag resolution
// ---------------------------------------------------------------------------

test("resolves {{insert: key}} tag", () => {
	const path = tmpTemplate("Before {{insert: static_text}} After");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.equal(result.sections.length, 1);
	assert.ok(result.sections[0].content.includes("This is static text."));
});

test("resolves {{insert: key(arg)}} tag with argument", () => {
	const path = tmpTemplate("{{insert: greeting(Claude)}}");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.ok(result.sections[0].content.includes("Hello Claude"));
});

test("resolves {{contract: phase}} tag to JSON", () => {
	const path = tmpTemplate("{{contract: test_phase}}");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.ok(result.sections[0].content.includes('"id": "test_phase"'));
});

test("resolves {{render: phase}} tag", () => {
	const path = tmpTemplate("{{render: test_phase}}");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	// renderPhaseMarkdown returns empty for minimal contracts, which is ok
	assert.ok(result.sections.length >= 1);
});

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

test("splits by ## headings into sections", () => {
	const path = tmpTemplate("## First\n\nContent 1\n\n## Second\n\nContent 2");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.equal(result.sections.length, 2);
	assert.equal(result.sections[0].title, "First");
	assert.ok(result.sections[0].content.includes("Content 1"));
	assert.equal(result.sections[1].title, "Second");
	assert.ok(result.sections[1].content.includes("Content 2"));
});

test("content before first heading becomes null-title section", () => {
	const path = tmpTemplate("Preamble\n\n## Section\n\nBody");
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.equal(result.sections.length, 2);
	assert.equal(result.sections[0].title, null);
	assert.ok(result.sections[0].content.includes("Preamble"));
	assert.equal(result.sections[1].title, "Section");
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

test("throws on unknown insert key", () => {
	const path = tmpTemplate("{{insert: unknown_key}}");
	assert.throws(
		() => resolveTemplate(path, mockInserts, mockPhases),
		/unknown insert key "unknown_key"/,
	);
});

test("throws on unknown contract phase", () => {
	const path = tmpTemplate("{{contract: nonexistent}}");
	assert.throws(
		() => resolveTemplate(path, mockInserts, mockPhases),
		/unknown phase "nonexistent"/,
	);
});

test("throws on unknown render phase", () => {
	const path = tmpTemplate("{{render: nonexistent}}");
	assert.throws(
		() => resolveTemplate(path, mockInserts, mockPhases),
		/unknown phase "nonexistent"/,
	);
});

test("throws on missing template file", () => {
	assert.throws(
		() =>
			resolveTemplate(
				"/nonexistent/path/test.md.tmpl",
				mockInserts,
				mockPhases,
			),
		/cannot read template file/,
	);
});

test("throws on nested tags in resolved content", () => {
	const nestedInserts = new Map<string, (arg?: string) => string>([
		["nester", () => "Contains {{insert: greeting}} nested"],
	]);
	const path = tmpTemplate("{{insert: nester}}");
	assert.throws(
		() => resolveTemplate(path, nestedInserts, mockPhases),
		/nested insertion tag detected/,
	);
});

// ---------------------------------------------------------------------------
// Multiple tags in one template
// ---------------------------------------------------------------------------

test("resolves multiple tags in one template", () => {
	const path = tmpTemplate(
		"## Prerequisites\n\n{{insert: static_text}}\n\n## Greeting\n\n{{insert: greeting(World)}}",
	);
	const result = resolveTemplate(path, mockInserts, mockPhases);
	assert.equal(result.sections.length, 2);
	assert.ok(result.sections[0].content.includes("This is static text."));
	assert.ok(result.sections[1].content.includes("Hello World"));
});
