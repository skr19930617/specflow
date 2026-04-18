// Regression tests for specflow-run persistence wiring.
//
// Covers:
// - Gate records are written via mirrorMutationsSafely (R1-F01)
// - Delete mutations are skipped, preserving history (R1-F02)
// - Migrated directories are rejected by InteractionRecordStore (R1-F03)

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import type { RecordMutation } from "../core/types.js";
import { createFakeGateRecordStore } from "../lib/fake-gate-record-store.js";
import { mirrorMutationsToGateStore } from "../lib/gate-mutation-bridge.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import {
	createLocalFsInteractionRecordStore,
	MigratedDirectoryError,
} from "../lib/local-fs-interaction-record-store.js";
import type {
	ApprovalRecord,
	ClarifyRecord,
} from "../types/interaction-records.js";

function makeTempRepo(): string {
	return mkdtempSync(resolve(tmpdir(), "specflow-run-persist-test-"));
}

function approvalRecord(
	runId: string,
	id: string,
	status: ApprovalRecord["status"] = "pending",
): ApprovalRecord {
	return {
		record_id: id,
		record_kind: "approval",
		run_id: runId,
		phase_from: "spec_ready",
		phase_to: "design_draft",
		status,
		requested_at: "2026-04-18T00:00:00Z",
		decided_at: status === "pending" ? null : "2026-04-18T01:00:00Z",
		decision_actor:
			status === "pending" ? null : { actor: "human", actor_id: "yuki" },
		event_ids: ["evt-1"],
	};
}

function clarifyRecord(runId: string, id: string): ClarifyRecord {
	return {
		record_id: id,
		record_kind: "clarify",
		run_id: runId,
		phase: "proposal_clarify",
		question: "What is the scope?",
		answer: null,
		status: "pending",
		asked_at: "2026-04-18T00:00:00Z",
		answered_at: null,
		event_ids: ["evt-2"],
	};
}

// ---------------------------------------------------------------------------
// R1-F01: Gate records are persisted via mirroring
// ---------------------------------------------------------------------------

test("mirrorMutationsToGateStore writes gate records for create/update mutations", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRecord("r", "approval-r-1") },
		{ kind: "create", record: clarifyRecord("r", "clarify-r-1") },
	];
	mirrorMutationsToGateStore(store, "r", mutations);
	const listed = store.list("r");
	assert.equal(listed.length, 2, "Both mutations should produce gate records");
	const kinds = listed.map((g) => g.gate_kind).sort();
	assert.deepEqual(kinds, ["approval", "clarify"]);
});

test("Gate mirroring to LocalFsGateRecordStore persists files on disk", () => {
	const root = makeTempRepo();
	try {
		const gateStore = createLocalFsGateRecordStore(root);
		const mutations: RecordMutation[] = [
			{ kind: "create", record: approvalRecord("r1", "approval-r1-1") },
		];
		mirrorMutationsToGateStore(gateStore, "r1", mutations);

		const readBack = gateStore.read("r1", "approval-r1-1");
		assert.ok(readBack, "Gate record should be persisted on disk");
		assert.equal(readBack.gate_kind, "approval");
		assert.equal(readBack.gate_id, "approval-r1-1");
		assert.equal(readBack.status, "pending");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// R1-F02: Delete mutations are skipped — history preserved
// ---------------------------------------------------------------------------

test("mirrorMutationsToGateStore ignores delete mutations (gate history preserved)", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRecord("r", "approval-r-1") },
		{ kind: "delete", recordId: "approval-r-1" },
	];
	mirrorMutationsToGateStore(store, "r", mutations);
	const listed = store.list("r");
	assert.equal(
		listed.length,
		1,
		"Delete mutation must not remove the gate record",
	);
	assert.equal(listed[0].gate_id, "approval-r-1");
});

test("GateRecordStore has no delete API — records persist for audit", () => {
	const store = createFakeGateRecordStore();
	assert.equal(
		Object.hasOwn(store, "delete"),
		false,
		"GateRecordStore must not expose delete",
	);
});

test("Gate records survive create→update→delete sequence in mirror", () => {
	const store = createFakeGateRecordStore();
	const mutations: RecordMutation[] = [
		{ kind: "create", record: approvalRecord("r", "approval-r-1", "pending") },
		{
			kind: "update",
			record: approvalRecord("r", "approval-r-1", "approved"),
		},
		{ kind: "delete", recordId: "approval-r-1" },
	];
	mirrorMutationsToGateStore(store, "r", mutations);
	const listed = store.list("r");
	assert.equal(listed.length, 1, "Gate record must survive a delete mutation");
	assert.equal(
		listed[0].status,
		"resolved",
		"Final state should reflect the update, not the delete",
	);
	assert.equal(listed[0].resolved_response, "accept");
});

// ---------------------------------------------------------------------------
// R1-F03: Migrated directories are rejected by InteractionRecordStore
// ---------------------------------------------------------------------------

test("InteractionRecordStore.list throws MigratedDirectoryError when .migrated sentinel exists", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, ".migrated"), "2026-04-18T00:00:00Z");
		writeFileSync(
			resolve(dir, "approval-r-1.json"),
			JSON.stringify(approvalRecord("r", "approval-r-1")),
		);

		const store = createLocalFsInteractionRecordStore(root);
		assert.throws(
			() => store.list("r"),
			(err: unknown) => err instanceof MigratedDirectoryError,
			"list() must throw MigratedDirectoryError on migrated directory",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore.read throws MigratedDirectoryError when .migrated sentinel exists", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, ".migrated"), "2026-04-18T00:00:00Z");
		writeFileSync(
			resolve(dir, "approval-r-1.json"),
			JSON.stringify(approvalRecord("r", "approval-r-1")),
		);

		const store = createLocalFsInteractionRecordStore(root);
		assert.throws(
			() => store.read("r", "approval-r-1"),
			(err: unknown) => err instanceof MigratedDirectoryError,
			"read() must throw MigratedDirectoryError on migrated directory",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore.write throws MigratedDirectoryError when .migrated sentinel exists", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, ".migrated"), "2026-04-18T00:00:00Z");

		const store = createLocalFsInteractionRecordStore(root);
		assert.throws(
			() => store.write("r", approvalRecord("r", "approval-r-1")),
			(err: unknown) => err instanceof MigratedDirectoryError,
			"write() must throw MigratedDirectoryError on migrated directory",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore.delete throws MigratedDirectoryError when .migrated sentinel exists", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		writeFileSync(resolve(dir, ".migrated"), "2026-04-18T00:00:00Z");

		const store = createLocalFsInteractionRecordStore(root);
		assert.throws(
			() => store.delete("r", "approval-r-1"),
			(err: unknown) => err instanceof MigratedDirectoryError,
			"delete() must throw MigratedDirectoryError on migrated directory",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore works normally when no .migrated sentinel exists", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsInteractionRecordStore(root);
		const rec = approvalRecord("r", "approval-r-1");
		store.write("r", rec);
		const readBack = store.read("r", "approval-r-1");
		assert.ok(readBack, "Should read back the written record");
		assert.equal(readBack.record_id, "approval-r-1");
		const listed = store.list("r");
		assert.equal(listed.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore.list throws MigratedDirectoryError on unrecognized JSON shape (not gate, not legacy)", () => {
	const root = makeTempRepo();
	try {
		const dir = resolve(root, ".specflow/runs/r/records");
		mkdirSync(dir, { recursive: true });
		// A valid JSON file that is neither gate-shaped nor interaction-record-shaped.
		writeFileSync(
			resolve(dir, "mystery.json"),
			JSON.stringify({ foo: "bar", baz: 42 }),
		);

		const store = createLocalFsInteractionRecordStore(root);
		assert.throws(
			() => store.list("r"),
			(err: unknown) => err instanceof MigratedDirectoryError,
			"list() must throw on unrecognized record format",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("InteractionRecordStore.list returns empty for non-existent run (no false positive on sentinel check)", () => {
	const root = makeTempRepo();
	try {
		const store = createLocalFsInteractionRecordStore(root);
		const listed = store.list("nonexistent-run");
		assert.deepEqual(listed, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
