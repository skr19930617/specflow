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
 * `current_phase`. A phase outside the two review gates yields `null`, which
 * the renderer surfaces as "No active review".
 */
export function selectActiveAutofixPhase(
	currentPhase: string,
): AutofixReviewPhase | null {
	if (currentPhase === "design_review") return "design_review";
	if (currentPhase === "apply_review") return "apply_review";
	return null;
}

// ---------------------------------------------------------------------------
// Task graph (per change)
// ---------------------------------------------------------------------------

export function taskGraphPath(projectRoot: string, changeName: string): string {
	return join(projectRoot, "openspec/changes", changeName, "task-graph.json");
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
