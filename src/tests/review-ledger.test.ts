import assert from "node:assert/strict";
import test from "node:test";
import {
	actionableCount,
	severitySummary,
	unresolvedCriticalHighCount,
} from "../lib/review-ledger.js";
import type { ReviewFinding, ReviewLedger } from "../types/contracts.js";

function makeLedger(findings: readonly ReviewFinding[]): ReviewLedger {
	return {
		feature_id: "test-change",
		phase: "impl",
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
): ReviewFinding {
	return {
		id,
		severity,
		status,
		title: `finding ${id}`,
		category: "test",
		file: "src/example.ts",
		detail: "test finding",
	};
}

test("unresolvedCriticalHighCount returns 0 for an empty ledger", () => {
	const ledger = makeLedger([]);
	assert.equal(unresolvedCriticalHighCount(ledger), 0);
});

test("unresolvedCriticalHighCount counts only HIGH findings when CRITICAL absent", () => {
	const ledger = makeLedger([
		finding("F1", "high", "open"),
		finding("F2", "high", "new"),
		finding("F3", "high", "resolved"),
	]);
	assert.equal(unresolvedCriticalHighCount(ledger), 2);
});

test("unresolvedCriticalHighCount counts CRITICAL findings", () => {
	const ledger = makeLedger([
		finding("F1", "critical", "open"),
		finding("F2", "critical", "new"),
		finding("F3", "critical", "resolved"),
	]);
	assert.equal(unresolvedCriticalHighCount(ledger), 2);
});

test("unresolvedCriticalHighCount sums CRITICAL and HIGH together", () => {
	const ledger = makeLedger([
		finding("F1", "critical", "open"),
		finding("F2", "high", "new"),
		finding("F3", "medium", "open"),
		finding("F4", "low", "open"),
	]);
	assert.equal(unresolvedCriticalHighCount(ledger), 2);
});

test("unresolvedCriticalHighCount ignores MEDIUM and LOW entirely", () => {
	const ledger = makeLedger([
		finding("F1", "medium", "open"),
		finding("F2", "low", "new"),
		finding("F3", "low", "open"),
	]);
	assert.equal(unresolvedCriticalHighCount(ledger), 0);
});

test("unresolvedCriticalHighCount ignores accepted_risk and ignored statuses", () => {
	const ledger = makeLedger([
		finding("F1", "high", "accepted_risk"),
		finding("F2", "critical", "ignored"),
		finding("F3", "high", "new"),
	]);
	assert.equal(unresolvedCriticalHighCount(ledger), 1);
});

test("actionableCount is severity-agnostic (baseline regression)", () => {
	const ledger = makeLedger([
		finding("F1", "critical", "open"),
		finding("F2", "high", "new"),
		finding("F3", "medium", "open"),
		finding("F4", "low", "open"),
		finding("F5", "low", "resolved"),
	]);
	// actionableCount intentionally counts every open/new finding regardless
	// of severity. This is the "Remaining Risks" aggregation used by the
	// approval summary; it MUST NOT drift toward severity-awareness.
	assert.equal(actionableCount(ledger), 4);
});

test("severitySummary orders CRITICAL, HIGH, MEDIUM, LOW", () => {
	const ledger = makeLedger([
		finding("F1", "low", "open"),
		finding("F2", "critical", "open"),
		finding("F3", "medium", "new"),
		finding("F4", "high", "open"),
	]);
	assert.equal(
		severitySummary(ledger),
		"CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 1",
	);
});

test("severitySummary excludes resolved and zero severities", () => {
	const ledger = makeLedger([
		finding("F1", "critical", "resolved"),
		finding("F2", "high", "open"),
		finding("F3", "high", "accepted_risk"),
	]);
	assert.equal(severitySummary(ledger), "HIGH: 1");
});
