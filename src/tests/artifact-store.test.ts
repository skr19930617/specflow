import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	ArtifactNotFoundError,
	ChangeArtifactType,
	changeRef,
	ReviewLedgerKind,
	runRef,
	UnknownArtifactTypeError,
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

test("ChangeArtifactStore: read/write/exists for singleton proposal", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef("my-change", ChangeArtifactType.Proposal);

		assert.equal(store.exists(ref), false);
		assert.throws(() => store.read(ref), ArtifactNotFoundError);

		store.write(ref, "# My Proposal\n");
		assert.equal(store.exists(ref), true);
		assert.equal(store.read(ref), "# My Proposal\n");

		// Verify filesystem path
		const expected = join(root, "openspec/changes/my-change/proposal.md");
		assert.equal(readFileSync(expected, "utf8"), "# My Proposal\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: read/write spec-delta with qualifier", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef(
			"my-change",
			ChangeArtifactType.SpecDelta,
			"run-identity-model",
		);

		store.write(ref, "## ADDED Requirements\n");
		assert.equal(store.exists(ref), true);
		assert.equal(store.read(ref), "## ADDED Requirements\n");

		const expected = join(
			root,
			"openspec/changes/my-change/specs/run-identity-model/spec.md",
		);
		assert.equal(readFileSync(expected, "utf8"), "## ADDED Requirements\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: review-ledger with unconditional backup", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);
		const ref = changeRef(
			"my-change",
			ChangeArtifactType.ReviewLedger,
			ReviewLedgerKind.Design,
		);

		// First write — no backup needed (file doesn't exist)
		store.write(ref, '{"round":1}\n');
		assert.equal(store.exists(ref), true);

		const ledgerPath = join(
			root,
			"openspec/changes/my-change/review-ledger-design.json",
		);
		const backupPath = `${ledgerPath}.bak`;
		assert.equal(readFileSync(ledgerPath, "utf8"), '{"round":1}\n');

		// Second write — backup should be created unconditionally
		store.write(ref, '{"round":2}\n');
		assert.equal(readFileSync(ledgerPath, "utf8"), '{"round":2}\n');
		assert.equal(readFileSync(backupPath, "utf8"), '{"round":1}\n');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: list spec-deltas", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);

		// Create two spec deltas
		const ref1 = changeRef("my-change", ChangeArtifactType.SpecDelta, "alpha");
		const ref2 = changeRef("my-change", ChangeArtifactType.SpecDelta, "beta");
		store.write(ref1, "spec alpha");
		store.write(ref2, "spec beta");

		const results = store.list({
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

test("ChangeArtifactStore: list review-ledgers", () => {
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
		store.write(ref1, "{}");
		store.write(ref2, "{}");

		const results = store.list({
			changeId: "my-change",
			type: ChangeArtifactType.ReviewLedger,
		});
		assert.equal(results.length, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ChangeArtifactStore: list singleton returns 0 or 1", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsChangeArtifactStore(root);

		let results = store.list({
			changeId: "my-change",
			type: ChangeArtifactType.Proposal,
		});
		assert.equal(results.length, 0);

		store.write(changeRef("my-change", ChangeArtifactType.Proposal), "content");
		results = store.list({
			changeId: "my-change",
			type: ChangeArtifactType.Proposal,
		});
		assert.equal(results.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: read/write/exists for run-state", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		const ref = runRef("my-change-1");

		assert.equal(store.exists(ref), false);
		assert.throws(() => store.read(ref), ArtifactNotFoundError);

		store.write(ref, '{"run_id":"my-change-1"}\n');
		assert.equal(store.exists(ref), true);
		assert.equal(store.read(ref), '{"run_id":"my-change-1"}\n');

		const expected = join(root, ".specflow/runs/my-change-1/run.json");
		assert.equal(readFileSync(expected, "utf8"), '{"run_id":"my-change-1"}\n');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list all runs", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		store.write(runRef("my-change-1"), '{"run_id":"my-change-1"}');
		store.write(runRef("my-change-2"), '{"run_id":"my-change-2"}');

		const results = store.list();
		assert.equal(results.length, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list filters by changeId", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		store.write(runRef("alpha-1"), '{"run_id":"alpha-1"}');
		store.write(runRef("alpha-2"), '{"run_id":"alpha-2"}');
		store.write(runRef("beta-1"), '{"run_id":"beta-1"}');

		const alphaResults = store.list({ changeId: "alpha" });
		assert.equal(alphaResults.length, 2);

		const betaResults = store.list({ changeId: "beta" });
		assert.equal(betaResults.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("RunArtifactStore: list returns empty for non-existent runsDir", () => {
	const root = makeTempRoot();
	try {
		const store = createLocalFsRunArtifactStore(root);
		const results = store.list();
		assert.equal(results.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
