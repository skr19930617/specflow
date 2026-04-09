import test from "node:test";
import assert from "node:assert/strict";
import { makeTempDir, removeTempDir, runLegacyCli, runNodeCli } from "./test-helpers.js";

test("review wrapper preserves legacy exit code and payload outside a git repo", () => {
  const tempRoot = makeTempDir("review-wrapper-");
  try {
    const nodeResult = runNodeCli("specflow-review-apply", [], tempRoot);
    const legacyResult = runLegacyCli("specflow-review-apply", [], tempRoot);

    assert.equal(nodeResult.status, legacyResult.status);
    assert.equal(nodeResult.stdout.trim(), legacyResult.stdout.trim());
    assert.equal(nodeResult.stderr.trim(), legacyResult.stderr.trim());
  } finally {
    removeTempDir(tempRoot);
  }
});
