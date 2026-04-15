import assert from "node:assert/strict";
import test from "node:test";
import { validatePlanningHeadings } from "../lib/design-planning-validation.js";

const ALL_HEADINGS_DESIGN = `## Context

Some context here.

## Goals / Non-Goals

Goals and non-goals.

## Concerns

User-facing concerns.

## State / Lifecycle

Canonical state.

## Contracts / Interfaces

Layer interfaces.

## Persistence / Ownership

Data ownership.

## Integration Points

External systems.

## Ordering / Dependency Notes

Foundation concerns.

## Completion Conditions

Observable artifacts.

## Decisions

Key decisions.
`;

test("design with all planning sections passes validation", () => {
	const result = validatePlanningHeadings(ALL_HEADINGS_DESIGN);
	assert.equal(result.valid, true);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.empty, []);
});

test("design missing a heading reports it in missing list", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, ["Concerns"]);
	assert.deepEqual(result.empty, []);
});

test("design missing multiple headings reports all in missing list", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"",
	).replace("## Integration Points\n\nExternal systems.\n", "");
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, ["Concerns", "Integration Points"]);
	assert.deepEqual(result.empty, []);
});

test("design with empty section reports it in empty list", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"## Concerns\n\n",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.empty, ["Concerns"]);
});

test("design with whitespace-only section is treated as empty", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"## Concerns\n\n   \n  \n",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.empty, ["Concerns"]);
});

test("N/A with justification is valid non-empty content", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"## Concerns\n\nN/A — this is a pure refactoring change with no user-facing concerns.\n",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, true);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.empty, []);
});

test("bare N/A is valid non-empty content", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"## Concerns\n\nN/A\n",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, true);
});

test("case-insensitive heading matching works", () => {
	const design = ALL_HEADINGS_DESIGN.replace("## Concerns", "## concerns");
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, true);
});

test("heading with additional words matches", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns",
		"## Concerns and Vertical Slices",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, true);
});

test("heading with prefix words does not match", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Integration Points",
		"## External Integration Points and Dependencies",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, ["Integration Points"]);
});

test("heading 'No Concerns Here' does not false-positive match 'Concerns'", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns",
		"## No Concerns Here",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.ok(result.missing.includes("Concerns"));
});

test("completely empty design reports all headings as missing", () => {
	const result = validatePlanningHeadings("");
	assert.equal(result.valid, false);
	assert.equal(result.missing.length, 7);
	assert.deepEqual(result.empty, []);
});

test("substring heading does not false-positive match", () => {
	// "Reordering / Dependency Notes" should NOT match "Ordering / Dependency Notes"
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Ordering / Dependency Notes",
		"## Reordering / Dependency Notes",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, ["Ordering / Dependency Notes"]);
});

test("heading that is only tangentially related does not match", () => {
	// "No Concerns Here" should NOT match "Concerns" — "Concerns" is a substring
	// but not at a word boundary start that matches the required heading
	const design = ALL_HEADINGS_DESIGN.replace("## Concerns", "## NoConcerns");
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.ok(result.missing.includes("Concerns"));
});

test("hyphenated heading does not false-positive match", () => {
	// "Concerns-Extended" should NOT match "Concerns" — hyphen creates a
	// compound word, not a suffix-word separation (R1-F01 edge case)
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns",
		"## Concerns-Extended",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.ok(result.missing.includes("Concerns"));
});

test("design with both missing and empty sections", () => {
	const design = ALL_HEADINGS_DESIGN.replace(
		"## Concerns\n\nUser-facing concerns.\n",
		"",
	).replace(
		"## Integration Points\n\nExternal systems.\n",
		"## Integration Points\n\n",
	);
	const result = validatePlanningHeadings(design);
	assert.equal(result.valid, false);
	assert.deepEqual(result.missing, ["Concerns"]);
	assert.deepEqual(result.empty, ["Integration Points"]);
});
