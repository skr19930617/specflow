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
import type {
	LedgerRoundSummary,
	ReviewFinding,
	ReviewLedger,
	RunState,
} from "../../types/contracts.js";
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
// Review ledger (per change — design / apply families)
// ---------------------------------------------------------------------------

export type ReviewLedgerFamily = "design" | "apply";

export function reviewLedgerPath(
	projectRoot: string,
	changeName: string,
	family: ReviewLedgerFamily,
): string {
	const filename =
		family === "design" ? "review-ledger-design.json" : "review-ledger.json";
	return join(projectRoot, "openspec/changes", changeName, filename);
}

/**
 * Phase-to-ledger-family selector. Mirrors `selectActiveAutofixPhase` so
 * snapshot and digest stay phase-consistent. Returns `null` for non-review
 * families so the caller can render the digest as `hidden`.
 */
export function selectActiveReviewLedger(
	currentPhase: string,
): ReviewLedgerFamily | null {
	switch (currentPhase) {
		case "design_draft":
		case "design_review":
		case "design_ready":
			return "design";
		case "apply_draft":
		case "apply_review":
		case "apply_ready":
		case "approved":
			return "apply";
		default:
			return null;
	}
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateReviewFinding(finding: unknown, index: number): string | null {
	if (!isObject(finding)) return `findings[${index}]: not an object`;
	// Mandatory string fields the digest depends on — reject if missing.
	for (const field of ["id", "title", "severity", "status"] as const) {
		if (!isString(finding[field])) {
			return `findings[${index}].${field}: missing or not a string`;
		}
	}
	// Optional string fields — type-check only when present.
	for (const field of [
		"file",
		"category",
		"detail",
		"relation",
		"notes",
	] as const) {
		if (
			field in finding &&
			!isString(finding[field]) &&
			finding[field] !== null
		) {
			return `findings[${index}].${field}: not a string`;
		}
	}
	for (const field of [
		"origin_round",
		"latest_round",
		"resolved_round",
	] as const) {
		if (field in finding && !isFiniteNumber(finding[field])) {
			return `findings[${index}].${field}: not a number`;
		}
	}
	if (
		"supersedes" in finding &&
		finding.supersedes !== null &&
		!isString(finding.supersedes)
	) {
		return `findings[${index}].supersedes: not string|null`;
	}
	return null;
}

function validateRoundSummary(round: unknown, index: number): string | null {
	if (!isObject(round)) return `round_summaries[${index}]: not an object`;
	for (const field of [
		"round",
		"total",
		"open",
		"new",
		"resolved",
		"overridden",
	] as const) {
		if (!isFiniteNumber(round[field])) {
			return `round_summaries[${index}].${field}: missing or not a number`;
		}
	}
	if (!isObject(round.by_severity)) {
		return `round_summaries[${index}].by_severity: not an object`;
	}
	for (const [k, v] of Object.entries(round.by_severity)) {
		if (!isFiniteNumber(v)) {
			return `round_summaries[${index}].by_severity[${k}]: not a number`;
		}
	}
	for (const field of [
		"decision",
		"proposal_hash",
		"blocking_signature",
	] as const) {
		if (field in round && !isString(round[field])) {
			return `round_summaries[${index}].${field}: not a string`;
		}
	}
	for (const field of [
		"blocking_count",
		"stagnant_rounds",
		"max_rounds",
	] as const) {
		if (field in round && !isFiniteNumber(round[field])) {
			return `round_summaries[${index}].${field}: not a number`;
		}
	}
	if (
		"stop_reason" in round &&
		round.stop_reason !== null &&
		!isString(round.stop_reason)
	) {
		return `round_summaries[${index}].stop_reason: not string|null`;
	}
	if (
		"gate_id" in round &&
		round.gate_id !== null &&
		!isString(round.gate_id)
	) {
		return `round_summaries[${index}].gate_id: not string|null`;
	}
	return null;
}

/**
 * Validates a parsed JSON value against the full `ReviewLedger` contract.
 * Returns a non-empty reason string when the value violates the schema.
 * Side-effect free — does not rename, copy, or back up files.
 */
export function validateReviewLedgerSchema(value: unknown): string | null {
	if (!isObject(value)) return "ledger: not an object";
	for (const field of ["feature_id", "phase", "status"] as const) {
		if (!isString(value[field])) {
			return `${field}: missing or not a string`;
		}
	}
	for (const field of ["current_round", "max_finding_id"] as const) {
		if (!isFiniteNumber(value[field])) {
			return `${field}: missing or not a number`;
		}
	}
	if (!Array.isArray(value.findings)) {
		return "findings: missing or not an array";
	}
	for (let i = 0; i < value.findings.length; i++) {
		const reason = validateReviewFinding(value.findings[i], i);
		if (reason) return reason;
	}
	if (!Array.isArray(value.round_summaries)) {
		return "round_summaries: missing or not an array";
	}
	for (let i = 0; i < value.round_summaries.length; i++) {
		const reason = validateRoundSummary(value.round_summaries[i], i);
		if (reason) return reason;
	}
	for (const field of [
		"latest_decision",
		"proposal_hash",
		"blocking_signature",
	] as const) {
		if (field in value && !isString(value[field])) {
			return `${field}: not a string`;
		}
	}
	for (const field of [
		"blocking_count",
		"stagnant_rounds",
		"max_rounds",
	] as const) {
		if (field in value && !isFiniteNumber(value[field])) {
			return `${field}: not a number`;
		}
	}
	if (
		"stop_reason" in value &&
		value.stop_reason !== null &&
		!isString(value.stop_reason)
	) {
		return "stop_reason: not string|null";
	}

	// Decision parity: when both `latest_decision` and the last round summary's
	// `decision` are present, they must agree. Silent disagreement would render
	// stale or inconsistent decision data — treat as malformed.
	const latestDecision = isString(value.latest_decision)
		? value.latest_decision
		: null;
	const summaries = value.round_summaries as readonly LedgerRoundSummary[];
	const lastRoundDecision =
		summaries.length > 0 && isString(summaries[summaries.length - 1].decision)
			? summaries[summaries.length - 1].decision
			: null;
	if (
		latestDecision !== null &&
		lastRoundDecision !== null &&
		latestDecision !== lastRoundDecision
	) {
		return `decision parity violation: latest_decision="${latestDecision}" disagrees with round_summaries[${
			summaries.length - 1
		}].decision="${lastRoundDecision}"`;
	}

	return null;
}

export function readReviewLedgerFile(
	projectRoot: string,
	changeName: string,
	family: ReviewLedgerFamily,
): ArtifactReadResult<ReviewLedger> {
	const path = reviewLedgerPath(projectRoot, changeName, family);
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
	const reason = validateReviewLedgerSchema(parsed);
	if (reason !== null) {
		return { kind: "malformed", reason };
	}
	return { kind: "ok", value: parsed as ReviewLedger };
}

export function readDesignReviewLedger(
	projectRoot: string,
	changeName: string,
): ArtifactReadResult<ReviewLedger> {
	return readReviewLedgerFile(projectRoot, changeName, "design");
}

export function readApplyReviewLedger(
	projectRoot: string,
	changeName: string,
): ArtifactReadResult<ReviewLedger> {
	return readReviewLedgerFile(projectRoot, changeName, "apply");
}

// Re-export ledger types so downstream watcher code never reaches into
// orchestration-side helpers; only shape types from `contracts.ts` are used.
export type { LedgerRoundSummary, ReviewFinding, ReviewLedger };

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
