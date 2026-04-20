// Tolerant artifact readers for `specflow-watch`.
//
// Every reader returns a tagged result so the renderer can distinguish
// "source does not exist yet" (placeholder) from "source exists but is
// malformed" (inline warning). Required-source failures are reported the
// same way; the CLI adapter decides which ones are fatal.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AutofixProgressSnapshot } from "../../types/autofix-progress.js";
import { validateAutofixSnapshot } from "../../types/autofix-progress.js";
import type { RunState } from "../../types/contracts.js";
import type { TaskGraph } from "../task-planner/index.js";
import { validateTaskGraph } from "../task-planner/index.js";

import { parseRunJson } from "./run-scan.js";

/** Generic read result shape. */
export type ArtifactReadResult<T> =
	| { readonly kind: "ok"; readonly value: T }
	| { readonly kind: "absent" }
	| { readonly kind: "unreadable"; readonly reason: string }
	| { readonly kind: "malformed"; readonly reason: string };

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

export function runStatePath(projectRoot: string, runId: string): string {
	return join(projectRoot, ".specflow/runs", runId, "run.json");
}

export function readRunStateFile(
	projectRoot: string,
	runId: string,
): ArtifactReadResult<RunState> {
	const path = runStatePath(projectRoot, runId);
	if (!existsSync(path)) return { kind: "absent" };
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (err) {
		return {
			kind: "unreadable",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	const parsed = parseRunJson(raw);
	if (parsed === null) {
		return { kind: "malformed", reason: "run.json is not valid RunState" };
	}
	return { kind: "ok", value: parsed };
}

// ---------------------------------------------------------------------------
// Autofix progress snapshot (per review phase)
// ---------------------------------------------------------------------------

export type AutofixReviewPhase = "design_review" | "apply_review";

export function autofixSnapshotPath(
	projectRoot: string,
	runId: string,
	phase: AutofixReviewPhase,
): string {
	return join(
		projectRoot,
		".specflow/runs",
		runId,
		`autofix-progress-${phase}.json`,
	);
}

export function readAutofixSnapshotFile(
	projectRoot: string,
	runId: string,
	phase: AutofixReviewPhase,
): ArtifactReadResult<AutofixProgressSnapshot> {
	const path = autofixSnapshotPath(projectRoot, runId, phase);
	if (!existsSync(path)) return { kind: "absent" };
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (err) {
		return {
			kind: "unreadable",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return {
			kind: "malformed",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	const errs = validateAutofixSnapshot(parsed);
	if (errs.length > 0) {
		return {
			kind: "malformed",
			reason: errs.map((e) => `${e.field}: ${e.message}`).join("; "),
		};
	}
	return { kind: "ok", value: parsed as AutofixProgressSnapshot };
}

/**
 * Deterministic rule for which autofix snapshot to render, keyed by the run's
 * `current_phase`. Phases are grouped by review family so the TUI can keep
 * the most recent snapshot visible across adjacent drafting / ready / approved
 * states. Non-review families (`proposal_*`, `spec_*`, etc.) yield `null`.
 */
export function selectActiveAutofixPhase(
	currentPhase: string,
): AutofixReviewPhase | null {
	switch (currentPhase) {
		case "design_draft":
		case "design_review":
		case "design_ready":
			return "design_review";
		case "apply_draft":
		case "apply_review":
		case "apply_ready":
		case "approved":
			return "apply_review";
		default:
			return null;
	}
}

/** True when the run's `current_phase` is itself a live review gate. */
export function phaseIsLiveReviewGate(currentPhase: string): boolean {
	return currentPhase === "design_review" || currentPhase === "apply_review";
}

// ---------------------------------------------------------------------------
// Task graph (per change)
// ---------------------------------------------------------------------------

export function taskGraphPath(projectRoot: string, changeName: string): string {
	return join(projectRoot, "openspec/changes", changeName, "task-graph.json");
}

// ---------------------------------------------------------------------------
// Approval summary (per run — resolved from run.last_summary_path)
// ---------------------------------------------------------------------------

export interface ApprovalSummaryExtract {
	readonly status_line: string | null;
	readonly diffstat_line: string | null;
}

/**
 * Resolve the absolute path for `run.last_summary_path`. Absolute inputs are
 * returned unchanged; relative inputs are joined against `projectRoot`.
 */
export function approvalSummaryPath(
	projectRoot: string,
	lastSummaryPath: string,
): string {
	if (lastSummaryPath.startsWith("/")) return lastSummaryPath;
	return join(projectRoot, lastSummaryPath);
}

const STATUS_LINE_REGEX = /^Status:\s.*$/m;
const DIFFSTAT_LINE_REGEX =
	/(^|\n)\s*(\d+\s+files?\s+changed(?:,\s*\d+\s+insertions?\(\+\))?(?:,\s*\d+\s+deletions?\(-\))?)\s*(\n|$)/;

function extractWhatChangedSection(md: string): string {
	const match = /^##\s+What Changed\s*$/m.exec(md);
	if (!match) return "";
	const startIdx = match.index + match[0].length;
	const tail = md.slice(startIdx);
	const nextHeading = /^##\s+/m.exec(tail);
	return nextHeading ? tail.slice(0, nextHeading.index) : tail;
}

function extractApprovalSummary(md: string): ApprovalSummaryExtract {
	const statusMatch = STATUS_LINE_REGEX.exec(md);
	const status_line = statusMatch ? statusMatch[0].trim() : null;
	const whatChanged = extractWhatChangedSection(md);
	let diffstat_line: string | null = null;
	if (whatChanged) {
		const diffMatch = DIFFSTAT_LINE_REGEX.exec(whatChanged);
		diffstat_line = diffMatch ? diffMatch[2].trim() : null;
	}
	return { status_line, diffstat_line };
}

/**
 * Read `approval-summary.md` referenced by `run.last_summary_path`. Returns:
 * - `absent` when `last_summary_path` is null/empty (no approval recorded);
 * - `unreadable` with `reason: "missing"` when `last_summary_path` is set but
 *   the file does not exist — the renderer surfaces this as the
 *   `Approval summary missing` warning per the spec's degradation contract;
 * - `unreadable` for other I/O errors;
 * - `ok` with a tagged extract that may have null `status_line` or
 *   `diffstat_line` when the markdown is partial.
 */
export function readApprovalSummary(
	projectRoot: string,
	run: { readonly last_summary_path?: string | null },
): ArtifactReadResult<ApprovalSummaryExtract> {
	const raw = run.last_summary_path;
	if (!raw) return { kind: "absent" };
	const path = approvalSummaryPath(projectRoot, raw);
	if (!existsSync(path)) return { kind: "unreadable", reason: "missing" };
	let md: string;
	try {
		md = readFileSync(path, "utf8");
	} catch (err) {
		return {
			kind: "unreadable",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	return { kind: "ok", value: extractApprovalSummary(md) };
}

export function readTaskGraphFile(
	projectRoot: string,
	changeName: string,
): ArtifactReadResult<TaskGraph> {
	const path = taskGraphPath(projectRoot, changeName);
	if (!existsSync(path)) return { kind: "absent" };
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (err) {
		return {
			kind: "unreadable",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return {
			kind: "malformed",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
	const result = validateTaskGraph(parsed);
	if (!result.valid) {
		return {
			kind: "malformed",
			reason: result.errors.join("; "),
		};
	}
	return { kind: "ok", value: parsed as TaskGraph };
}
