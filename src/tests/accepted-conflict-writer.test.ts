import assert from "node:assert/strict";
import test from "node:test";
import {
	type AcceptedConflictRow,
	appendAcceptedConflictContent,
} from "../lib/spec-verify.js";

const SAMPLE_ROW: AcceptedConflictRow = {
	capability: "workflow-run-state",
	delta_clause: "specs/workflow-run-state/spec.md#Requirement: Phase graph",
	baseline_clause:
		"openspec/specs/workflow-run-state/spec.md#Requirement: Phase graph",
	rationale: "Version bump rolls forward; older spec text is stale.",
	accepted_at: "2026-04-17T12:34:56Z",
};

test("appendAcceptedConflictContent creates the section when design.md is empty", () => {
	const { id, updatedContent } = appendAcceptedConflictContent(
		undefined,
		SAMPLE_ROW,
	);
	assert.equal(id, "AC1");
	assert.ok(updatedContent.includes("## Accepted Spec Conflicts"));
	assert.ok(
		updatedContent.includes(
			"| id | capability | delta_clause | baseline_clause | rationale | accepted_at |",
		),
	);
	assert.ok(updatedContent.includes("| AC1 |"));
	assert.ok(updatedContent.includes("workflow-run-state"));
});

test("appendAcceptedConflictContent preserves existing sections in design.md", () => {
	const existing = `## Context\n\nbackground prose.\n\n## Decisions\n\n- D1\n`;
	const { id, updatedContent } = appendAcceptedConflictContent(
		existing,
		SAMPLE_ROW,
	);
	assert.equal(id, "AC1");
	assert.ok(updatedContent.startsWith("## Context\n"));
	assert.ok(updatedContent.includes("## Decisions"));
	assert.ok(updatedContent.includes("## Accepted Spec Conflicts"));
	assert.ok(updatedContent.includes("| AC1 |"));
});

test("appendAcceptedConflictContent appends rows with monotonically increasing ids", () => {
	const { updatedContent: firstPass } = appendAcceptedConflictContent(
		undefined,
		SAMPLE_ROW,
	);
	const { id, updatedContent } = appendAcceptedConflictContent(firstPass, {
		...SAMPLE_ROW,
		rationale: "Another accepted divergence",
	});
	assert.equal(id, "AC2");
	// Header should appear only once.
	const occurrences =
		updatedContent.split("## Accepted Spec Conflicts").length - 1;
	assert.equal(occurrences, 1);
	assert.ok(updatedContent.includes("| AC1 |"));
	assert.ok(updatedContent.includes("| AC2 |"));
});

test("appendAcceptedConflictContent escapes pipes in cell values", () => {
	const { updatedContent } = appendAcceptedConflictContent(undefined, {
		...SAMPLE_ROW,
		rationale: "keeps | pipes | escaped",
	});
	assert.ok(updatedContent.includes("keeps \\| pipes \\| escaped"));
});

test("appendAcceptedConflictContent does not modify content outside the accepted section", () => {
	const existing = `## Context\n\nIMPORTANT INVARIANT CONTENT\n\n## Accepted Spec Conflicts\n\n| id | capability | delta_clause | baseline_clause | rationale | accepted_at |\n| --- | --- | --- | --- | --- | --- |\n| AC1 | old | d | b | r | 2026-01-01T00:00:00Z |\n\n## Risks\n\nRisk prose preserved.\n`;
	const { id, updatedContent } = appendAcceptedConflictContent(
		existing,
		SAMPLE_ROW,
	);
	assert.equal(id, "AC2");
	assert.ok(updatedContent.includes("IMPORTANT INVARIANT CONTENT"));
	assert.ok(updatedContent.includes("Risk prose preserved."));
	assert.ok(updatedContent.includes("| AC1 | old |"));
	assert.ok(updatedContent.includes("| AC2 |"));
});
