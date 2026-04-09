import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addDesignArtifacts,
  addImplementationDiff,
  createCodexStub,
  createFixtureRepo,
  createInstalledHome,
  makeTempDir,
  prependPath,
  readJson,
  removeTempDir,
  runNodeCli,
} from "./test-helpers.js";

function createCodexEnv(root: string, responses: unknown[]) {
  const stubDir = createCodexStub(root);
  const responsesPath = join(root, "codex-responses.json");
  const statePath = join(root, "codex-state.txt");
  writeFileSync(responsesPath, JSON.stringify(responses), "utf8");
  writeFileSync(statePath, "0", "utf8");
  return prependPath(
    {
      HOME: createInstalledHome(root),
      SPECFLOW_TEST_CODEX_RESPONSES: responsesPath,
      SPECFLOW_TEST_CODEX_STATE: statePath,
    },
    stubDir,
  );
}

test("specflow-review-apply returns diff warning before codex", () => {
  const tempRoot = makeTempDir("review-apply-warning-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    addImplementationDiff(repoPath);
    writeFileSync(join(repoPath, "openspec/config.yaml"), "diff_warn_threshold: 1\n", "utf8");
    const env = createCodexEnv(tempRoot, []);
    const result = runNodeCli("specflow-review-apply", ["review", changeId], repoPath, env);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { status: string; warning: string; diff_total_lines: number };
    assert.equal(json.status, "warning");
    assert.equal(json.warning, "diff_threshold_exceeded");
    assert.ok(json.diff_total_lines > 1);
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-review-apply surfaces parse errors without mutating ledger", () => {
  const tempRoot = makeTempDir("review-apply-parse-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    addImplementationDiff(repoPath);
    const env = createCodexEnv(tempRoot, [{ exitCode: 0, output: "not-json" }]);
    const result = runNodeCli("specflow-review-apply", ["review", changeId], repoPath, env);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { review: { parse_error: boolean }; ledger: { round: number } };
    assert.equal(json.review.parse_error, true);
    assert.equal(json.ledger.round, 0);
    assert.equal(existsSync(join(repoPath, "openspec/changes", changeId, "review-ledger.json")), false);
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-review-design reports ledger recovery prompt on corrupt ledger without backup", () => {
  const tempRoot = makeTempDir("review-design-recovery-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    addDesignArtifacts(repoPath, changeId);
    writeFileSync(join(repoPath, "openspec/changes", changeId, "review-ledger-design.json"), "{", "utf8");
    const env = createCodexEnv(tempRoot, [{ exitCode: 0, output: JSON.stringify({ decision: "OK", findings: [], summary: "done" }) }]);
    const result = runNodeCli("specflow-review-design", ["review", changeId], repoPath, env);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { ledger_recovery: string };
    assert.equal(json.ledger_recovery, "prompt_user");
    assert.ok(existsSync(join(repoPath, "openspec/changes", changeId, "review-ledger-design.json.corrupt")));
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-review-design applies rereview classification and severity updates", () => {
  const tempRoot = makeTempDir("review-design-rereview-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    addDesignArtifacts(repoPath, changeId);
    const changeDir = join(repoPath, "openspec/changes", changeId);
    writeFileSync(
      join(changeDir, "review-ledger-design.json"),
      JSON.stringify(
        {
          feature_id: changeId,
          phase: "design",
          current_round: 1,
          status: "has_open_high",
          max_finding_id: 1,
          findings: [{ id: "R1-F01", title: "Clarify flow", file: "design.md", category: "design", severity: "high", status: "open", notes: "" }],
          round_summaries: [],
        },
        null,
        2,
      ),
      "utf8",
    );
    const env = createCodexEnv(tempRoot, [
      {
        exitCode: 0,
        output: JSON.stringify({
          decision: "UPDATED",
          summary: "classified",
          findings: [],
          resolved_previous_findings: [],
          still_open_previous_findings: [{ id: "R1-F01", severity: "medium" }],
          new_findings: [{ title: "Add example", file: "tasks.md", category: "design", severity: "low" }],
        }),
      },
    ]);
    const result = runNodeCli("specflow-review-design", ["fix-review", changeId], repoPath, env);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { rereview_classification: { still_open: string[]; new_findings: string[] } };
    assert.deepEqual(json.rereview_classification.still_open, ["R1-F01"]);
    const ledger = readJson<{ findings: { id: string; severity: string; status: string }[] }>(join(changeDir, "review-ledger-design.json"));
    assert.equal(ledger.findings[0].severity, "medium");
    assert.ok(ledger.findings.some((finding) => finding.id === "R2-F02" || finding.id === "R2-F01"));
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-review-design autofix-loop stops with no_progress after unchanged fixes", () => {
  const tempRoot = makeTempDir("review-design-autofix-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    addDesignArtifacts(repoPath, changeId);
    const changeDir = join(repoPath, "openspec/changes", changeId);
    writeFileSync(
      join(changeDir, "review-ledger-design.json"),
      JSON.stringify(
        {
          feature_id: changeId,
          phase: "design",
          current_round: 1,
          status: "has_open_high",
          max_finding_id: 1,
          findings: [{ id: "R1-F01", title: "Clarify flow", file: "design.md", category: "design", severity: "high", status: "open", notes: "" }],
          round_summaries: [],
        },
        null,
        2,
      ),
      "utf8",
    );
    const env = createCodexEnv(tempRoot, [
      { exitCode: 0, output: "{}" },
      { exitCode: 0, output: JSON.stringify({ decision: "REVIEWED", summary: "still open", findings: [], still_open_previous_findings: ["R1-F01"], resolved_previous_findings: [], new_findings: [] }) },
      { exitCode: 0, output: "{}" },
      { exitCode: 0, output: JSON.stringify({ decision: "REVIEWED", summary: "still open", findings: [], still_open_previous_findings: ["R1-F01"], resolved_previous_findings: [], new_findings: [] }) },
    ]);
    const result = runNodeCli("specflow-review-design", ["autofix-loop", changeId, "--max-rounds", "3"], repoPath, env);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { autofix: { result: string; total_rounds: number } };
    assert.equal(json.autofix.result, "no_progress");
    assert.equal(json.autofix.total_rounds, 2);
  } finally {
    removeTempDir(tempRoot);
  }
});
