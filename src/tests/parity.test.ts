import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createFetchIssueStub,
	createFixtureRepo,
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
		const stubPath = createFetchIssueStub(tempRoot);
		const startFixture = readFixtureJson("specflow-run/start.json");
		const advanceFixture = readFixtureJson("specflow-run/advance.json");

		const nodeStart = runNodeCli(
			"specflow-run",
			[
				"start",
				changeId,
				"--issue-url",
				"https://github.com/test/repo/issues/71",
			],
			repoPath,
			{ SPECFLOW_FETCH_ISSUE: stubPath },
		);
		assert.equal(nodeStart.status, 0, nodeStart.stderr);
		assert.deepEqual(normalizeRunState(nodeStart.stdout), startFixture);
		assert.deepEqual(
			normalizeRunState(
				readFileSync(
					join(repoPath, ".specflow/runs", changeId, "run.json"),
					"utf8",
				),
			),
			startFixture,
		);

		const nodeAdvance = runNodeCli(
			"specflow-run",
			["advance", changeId, "propose"],
			repoPath,
		);

		assert.equal(nodeAdvance.status, 0, nodeAdvance.stderr);
		assert.deepEqual(normalizeRunState(nodeAdvance.stdout), advanceFixture);
		assert.deepEqual(
			normalizeRunState(
				readFileSync(
					join(repoPath, ".specflow/runs", changeId, "run.json"),
					"utf8",
				),
			),
			advanceFixture,
		);
	} finally {
		removeTempDir(tempRoot);
	}
});
