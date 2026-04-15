// Severity-aware handoff tests — verify the gate-truth rule for the apply
// and design review renderer (current-phase.md "Next Recommended Action").
//
// Contract under test: `review-orchestration` Requirement "Review handoff
// state SHALL be derived from HIGH+ unresolved finding count". LOW/MEDIUM
// findings never block the primary handoff; CRITICAL + HIGH do.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderCurrentPhase } from "../lib/review-runtime.js";
import type { ReviewFinding, ReviewLedger } from "../types/contracts.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function makeLedger(
	phase: "impl" | "design",
	findings: readonly ReviewFinding[],
): ReviewLedger {
	return {
		feature_id: "test-change",
		phase,
		current_round: 1,
		status: "in_progress",
		max_finding_id: findings.length,
		findings: [...findings],
		round_summaries: [],
	};
}

function finding(
	id: string,
	severity: ReviewFinding["severity"],
	status: ReviewFinding["status"],
	title = `${severity} finding ${id}`,
): ReviewFinding {
	return {
		id,
		severity,
		status,
		title,
		category: "severity-gate-test",
		file: "src/example.ts",
		detail: "severity-aware gate test finding",
	};
}

function readCurrentPhase(changeDir: string): string {
	return readFileSync(join(changeDir, "current-phase.md"), "utf8");
}

function setup(tempRoot: string): string {
	const changeDir = join(tempRoot, "change");
	mkdirSync(changeDir, { recursive: true });
	return changeDir;
}

test("apply renderer picks /specflow.approve when HIGH+ unresolved = 0 and only LOW remain", () => {
	const tempRoot = makeTempDir("severity-aware-low-apply-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("impl", [
			finding("L1", "low", "open"),
			finding("L2", "low", "new"),
			finding("M1", "medium", "open"),
		]);
		renderCurrentPhase(changeDir, ledger, "apply", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.approve/);
		assert.match(text, /Open High\/Critical Findings: 0 件/);
		assert.match(text, /Actionable Findings: 3/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("apply renderer picks /specflow.fix_apply when a single HIGH remains alongside LOW", () => {
	const tempRoot = makeTempDir("severity-aware-high-apply-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("impl", [
			finding("H1", "high", "open"),
			finding("L1", "low", "open"),
			finding("L2", "low", "new"),
		]);
		renderCurrentPhase(changeDir, ledger, "apply", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.fix_apply/);
		assert.match(text, /Open High\/Critical Findings: 1 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("apply renderer picks /specflow.fix_apply when a CRITICAL remains (gate covers critical too)", () => {
	const tempRoot = makeTempDir("severity-aware-critical-apply-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("impl", [
			finding("C1", "critical", "new"),
			finding("L1", "low", "open"),
		]);
		renderCurrentPhase(changeDir, ledger, "apply", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.fix_apply/);
		assert.match(text, /Open High\/Critical Findings: 1 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("apply renderer picks /specflow.approve when only MEDIUM findings remain", () => {
	const tempRoot = makeTempDir("severity-aware-medium-apply-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("impl", [
			finding("M1", "medium", "open"),
			finding("M2", "medium", "new"),
			finding("M3", "medium", "open"),
		]);
		renderCurrentPhase(changeDir, ledger, "apply", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.approve/);
		assert.match(text, /Open High\/Critical Findings: 0 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("design renderer picks /specflow.apply when HIGH+ unresolved = 0 and only LOW remain", () => {
	const tempRoot = makeTempDir("severity-aware-low-design-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("design", [finding("L1", "low", "open")]);
		renderCurrentPhase(changeDir, ledger, "design", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.apply/);
		assert.match(text, /Open High\/Critical Findings: 0 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("design renderer picks /specflow.fix_design when HIGH unresolved exists", () => {
	const tempRoot = makeTempDir("severity-aware-high-design-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("design", [
			finding("H1", "high", "new"),
			finding("M1", "medium", "open"),
		]);
		renderCurrentPhase(changeDir, ledger, "design", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.fix_design/);
		assert.match(text, /Open High\/Critical Findings: 1 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});

test("accepted_risk HIGH findings do NOT count toward the renderer gate", () => {
	// Per unresolvedCriticalHighCount contract: status `accepted_risk` is not
	// "new" or "open" and therefore does not block approve. (Ledger status
	// `has_open_high` is separately computed and retains those findings for
	// Approve Quality Gate WARNING; see computeStatus.)
	const tempRoot = makeTempDir("severity-aware-accepted-risk-");
	try {
		const changeDir = setup(tempRoot);
		const ledger = makeLedger("impl", [
			finding("H1", "high", "accepted_risk"),
			finding("L1", "low", "open"),
		]);
		renderCurrentPhase(changeDir, ledger, "apply", tempRoot);
		const text = readCurrentPhase(changeDir);
		assert.match(text, /Next Recommended Action: \/specflow\.approve/);
		// The HIGH finding is accepted_risk so the "Open High/Critical Findings"
		// line (which is open/new only) reports 0 — the renderer's responsibility.
		assert.match(text, /Open High\/Critical Findings: 0 件/);
	} finally {
		removeTempDir(tempRoot);
	}
});
