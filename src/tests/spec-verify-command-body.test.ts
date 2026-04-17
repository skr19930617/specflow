import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const GENERATED_SPECFLOW_MD = "dist/package/global/commands/specflow.md";

test("generated specflow.md includes Step 8.5 Spec Verify header", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(body.includes("## Step 8.5: Spec Verify"));
});

test("generated specflow.md names the spec-verify CLI invocation literally", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(body.includes('specflow-spec-verify "<CHANGE_ID>" --json'));
});

test("generated specflow.md documents the four conflict outcomes", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	for (const phrase of [
		"fix delta",
		"fix baseline",
		"fix both",
		"accept-as-is",
	]) {
		assert.ok(
			body.includes(phrase),
			`generated specflow.md is missing "${phrase}" outcome`,
		);
	}
});

test("generated specflow.md documents the six-column accepted-conflicts schema", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(
		body.includes(
			"| id | capability | delta_clause | baseline_clause | rationale | accepted_at |",
		),
	);
});

test("generated specflow.md advances the run with spec_verified and revise_spec", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(body.includes('specflow-run advance "<RUN_ID>" spec_verified'));
	assert.ok(body.includes('specflow-run advance "<RUN_ID>" revise_spec'));
});

test("generated specflow.md documents the empty-capabilities short-circuit", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(body.includes("no_modified_capabilities"));
});

test("generated specflow.md refuses to offer /specflow.design from spec_verify", () => {
	const body = readFileSync(GENERATED_SPECFLOW_MD, "utf8");
	assert.ok(
		body.includes("or `spec_verify`") ||
			body.includes(", or spec_verify") ||
			body.includes("spec_verify`"),
	);
});
