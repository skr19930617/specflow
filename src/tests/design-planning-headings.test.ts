import assert from "node:assert/strict";
import test from "node:test";
import {
	PLANNING_HEADING_DESCRIPTIONS,
	PLANNING_HEADINGS,
	type PlanningHeadingName,
} from "../lib/design-planning-headings.js";

test("PLANNING_HEADINGS contains exactly 7 entries", () => {
	assert.equal(PLANNING_HEADINGS.length, 7);
});

test("PLANNING_HEADINGS contains the expected names", () => {
	const expected = [
		"Concerns",
		"State / Lifecycle",
		"Contracts / Interfaces",
		"Persistence / Ownership",
		"Integration Points",
		"Ordering / Dependency Notes",
		"Completion Conditions",
	];
	assert.deepEqual([...PLANNING_HEADINGS], expected);
});

test("PLANNING_HEADINGS is readonly (frozen array)", () => {
	// Attempting to push should throw at runtime due to 'as const'
	const headings = PLANNING_HEADINGS as unknown as string[];
	assert.throws(() => {
		headings.push("Extra");
	});
});

test("PLANNING_HEADING_DESCRIPTIONS has an entry for every heading", () => {
	for (const heading of PLANNING_HEADINGS) {
		assert.ok(
			typeof PLANNING_HEADING_DESCRIPTIONS[heading] === "string",
			`Missing description for "${heading}"`,
		);
		assert.ok(
			PLANNING_HEADING_DESCRIPTIONS[heading].length > 0,
			`Empty description for "${heading}"`,
		);
	}
});

test("PLANNING_HEADING_DESCRIPTIONS has no extra keys", () => {
	const descKeys = Object.keys(PLANNING_HEADING_DESCRIPTIONS);
	assert.equal(descKeys.length, PLANNING_HEADINGS.length);
	for (const key of descKeys) {
		assert.ok(
			(PLANNING_HEADINGS as readonly string[]).includes(key),
			`Unexpected key "${key}" in descriptions`,
		);
	}
});

test("PlanningHeadingName type matches heading values", () => {
	// Type-level test: this assignment must compile
	const name: PlanningHeadingName = PLANNING_HEADINGS[0];
	assert.equal(name, "Concerns");
});
