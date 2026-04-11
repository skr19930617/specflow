import assert from "node:assert/strict";
import test from "node:test";
import {
	renderClaudeMd,
	renderClaudeMdStrict,
} from "../lib/claude-renderer.js";
import type { ProfileSchema } from "../lib/profile-schema.js";

const sampleProfile: ProfileSchema = {
	schemaVersion: "1",
	languages: ["typescript"],
	toolchain: "npm",
	commands: {
		build: "npm run build",
		test: "npm test",
		lint: "npm run lint",
		format: "npm run format",
	},
	directories: {
		source: ["src/"],
		test: ["tests/"],
		generated: ["dist/"],
	},
	forbiddenEditZones: null,
	contractSensitiveModules: ["src/contracts/**"],
	codingConventions: ["Keep contracts explicit."],
	verificationExpectations: ["npm test"],
};

test("renderClaudeMd preserves unmanaged content on both sides of the managed block", () => {
	const existing = [
		"# Repository Notes",
		"",
		"Keep this preface.",
		"",
		"<!-- specflow:managed:start -->",
		"## Contract Discipline",
		"",
		"- stale rule",
		"<!-- specflow:managed:end -->",
		"",
		"## Manual Notes",
		"",
		"keep me",
		"",
	].join("\n");

	const result = renderClaudeMd(sampleProfile, existing);

	assert.equal(result.writeDisposition, "safe-write");
	assert.equal(result.warning, null);
	assert.ok(result.nextContent.includes("## Project Profile"));
	assert.ok(
		result.nextContent.startsWith(
			"# Repository Notes\n\nKeep this preface.\n\n",
		),
	);
	assert.ok(result.nextContent.includes("## Manual Notes\n\nkeep me\n"));
	assert.ok(
		result.nextContent.indexOf("# Repository Notes") <
			result.nextContent.indexOf("<!-- specflow:managed:start -->"),
	);
	assert.ok(
		result.nextContent.indexOf("## Manual Notes") >
			result.nextContent.indexOf("<!-- specflow:managed:end -->"),
	);
});

test("renderClaudeMdStrict aborts on marker anomalies", () => {
	const existing = [
		"<!-- specflow:managed:start -->",
		"managed",
		"<!-- specflow:managed:end -->",
		"<!-- specflow:managed:end -->",
	].join("\n");

	const result = renderClaudeMdStrict(sampleProfile, existing);

	assert.equal(result.writeDisposition, "abort");
	assert.match(result.warning ?? "", /marker anomaly/i);
	assert.equal(result.nextContent, existing);
});

test("renderClaudeMdStrict aborts on profile schema version mismatch", () => {
	const result = renderClaudeMdStrict(
		{ ...sampleProfile, schemaVersion: "2" },
		"<!-- specflow:managed:start -->\nold\n<!-- specflow:managed:end -->\n",
	);

	assert.equal(result.writeDisposition, "abort");
	assert.match(result.warning ?? "", /schemaVersion "2"/);
});
