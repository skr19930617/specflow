import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
	createFixtureRepo,
	createSourceFile,
	makeTempDir,
	normalizeRunState,
	readFixtureJson,
	removeTempDir,
	runNodeCli,
} from "./test-helpers.js";

test("specflow-run matches archived start/propose fixtures", () => {
	const tempRoot = makeTempDir("specflow-parity-");
	try {
		const { repoPath, changeId } = createFixtureRepo(tempRoot);
		const sourceFile = createSourceFile(tempRoot, {
			kind: "url",
			provider: "github",
			reference: "https://github.com/test/repo/issues/71",
			title: "Stub issue",
		});
		const startFixture = readFixtureJson("specflow-run/start.json");
		const advanceFixture = readFixtureJson("specflow-run/advance.json");

		const runId = `${changeId}-1`;

		const nodeStart = runNodeCli(
			"specflow-run",
			["start", changeId, "--source-file", sourceFile],
			repoPath,
		);
		assert.equal(nodeStart.status, 0, nodeStart.stderr);
		assert.deepEqual(normalizeRunState(nodeStart.stdout), startFixture);
		assert.deepEqual(
			normalizeRunState(
				readFileSync(
					join(repoPath, ".specflow/runs", runId, "run.json"),
					"utf8",
				),
			),
			startFixture,
		);

		const nodeAdvance = runNodeCli(
			"specflow-run",
			["advance", runId, "propose"],
			repoPath,
		);

		assert.equal(nodeAdvance.status, 0, nodeAdvance.stderr);
		assert.deepEqual(normalizeRunState(nodeAdvance.stdout), advanceFixture);
		assert.deepEqual(
			normalizeRunState(
				readFileSync(
					join(repoPath, ".specflow/runs", runId, "run.json"),
					"utf8",
				),
			),
			advanceFixture,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});
