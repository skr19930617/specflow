import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	parseModifiedCapabilities,
	parseRemovedRequirements,
	parseSpec,
	verifyChange,
} from "../lib/spec-verify.js";

function setupRepo(): { repoRoot: string; changeId: string } {
	const repoRoot = mkdtempSync(join(tmpdir(), "spec-verify-"));
	mkdirSync(join(repoRoot, "openspec", "changes"), { recursive: true });
	mkdirSync(join(repoRoot, "openspec", "specs"), { recursive: true });
	return { repoRoot, changeId: "example-change" };
}

function writeProposal(repoRoot: string, changeId: string, body: string): void {
	const dir = join(repoRoot, "openspec", "changes", changeId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "proposal.md"), body, "utf8");
}

function writeDelta(
	repoRoot: string,
	changeId: string,
	capability: string,
	body: string,
): void {
	const dir = join(
		repoRoot,
		"openspec",
		"changes",
		changeId,
		"specs",
		capability,
	);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "spec.md"), body, "utf8");
}

function writeBaseline(
	repoRoot: string,
	capability: string,
	body: string,
): void {
	const dir = join(repoRoot, "openspec", "specs", capability);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "spec.md"), body, "utf8");
}

// ---------------------------------------------------------------------------
// Parser unit tests
// ---------------------------------------------------------------------------

test("parseModifiedCapabilities extracts kebab-case names", () => {
	const proposal = `## Capabilities\n\n### New Capabilities\n- \`foo-bar\`: new\n\n### Modified Capabilities\n- \`alpha\`: change 1\n- \`beta-gamma\`: change 2\n\n## Impact\n`;
	assert.deepEqual(parseModifiedCapabilities(proposal), [
		"alpha",
		"beta-gamma",
	]);
});

test("parseModifiedCapabilities returns empty when no Modified section", () => {
	const proposal = `## Capabilities\n\n### New Capabilities\n- \`foo\`: new\n\n## Impact\n`;
	assert.deepEqual(parseModifiedCapabilities(proposal), []);
});

test("parseSpec extracts requirements with scenarios", () => {
	const spec = `# baseline\n\n## Requirements\n\n### Requirement: Alpha\n\nThe system SHALL do X.\n\n#### Scenario: first\n- **WHEN** y\n- **THEN** z\n\n### Requirement: Beta\n\nThe system MUST do B.\n\n#### Scenario: b1\n- **WHEN** a\n- **THEN** c\n`;
	const parsed = parseSpec(spec);
	assert.equal(parsed.requirements.length, 2);
	assert.equal(parsed.requirements[0].name, "Alpha");
	assert.equal(parsed.requirements[0].scenarios.length, 1);
	assert.equal(parsed.requirements[0].scenarios[0].name, "first");
});

test("parseRemovedRequirements reads under ## REMOVED Requirements", () => {
	const delta = `## ADDED Requirements\n\n### Requirement: New X\n\nSHALL\n\n## REMOVED Requirements\n\n### Requirement: Legacy Alpha\n### Requirement: Legacy Beta\n`;
	assert.deepEqual(parseRemovedRequirements(delta), [
		"Legacy Alpha",
		"Legacy Beta",
	]);
});

// ---------------------------------------------------------------------------
// End-to-end verify scenarios
// ---------------------------------------------------------------------------

test("verifyChange returns no_modified_capabilities when list is empty", () => {
	const { repoRoot, changeId } = setupRepo();
	writeProposal(
		repoRoot,
		changeId,
		"## Capabilities\n\n### New Capabilities\n- `fresh`: only adds\n\n### Modified Capabilities\n\n## Impact\n",
	);
	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, true);
	assert.equal(result.report.reason, "no_modified_capabilities");
	assert.deepEqual(result.report.pairings, []);
	assert.deepEqual(result.report.ripple_candidates, []);
});

test("verifyChange produces pairings for single-capability happy path", () => {
	const { repoRoot, changeId } = setupRepo();
	writeProposal(
		repoRoot,
		changeId,
		"## Capabilities\n\n### Modified Capabilities\n- `alpha`: tightens clause\n\n## Impact\n",
	);
	writeBaseline(
		repoRoot,
		"alpha",
		"# alpha\n\n## Requirements\n\n### Requirement: Alpha has a clause\n\nThe system SHALL respond within 24 hours.\n\n#### Scenario: responds\n- **WHEN** asked\n- **THEN** answers\n",
	);
	writeDelta(
		repoRoot,
		changeId,
		"alpha",
		"## MODIFIED Requirements\n\n### Requirement: Alpha has a clause\n\nThe system SHALL respond within 30 minutes.\n\n#### Scenario: responds\n- **WHEN** asked\n- **THEN** answers promptly\n",
	);
	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, true);
	assert.ok(result.report.pairings.length >= 1);
	const reqPairing = result.report.pairings.find((p) =>
		p.delta_anchor.startsWith("Requirement:"),
	);
	assert.ok(reqPairing);
	assert.equal(reqPairing?.capability, "alpha");
});

test("verifyChange surfaces REMOVED ripple candidates from other baselines", () => {
	const { repoRoot, changeId } = setupRepo();
	writeProposal(
		repoRoot,
		changeId,
		"## Capabilities\n\n### Modified Capabilities\n- `alpha`: removes clause\n\n## Impact\n",
	);
	writeBaseline(
		repoRoot,
		"alpha",
		"# alpha\n\n## Requirements\n\n### Requirement: Alpha has a clause\n\nSHALL do X.\n\n#### Scenario: s\n- **WHEN** w\n- **THEN** t\n",
	);
	writeBaseline(
		repoRoot,
		"sibling",
		"# sibling\n\n## Requirements\n\n### Requirement: Depends on legacy\n\nThe system SHALL invoke Legacy Alpha before responding.\n\n#### Scenario: s\n- **WHEN** w\n- **THEN** t\n",
	);
	writeDelta(
		repoRoot,
		changeId,
		"alpha",
		"## REMOVED Requirements\n\n### Requirement: Legacy Alpha\n**Reason**: obsolete\n**Migration**: none\n",
	);
	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, true);
	const ripple = result.report.ripple_candidates;
	assert.ok(ripple.length >= 1);
	assert.ok(
		ripple.some((r) => r.baseline_path.includes("sibling")),
		"expected ripple candidate in sibling spec",
	);
});

test("verifyChange blocks on missing baseline with structured error", () => {
	const { repoRoot, changeId } = setupRepo();
	writeProposal(
		repoRoot,
		changeId,
		"## Capabilities\n\n### Modified Capabilities\n- `ghost`: does not exist\n\n## Impact\n",
	);
	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, false);
	assert.equal(result.report.error?.code, "missing_baseline");
	assert.equal(result.report.error?.capability, "ghost");
});

test("verifyChange blocks on unparseable baseline", () => {
	const { repoRoot, changeId } = setupRepo();
	writeProposal(
		repoRoot,
		changeId,
		"## Capabilities\n\n### Modified Capabilities\n- `empty`: baseline exists but is broken\n\n## Impact\n",
	);
	writeBaseline(repoRoot, "empty", "# empty\n\n(no requirements section)\n");
	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, false);
	assert.equal(result.report.error?.code, "unparseable_baseline");
	assert.equal(result.report.error?.capability, "empty");
	assert.ok(result.report.error?.parse_reason);
});
