import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { advanceRun } from "../core/run-core.js";
import {
	type AcceptedConflictRow,
	appendAcceptedConflictContent,
	verifyChange,
} from "../lib/spec-verify.js";
import type { LocalRunState, RunState } from "../types/contracts.js";
import { testWorkflowDefinition } from "./helpers/workflow.js";

const NOW = "2026-04-17T13:30:00Z";

function seedStateAt(
	phase: string,
	overrides: Partial<RunState> = {},
): RunState {
	return {
		run_id: "spec-verify-integration-1",
		change_name: "spec-verify-integration",
		current_phase: phase,
		status: "active",
		allowed_events: [],
		source: null,
		agents: { main: "claude", review: "codex" },
		created_at: NOW,
		updated_at: NOW,
		history: [],
		previous_run_id: null,
		project_id: "test/repo",
		repo_name: "test/repo",
		repo_path: "/tmp/test",
		branch_name: "main",
		worktree_path: "/tmp/test",
		last_summary_path: null,
		...overrides,
	};
}

test("advanceRun happy path: spec_validate → spec_verify → spec_ready via spec_validated + spec_verified", () => {
	const afterValidate = advanceRun<LocalRunState>(
		{
			state: seedStateAt("spec_validate"),
			event: "spec_validated",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(afterValidate.ok, true);
	if (!afterValidate.ok) return;
	assert.equal(afterValidate.value.state.current_phase, "spec_verify");

	const afterVerify = advanceRun<LocalRunState>(
		{
			state: afterValidate.value.state,
			event: "spec_verified",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(afterVerify.ok, true);
	if (!afterVerify.ok) return;
	assert.equal(afterVerify.value.state.current_phase, "spec_ready");
	const events = afterVerify.value.state.history.map((h) => h.event);
	assert.deepEqual(events, ["spec_validated", "spec_verified"]);
});

test("advanceRun back-edge: spec_verify → spec_draft via revise_spec", () => {
	const afterRevise = advanceRun<LocalRunState>(
		{
			state: seedStateAt("spec_verify"),
			event: "revise_spec",
			nowIso: NOW,
			priorRecords: [],
		},
		{ workflow: testWorkflowDefinition },
	);
	assert.equal(afterRevise.ok, true);
	if (!afterRevise.ok) return;
	assert.equal(afterRevise.value.state.current_phase, "spec_draft");
});

test("accept-as-is flow: verify + append produces design.md with a correctly shaped table", () => {
	// Set up a minimal fixture change with a single Modified Capability and
	// a baseline whose clause is incompatible with the delta's clause.
	const repoRoot = mkdtempSync(join(tmpdir(), "spec-verify-int-"));
	const changeId = "example-change";
	mkdirSync(join(repoRoot, "openspec", "changes"), { recursive: true });
	mkdirSync(join(repoRoot, "openspec", "specs"), { recursive: true });

	const proposalPath = join(
		repoRoot,
		"openspec",
		"changes",
		changeId,
		"proposal.md",
	);
	mkdirSync(join(repoRoot, "openspec", "changes", changeId), {
		recursive: true,
	});
	writeFileSync(
		proposalPath,
		"## Capabilities\n\n### Modified Capabilities\n- `alpha`: tightening\n\n## Impact\n",
		"utf8",
	);
	mkdirSync(join(repoRoot, "openspec", "specs", "alpha"), {
		recursive: true,
	});
	writeFileSync(
		join(repoRoot, "openspec", "specs", "alpha", "spec.md"),
		"# alpha\n\n## Requirements\n\n### Requirement: Alpha clause\n\nThe system SHALL respond asynchronously.\n\n#### Scenario: s\n- **WHEN** x\n- **THEN** y\n",
		"utf8",
	);
	mkdirSync(join(repoRoot, "openspec", "changes", changeId, "specs", "alpha"), {
		recursive: true,
	});
	writeFileSync(
		join(
			repoRoot,
			"openspec",
			"changes",
			changeId,
			"specs",
			"alpha",
			"spec.md",
		),
		"## MODIFIED Requirements\n\n### Requirement: Alpha clause\n\nThe system SHALL respond synchronously.\n\n#### Scenario: s\n- **WHEN** x\n- **THEN** y now synchronous\n",
		"utf8",
	);

	const result = verifyChange(repoRoot, changeId);
	assert.equal(result.ok, true);
	const pairing = result.report.pairings.find((p) =>
		p.delta_anchor.startsWith("Requirement:"),
	);
	assert.ok(pairing);

	// Simulate the user selecting "accept-as-is" for this pairing.
	const row: AcceptedConflictRow = {
		capability: pairing?.capability ?? "",
		delta_clause: `${pairing?.delta_path}#${pairing?.delta_anchor}`,
		baseline_clause: `${pairing?.baseline_path}#${pairing?.baseline_anchor}`,
		rationale: "sync vs async is intentional for this use case",
		accepted_at: NOW,
	};
	const first = appendAcceptedConflictContent(undefined, row);
	const designPath = join(
		repoRoot,
		"openspec",
		"changes",
		changeId,
		"design.md",
	);
	writeFileSync(designPath, first.updatedContent, "utf8");

	const designContent = readFileSync(designPath, "utf8");
	assert.ok(designContent.includes("## Accepted Spec Conflicts"));
	assert.ok(
		designContent.includes(
			"| id | capability | delta_clause | baseline_clause | rationale | accepted_at |",
		),
	);
	assert.ok(designContent.includes("| AC1 |"));
	assert.ok(designContent.includes("alpha"));
	// Row count: header + divider + one data row = three | lines.
	const tableLines = designContent
		.split("\n")
		.filter((l) => l.trim().startsWith("|"));
	assert.equal(tableLines.length, 3);
});
