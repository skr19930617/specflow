import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenspecPrereq } from "../contracts/prerequisites.js";

test("buildOpenspecPrereq includes the command-based probe", () => {
	const body = buildOpenspecPrereq("specflow.apply");
	assert.ok(
		body.includes("openspec list --json > /dev/null 2>&1"),
		"probe invocation must be present",
	);
});

test("buildOpenspecPrereq documents both failure branches", () => {
	const body = buildOpenspecPrereq("specflow.apply");
	assert.ok(
		body.includes("❌ openspec CLI が見つかりません。"),
		"missing CLI header must be present",
	);
	assert.ok(
		body.includes("❌ OpenSpec が初期化されていません。"),
		"uninitialized workspace header must be present",
	);
	assert.ok(
		body.includes("specflow-install"),
		"specflow-install remediation must be present",
	);
	assert.ok(
		body.includes("specflow-init"),
		"specflow-init remediation must be present",
	);
});

test("buildOpenspecPrereq distinguishes exit 127 from other non-zero", () => {
	const body = buildOpenspecPrereq("specflow.apply");
	assert.ok(
		body.includes("If exit 127 (command not found)"),
		"exit 127 branch must be labeled",
	);
	assert.ok(
		body.includes("If any other non-zero exit"),
		"other non-zero branch must be labeled",
	);
});

test("buildOpenspecPrereq interpolates the command name into the retry line", () => {
	const body = buildOpenspecPrereq("specflow.fix_apply");
	// Both failure branches reference the command name exactly twice.
	const matches = body.match(/`\/specflow\.fix_apply` を再実行してください/g);
	assert.equal(matches?.length, 2, "retry line must appear in both branches");
});

test("buildOpenspecPrereq never emits legacy probe or config.yaml guidance", () => {
	const body = buildOpenspecPrereq("specflow");
	assert.ok(!body.includes("ls openspec/"), "legacy probe must not appear");
	assert.ok(
		!body.includes("openspec/config.yaml を作成"),
		"hand-create config.yaml guidance must not appear",
	);
});

test("buildOpenspecPrereq is deterministic for the same input", () => {
	const first = buildOpenspecPrereq("specflow.design");
	const second = buildOpenspecPrereq("specflow.design");
	assert.equal(first, second, "helper output must be deterministic");
});

test("buildOpenspecPrereq starts with a leading newline and single numbered step", () => {
	const body = buildOpenspecPrereq("specflow.spec");
	assert.ok(
		body.startsWith("\n1. "),
		"output must start with a leading newline and item 1",
	);
	// Ensure no "2." at the top level (callers add their own subsequent items).
	assert.ok(
		!/^\n2\./m.test(body),
		"helper output must not contain a top-level item 2",
	);
});
