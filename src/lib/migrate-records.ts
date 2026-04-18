// Legacy record migration library.
//
// Converts every `.specflow/runs/<run_id>/records/*.json` file from the legacy
// ApprovalRecord / ClarifyRecord shape into the unified GateRecord shape. The
// migration is idempotent and reversible:
// - Forward pass writes a `.migrated` sentinel and a `.backup/` snapshot per run.
// - `--undo` restores the snapshot and removes the sentinel.
// - Already-migrated directories are detected via the sentinel and left alone.

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { GateRecord } from "../types/gate-records.js";
import {
	isGateRecordShape,
	isLegacyRecordShape,
} from "../types/gate-records.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";
import { atomicWriteText, readText } from "./fs.js";

const SENTINEL_NAME = ".migrated";
const BACKUP_DIR_NAME = ".backup";

export interface MigrationResult {
	readonly runsRoot: string;
	readonly perRun: readonly RunMigrationResult[];
}

export interface RunMigrationResult {
	readonly runId: string;
	readonly status:
		| "migrated"
		| "already_migrated"
		| "no_records"
		| "error"
		| "undone";
	readonly migrated: number;
	readonly skipped: number;
	readonly error?: string;
}

export interface MigrationOptions {
	readonly mode: "forward" | "undo";
	/** Filter: run-id allowlist. Empty means all runs. */
	readonly runIds?: readonly string[];
}

export function runMigration(
	projectRoot: string,
	options: MigrationOptions = { mode: "forward" },
): MigrationResult {
	const runsRoot = resolve(projectRoot, ".specflow/runs");
	if (!existsSync(runsRoot) || !statSync(runsRoot).isDirectory()) {
		return { runsRoot, perRun: [] };
	}

	const entries = readdirSync(runsRoot).filter((name) => {
		if (options.runIds && options.runIds.length > 0) {
			return options.runIds.includes(name);
		}
		return true;
	});

	const perRun: RunMigrationResult[] = [];
	for (const runId of entries) {
		const runDir = resolve(runsRoot, runId);
		if (!statSync(runDir).isDirectory()) continue;
		try {
			if (options.mode === "forward") {
				perRun.push(migrateRunForward(runDir, runId));
			} else {
				perRun.push(undoRun(runDir, runId));
			}
		} catch (err) {
			perRun.push({
				runId,
				status: "error",
				migrated: 0,
				skipped: 0,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	return { runsRoot, perRun };
}

function migrateRunForward(runDir: string, runId: string): RunMigrationResult {
	const recordsDir = resolve(runDir, "records");
	if (!existsSync(recordsDir)) {
		return { runId, status: "no_records", migrated: 0, skipped: 0 };
	}
	const sentinel = resolve(recordsDir, SENTINEL_NAME);
	if (existsSync(sentinel)) {
		return { runId, status: "already_migrated", migrated: 0, skipped: 0 };
	}
	const backupDir = resolve(recordsDir, BACKUP_DIR_NAME);
	mkdirSync(backupDir, { recursive: true });

	const files = readdirSync(recordsDir).filter(
		(f) => f.endsWith(".json") && !f.startsWith("."),
	);

	let migrated = 0;
	let skipped = 0;
	for (const filename of files) {
		const path = resolve(recordsDir, filename);
		const raw = readText(path);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			throw new Error(
				`Cannot parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (isGateRecordShape(parsed)) {
			skipped += 1;
			continue;
		}
		if (!isLegacyRecordShape(parsed)) {
			throw new Error(
				`Record at ${path} is neither legacy nor gate-shaped; cannot migrate.`,
			);
		}
		// back up original byte-for-byte before mutating
		copyFileSync(path, resolve(backupDir, filename));

		const converted = convertLegacyRecord(parsed as unknown as LegacyRecord);
		atomicWriteText(path, `${JSON.stringify(converted, null, 2)}\n`);
		migrated += 1;
	}

	writeFileSync(sentinel, new Date().toISOString(), "utf8");
	return { runId, status: "migrated", migrated, skipped };
}

function undoRun(runDir: string, runId: string): RunMigrationResult {
	const recordsDir = resolve(runDir, "records");
	if (!existsSync(recordsDir)) {
		return { runId, status: "no_records", migrated: 0, skipped: 0 };
	}
	const sentinel = resolve(recordsDir, SENTINEL_NAME);
	const backupDir = resolve(recordsDir, BACKUP_DIR_NAME);
	if (!existsSync(sentinel) || !existsSync(backupDir)) {
		return { runId, status: "no_records", migrated: 0, skipped: 0 };
	}
	const files = readdirSync(backupDir).filter((f) => f.endsWith(".json"));
	for (const filename of files) {
		const from = resolve(backupDir, filename);
		const to = resolve(recordsDir, filename);
		renameSync(from, to);
	}
	// remove backup directory (now empty) and sentinel
	try {
		rmSync(backupDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	unlinkSync(sentinel);
	return { runId, status: "undone", migrated: files.length, skipped: 0 };
}

// --- conversion ---------------------------------------------------------

type LegacyRecord = ApprovalRecord | ClarifyRecord;

function convertLegacyRecord(legacy: LegacyRecord): GateRecord {
	if (legacy.record_kind === "approval") {
		return convertApproval(legacy);
	}
	return convertClarify(legacy);
}

function convertApproval(legacy: ApprovalRecord): GateRecord {
	const status: GateRecord["status"] =
		legacy.status === "pending" ? "pending" : "resolved";
	const resolvedResponse: string | null =
		legacy.status === "approved"
			? "accept"
			: legacy.status === "rejected"
				? "reject"
				: null;
	return {
		gate_id: legacy.record_id,
		gate_kind: "approval",
		run_id: legacy.run_id,
		originating_phase: legacy.phase_from,
		status,
		reason: `Approval required to move from ${legacy.phase_from} to ${legacy.phase_to}`,
		payload: {
			kind: "approval",
			phase_from: legacy.phase_from,
			phase_to: legacy.phase_to,
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["accept", "reject"],
		created_at: legacy.requested_at,
		resolved_at: legacy.decided_at,
		decision_actor: legacy.decision_actor,
		resolved_response: resolvedResponse,
		event_ids: [...legacy.event_ids],
	};
}

function convertClarify(legacy: ClarifyRecord): GateRecord {
	const status: GateRecord["status"] =
		legacy.status === "pending" ? "pending" : "resolved";
	return {
		gate_id: legacy.record_id,
		gate_kind: "clarify",
		run_id: legacy.run_id,
		originating_phase: legacy.phase,
		status,
		reason: "Clarification requested",
		payload: {
			kind: "clarify",
			question: legacy.question,
			question_context: legacy.question_context,
			answer: legacy.answer ?? undefined,
		},
		eligible_responder_roles: ["human-author"],
		allowed_responses: ["clarify_response"],
		created_at: legacy.asked_at,
		resolved_at: legacy.answered_at,
		decision_actor: null,
		resolved_response: legacy.status === "resolved" ? "clarify_response" : null,
		event_ids: [...legacy.event_ids],
	};
}
