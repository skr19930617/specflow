import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	ArtifactStoreError,
	ChangeArtifactType,
	changeRef,
	ReviewLedgerKind,
	runRef,
} from "../lib/artifact-types.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";

function makeTempRoot(): string {
	const dir = join(
		tmpdir(),
		`artifact-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

test("ChangeArtifactStore: read/write/exists for singleton proposal", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef("my-change", ChangeArtifactType.Proposal);

		assert.equal(await store.exists(ref), false);
		await assert.rejects(store.read(ref), (err: unknown) => {
			assert.ok(err instanceof ArtifactStoreError);
			assert.equal(err.kind, "not_found");
			return true;
		});

		await store.write(ref, "# My Proposal\n");
		assert.equal(await store.exists(ref), true);
		assert.equal(await store.read(ref), "# My Proposal\n");

		// Verify filesystem path
		const expected = join(root, "openspec/changes/my-change/proposal.md");
		assert.equal(readFileSync(expected, "utf8"), "# My Proposal\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: read/write spec-delta with qualifier", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef(
			"my-change",
			ChangeArtifactType.SpecDelta,
			"run-identity-model",
		);

		await store.write(ref, "## ADDED Requirements\n");
		assert.equal(await store.exists(ref), true);
		assert.equal(await store.read(ref), "## ADDED Requirements\n");

		const expected = join(
			root,
			"openspec/changes/my-change/specs/run-identity-model/spec.md",
		);
		assert.equal(readFileSync(expected, "utf8"), "## ADDED Requirements\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: review-ledger with unconditional backup", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef(
			"my-change",
			ChangeArtifactType.ReviewLedger,
			ReviewLedgerKind.Design,
		);

		// First write — no backup needed (file doesn't exist)
		await store.write(ref, '{"round":1}\n');
		assert.equal(await store.exists(ref), true);

		const ledgerPath = join(
			root,
			"openspec/changes/my-change/review-ledger-design.json",
		);
		const backupPath = `${ledgerPath}.bak`;
		assert.equal(readFileSync(ledgerPath, "utf8"), '{"round":1}\n');

		// Second write — backup should be created unconditionally
		await store.write(ref, '{"round":2}\n');
		assert.equal(readFileSync(ledgerPath, "utf8"), '{"round":2}\n');
		assert.equal(readFileSync(backupPath, "utf8"), '{"round":1}\n');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: list spec-deltas", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);

		// Create two spec deltas
		const ref1 = changeRef("my-change", ChangeArtifactType.SpecDelta, "alpha");
		const ref2 = changeRef("my-change", ChangeArtifactType.SpecDelta, "beta");
		await store.write(ref1, "spec alpha");
		await store.write(ref2, "spec beta");

		const results = await store.list({
			changeId: "my-change",
			type: ChangeArtifactType.SpecDelta,
		});
		assert.equal(results.length, 2);
		const qualifiers = results
			.map((r) => ("qualifier" in r ? r.qualifier : ""))
			.sort();
		assert.deepEqual(qualifiers, ["alpha", "beta"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: list review-ledgers", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref1 = changeRef(
			"my-change",
			ChangeArtifactType.ReviewLedger,
			ReviewLedgerKind.Proposal,
		);
		const ref2 = changeRef(
			"my-change",
			ChangeArtifactType.ReviewLedger,
			ReviewLedgerKind.Design,
		);
		await store.write(ref1, "{}");
		await store.write(ref2, "{}");

		const results = await store.list({
			changeId: "my-change",
			type: ChangeArtifactType.ReviewLedger,
		});
		assert.equal(results.length, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: list singleton returns 0 or 1", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);

		let results = await store.list({
			changeId: "my-change",
			type: ChangeArtifactType.Proposal,
		});
		assert.equal(results.length, 0);

		await store.write(
			changeRef("my-change", ChangeArtifactType.Proposal),
			"content",
		);
		results = await store.list({
			changeId: "my-change",
			type: ChangeArtifactType.Proposal,
		});
		assert.equal(results.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: listChanges returns empty when no changes exist", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		assert.deepEqual(await store.listChanges(), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: listChanges returns all change identifiers", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		await store.write(changeRef("alpha", ChangeArtifactType.Proposal), "a");
		await store.write(changeRef("beta", ChangeArtifactType.Proposal), "b");

		const changes = [...(await store.listChanges())].sort();
		assert.deepEqual(changes, ["alpha", "beta"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: changeExists returns true for existing change directory", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		await store.write(changeRef("my-change", ChangeArtifactType.Proposal), "x");

		assert.equal(await store.changeExists("my-change"), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: changeExists returns false for non-existent change", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		assert.equal(await store.changeExists("nonexistent"), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: changeExists returns true for empty change directory", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		// Create the directory without any artifacts
		mkdirSync(join(root, "openspec/changes/empty-change"), {
			recursive: true,
		});

		assert.equal(await store.changeExists("empty-change"), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: read/write/exists for singleton task-graph", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef("my-change", ChangeArtifactType.TaskGraph);

		assert.equal(await store.exists(ref), false);
		await assert.rejects(store.read(ref), (err: unknown) => {
			assert.ok(err instanceof ArtifactStoreError);
			assert.equal(err.kind, "not_found");
			return true;
		});

		const content = '{"version":"1.0","bundles":[]}\n';
		await store.write(ref, content);
		assert.equal(await store.exists(ref), true);
		assert.equal(await store.read(ref), content);

		// Verify filesystem path
		const expected = join(root, "openspec/changes/my-change/task-graph.json");
		assert.equal(readFileSync(expected, "utf8"), content);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: read/write/exists for run-state", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		const ref = runRef("my-change-1");

		assert.equal(await store.exists(ref), false);
		await assert.rejects(store.read(ref), (err: unknown) => {
			assert.ok(err instanceof ArtifactStoreError);
			assert.equal(err.kind, "not_found");
			return true;
		});

		await store.write(ref, '{"run_id":"my-change-1"}\n');
		assert.equal(await store.exists(ref), true);
		assert.equal(await store.read(ref), '{"run_id":"my-change-1"}\n');

		const expected = join(root, ".specflow/runs/my-change-1/run.json");
		assert.equal(readFileSync(expected, "utf8"), '{"run_id":"my-change-1"}\n');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list all runs", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		await store.write(runRef("my-change-1"), '{"run_id":"my-change-1"}');
		await store.write(runRef("my-change-2"), '{"run_id":"my-change-2"}');

		const results = await store.list();
		assert.equal(results.length, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list filters by changeId", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		await store.write(runRef("alpha-1"), '{"run_id":"alpha-1"}');
		await store.write(runRef("alpha-2"), '{"run_id":"alpha-2"}');
		await store.write(runRef("beta-1"), '{"run_id":"beta-1"}');

		const alphaResults = await store.list({ changeId: "alpha" });
		assert.equal(alphaResults.length, 2);

		const betaResults = await store.list({ changeId: "beta" });
		assert.equal(betaResults.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list returns empty for non-existent runsDir", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		const results = await store.list();
		assert.equal(results.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list({ changeId }) filters only valid <changeId>-<N> run IDs", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		await store.write(runRef("my-change-1"), '{"run_id":"my-change-1"}');
		await store.write(runRef("my-change-2"), '{"run_id":"my-change-2"}');
		await store.write(
			runRef("my-change-extra-1"),
			'{"run_id":"my-change-extra-1"}',
		);
		await store.write(runRef("other-1"), '{"run_id":"other-1"}');

		const results = await store.list({ changeId: "my-change" });
		const runIds = results.map((r) => r.runId).sort();
		assert.deepEqual(runIds, ["my-change-1", "my-change-2"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list returns deterministic lexicographic order including double-digit IDs", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		// Write in non-sorted order
		await store.write(runRef("change-10"), '{"run_id":"change-10"}');
		await store.write(runRef("change-2"), '{"run_id":"change-2"}');
		await store.write(runRef("change-1"), '{"run_id":"change-1"}');

		const results = await store.list({ changeId: "change" });
		const runIds = results.map((r) => r.runId);
		// Lexicographic order: change-1, change-10, change-2
		assert.deepEqual(runIds, ["change-1", "change-10", "change-2"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: read-after-write consistency", async () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		const ref = runRef("rw-test-1");
		const content = '{"run_id":"rw-test-1","version":1}\n';

		await store.write(ref, content);
		assert.equal(await store.read(ref), content);

		// Overwrite and verify
		const updated = '{"run_id":"rw-test-1","version":2}\n';
		await store.write(ref, updated);
		assert.equal(await store.read(ref), updated);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
