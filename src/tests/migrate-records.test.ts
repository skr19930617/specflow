import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import { runMigration } from "../lib/migrate-records.js";
import {
	isGateRecordShape,
	UnmigratedRecordError,
} from "../types/gate-records.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";

function makeTempRepo(): string {
	return mkdtempSync(resolve(tmpdir(), "specflow-migrate-test-"));
}

function legacyApproval(runId: string, id: string): ApprovalRecord {
	return {
		record_id: id,
		record_kind: "approval",
		run_id: runId,
		phase_from: "spec_ready",
		phase_to: "design_draft",
		status: "approved",
		requested_at: "2026-04-01T00:00:00Z",
		decided_at: "2026-04-01T01:00:00Z",
		decision_actor: { actor: "human", actor_id: "yuki" },
		event_ids: ["evt-1", "evt-2"],
	};
}

function legacyClarify(runId: string, id: string): ClarifyRecord {
	return {
		record_id: id,
		record_kind: "clarify",
		run_id: runId,
		phase: "proposal_clarify",
		question: "What is the scope?",
		question_context: "Context here",
		answer: "Scope answer",
		status: "resolved",
		asked_at: "2026-04-02T00:00:00Z",
		answered_at: "2026-04-02T01:00:00Z",
		event_ids: ["evt-3"],
	};
}

function seedLegacyRun(root: string, runId: string, records: unknown[]): void {
	const dir = resolve(root, ".specflow/runs", runId, "records");
	mkdirSync(dir, { recursive: true });
	for (const r of records) {
		const filename = `${(r as { record_id: string }).record_id}.json`;
		writeFileSync(resolve(dir, filename), JSON.stringify(r), "utf8");
	}
}

// --- forward migration ------------------------------------------------------

test("migration converts legacy ApprovalRecord to GateRecord in place", () => {
	const root = makeTempRepo();
	try {
		const runId = "my-feature-1";
		const legacy = legacyApproval(runId, "approval-my-feature-1-1");
		seedLegacyRun(root, runId, [legacy]);

		const result = runMigration(root, { mode: "forward" });
		assert.equal(result.perRun.length, 1);
		const r = result.perRun[0];
		assert.equal(r.status, "migrated");
		assert.equal(r.migrated, 1);

		const recordPath = resolve(
			root,
			`.specflow/runs/${runId}/records/approval-${runId}-1.json`,
		);
		const parsed = JSON.parse(readFileSync(recordPath, "utf8")) as unknown;
		assert.equal(isGateRecordShape(parsed), true);
		const gate = parsed as { gate_id: string; gate_kind: string };
		assert.equal(gate.gate_id, "approval-my-feature-1-1");
		assert.equal(gate.gate_kind, "approval");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("migration is idempotent (re-running on already migrated run reports already_migrated)", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		seedLegacyRun(root, runId, [legacyApproval(runId, "approval-r-1")]);

		const first = runMigration(root, { mode: "forward" });
		assert.equal(first.perRun[0].status, "migrated");

		const second = runMigration(root, { mode: "forward" });
		assert.equal(second.perRun[0].status, "already_migrated");
		assert.equal(second.perRun[0].migrated, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("migration converts a mixed directory (approval + clarify)", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		seedLegacyRun(root, runId, [
			legacyApproval(runId, "approval-r-1"),
			legacyClarify(runId, "clarify-r-1"),
			legacyClarify(runId, "clarify-r-2"),
		]);
		const result = runMigration(root, { mode: "forward" });
		assert.equal(result.perRun[0].migrated, 3);

		const store = createLocalFsGateRecordStore(root);
		const listed = store.list(runId);
		assert.equal(listed.length, 3);
		const kinds = listed.map((g) => g.gate_kind).sort();
		assert.deepEqual(kinds, ["approval", "clarify", "clarify"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("migration fails fast on unknown record_kind value", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			resolve(dir, "weird-r-1.json"),
			JSON.stringify({
				record_id: "weird-r-1",
				record_kind: "weird",
				run_id: runId,
			}),
		);
		const result = runMigration(root, { mode: "forward" });
		assert.equal(result.perRun[0].status, "error");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("migration fails fast on partially corrupted legacy record (invalid JSON)", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, "broken.json"), "{ not json");
		const result = runMigration(root, { mode: "forward" });
		assert.equal(result.perRun[0].status, "error");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("migration writes .migrated sentinel and .backup snapshot", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		const legacy = legacyApproval(runId, "approval-r-1");
		seedLegacyRun(root, runId, [legacy]);
		runMigration(root, { mode: "forward" });
		const dir = resolve(root, ".specflow/runs/r/records");
		assert.equal(existsSync(resolve(dir, ".migrated")), true);
		assert.equal(existsSync(resolve(dir, ".backup/approval-r-1.json")), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- undo -------------------------------------------------------------------

test("undo restores original legacy files and removes the sentinel", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		const legacy = legacyApproval(runId, "approval-r-1");
		const originalBytes = JSON.stringify(legacy);
		seedLegacyRun(root, runId, [legacy]);

		runMigration(root, { mode: "forward" });
		// verify gate shape is now on disk
		const dir = resolve(root, ".specflow/runs/r/records");
		const afterFwd = JSON.parse(
			readFileSync(resolve(dir, "approval-r-1.json"), "utf8"),
		);
		assert.equal(isGateRecordShape(afterFwd), true);

		const undoResult = runMigration(root, { mode: "undo" });
		assert.equal(undoResult.perRun[0].status, "undone");

		const afterUndo = readFileSync(
			resolve(dir, "approval-r-1.json"),
			"utf8",
		).trim();
		assert.equal(afterUndo, originalBytes);
		assert.equal(existsSync(resolve(dir, ".migrated")), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- list() behavior against unmigrated data -------------------------------

test("GateRecordStore.list raises UnmigratedRecordError on unmigrated run directories", () => {
	const root = makeTempRepo();
	try {
		const runId = "r";
		seedLegacyRun(root, runId, [legacyApproval(runId, "approval-r-1")]);
		const store = createLocalFsGateRecordStore(root);
		assert.throws(
			() => store.list(runId),
			(err: unknown) => err instanceof UnmigratedRecordError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
