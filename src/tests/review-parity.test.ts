import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addDesignArtifacts,
  addImplementationDiff,
  createCodexStub,
  createFixtureRepo,
  createInstalledHome,
  makeTempDir,
  prependPath,
  removeTempDir,
  runLegacyCli,
  runNodeCli,
} from "./test-helpers.js";

function writeResponses(root: string, responses: unknown[]): { responsesPath: string; statePath: string } {
  mkdirSync(root, { recursive: true });
  const responsesPath = join(root, "codex-responses.json");
  const statePath = join(root, "codex-state.txt");
  writeFileSync(responsesPath, JSON.stringify(responses), "utf8");
  writeFileSync(statePath, "0", "utf8");
  return { responsesPath, statePath };
}

test("node specflow-review-apply matches legacy review output and side effects", () => {
  const tempRoot = makeTempDir("review-apply-parity-");
  try {
    const left = createFixtureRepo(join(tempRoot, "left"));
    const right = createFixtureRepo(join(tempRoot, "right"));
    addImplementationDiff(left.repoPath);
    addImplementationDiff(right.repoPath);
    const home = createInstalledHome(tempRoot);
    const stubDir = createCodexStub(tempRoot);
    const responses = [
      {
        exitCode: 0,
        output: JSON.stringify({
          decision: "REVIEWED",
          summary: "looks good",
          findings: [{ title: "Needs guard", file: "app.txt", category: "logic", severity: "high" }],
        }),
      },
    ];
    const nodeEnv = prependPath(
      {
        HOME: home,
        ...writeResponses(join(tempRoot, "node"), responses),
      },
      stubDir,
    );
    const legacyEnv = prependPath(
      {
        HOME: home,
        ...writeResponses(join(tempRoot, "legacy"), responses),
      },
      stubDir,
    );

    const nodeResult = runNodeCli("specflow-review-apply", ["review", left.changeId], left.repoPath, nodeEnv);
    const legacyResult = runLegacyCli("specflow-review-apply", ["review", right.changeId], right.repoPath, legacyEnv);
    assert.equal(nodeResult.status, legacyResult.status);
    assert.deepEqual(JSON.parse(nodeResult.stdout), JSON.parse(legacyResult.stdout));
    assert.equal(
      readFileSync(join(left.repoPath, "openspec/changes", left.changeId, "review-ledger.json"), "utf8"),
      readFileSync(join(right.repoPath, "openspec/changes", right.changeId, "review-ledger.json"), "utf8"),
    );
    assert.equal(
      readFileSync(join(left.repoPath, "openspec/changes", left.changeId, "current-phase.md"), "utf8"),
      readFileSync(join(right.repoPath, "openspec/changes", right.changeId, "current-phase.md"), "utf8"),
    );
  } finally {
    removeTempDir(tempRoot);
  }
});

test("node specflow-review-design matches legacy review output and side effects", () => {
  const tempRoot = makeTempDir("review-design-parity-");
  try {
    const left = createFixtureRepo(join(tempRoot, "left"));
    const right = createFixtureRepo(join(tempRoot, "right"));
    addDesignArtifacts(left.repoPath, left.changeId);
    addDesignArtifacts(right.repoPath, right.changeId);
    const home = createInstalledHome(tempRoot);
    const stubDir = createCodexStub(tempRoot);
    const responses = [
      {
        exitCode: 0,
        output: JSON.stringify({
          decision: "REVIEWED",
          summary: "design reviewed",
          findings: [{ title: "Clarify data flow", file: "design.md", category: "design", severity: "high" }],
        }),
      },
    ];
    const nodeEnv = prependPath(
      {
        HOME: home,
        ...writeResponses(join(tempRoot, "node"), responses),
      },
      stubDir,
    );
    const legacyEnv = prependPath(
      {
        HOME: home,
        ...writeResponses(join(tempRoot, "legacy"), responses),
      },
      stubDir,
    );

    const nodeResult = runNodeCli("specflow-review-design", ["review", left.changeId], left.repoPath, nodeEnv);
    const legacyResult = runLegacyCli("specflow-review-design", ["review", right.changeId], right.repoPath, legacyEnv);
    assert.equal(nodeResult.status, legacyResult.status);
    assert.deepEqual(JSON.parse(nodeResult.stdout), JSON.parse(legacyResult.stdout));
    assert.equal(
      readFileSync(join(left.repoPath, "openspec/changes", left.changeId, "review-ledger-design.json"), "utf8"),
      readFileSync(join(right.repoPath, "openspec/changes", right.changeId, "review-ledger-design.json"), "utf8"),
    );
    assert.equal(
      readFileSync(join(left.repoPath, "openspec/changes", left.changeId, "current-phase.md"), "utf8"),
      readFileSync(join(right.repoPath, "openspec/changes", right.changeId, "current-phase.md"), "utf8"),
    );
  } finally {
    removeTempDir(tempRoot);
  }
});
