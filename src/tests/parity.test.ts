import test from "node:test";
import assert from "node:assert/strict";
import { createFetchIssueStub, createFixtureRepo, makeTempDir, normalizeRunState, removeTempDir, runLegacyCli, runNodeCli } from "./test-helpers.js";

test("node specflow-run matches legacy output for start/propose lifecycle", () => {
  const tempRoot = makeTempDir("specflow-parity-");
  try {
    const left = createFixtureRepo(`${tempRoot}/left`);
    const right = createFixtureRepo(`${tempRoot}/right`);
    const stubPath = createFetchIssueStub(tempRoot);

    const nodeStart = runNodeCli(
      "specflow-run",
      ["start", left.changeId, "--issue-url", "https://github.com/test/repo/issues/71"],
      left.repoPath,
      { SPECFLOW_FETCH_ISSUE: stubPath },
    );
    const legacyStart = runLegacyCli(
      "specflow-run",
      ["start", right.changeId, "--issue-url", "https://github.com/test/repo/issues/71"],
      right.repoPath,
      { SPECFLOW_FETCH_ISSUE: stubPath },
    );

    assert.equal(nodeStart.status, 0, nodeStart.stderr);
    assert.equal(legacyStart.status, 0, legacyStart.stderr);
    assert.deepEqual(normalizeRunState(nodeStart.stdout), normalizeRunState(legacyStart.stdout));

    const nodeAdvance = runNodeCli("specflow-run", ["advance", left.changeId, "propose"], left.repoPath);
    const legacyAdvance = runLegacyCli("specflow-run", ["advance", right.changeId, "propose"], right.repoPath);

    assert.equal(nodeAdvance.status, 0, nodeAdvance.stderr);
    assert.equal(legacyAdvance.status, 0, legacyAdvance.stderr);
    assert.deepEqual(normalizeRunState(nodeAdvance.stdout), normalizeRunState(legacyAdvance.stdout));
  } finally {
    removeTempDir(tempRoot);
  }
});
