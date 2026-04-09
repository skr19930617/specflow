import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchIssueStub, createFixtureRepo, makeTempDir, removeTempDir, runNodeCli } from "./test-helpers.js";

test("specflow-run supports lifecycle, issue metadata, and update-field", () => {
  const tempRoot = makeTempDir("specflow-run-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    const stubPath = createFetchIssueStub(tempRoot);

    const start = runNodeCli(
      "specflow-run",
      ["start", changeId, "--issue-url", "https://github.com/test/repo/issues/71"],
      repoPath,
      { SPECFLOW_FETCH_ISSUE: stubPath },
    );
    assert.equal(start.status, 0, start.stderr);
    const startJson = JSON.parse(start.stdout) as { current_phase: string; issue: { repo: string }; allowed_events: string[] };
    assert.equal(startJson.current_phase, "start");
    assert.equal(startJson.issue.repo, "test/repo");
    assert.ok(startJson.allowed_events.includes("propose"));

    const advance = runNodeCli("specflow-run", ["advance", changeId, "propose"], repoPath);
    assert.equal(advance.status, 0, advance.stderr);
    const advanceJson = JSON.parse(advance.stdout) as { current_phase: string; history: { event: string }[] };
    assert.equal(advanceJson.current_phase, "proposal");
    assert.equal(advanceJson.history[0]?.event, "propose");

    const update = runNodeCli("specflow-run", ["update-field", changeId, "last_summary_path", "/tmp/summary.md"], repoPath);
    assert.equal(update.status, 0, update.stderr);
    const updateJson = JSON.parse(update.stdout) as { last_summary_path: string };
    assert.equal(updateJson.last_summary_path, "/tmp/summary.md");

    const getField = runNodeCli("specflow-run", ["get-field", changeId, "current_phase"], repoPath);
    assert.equal(getField.status, 0, getField.stderr);
    assert.equal(JSON.parse(getField.stdout), "proposal");
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-run supports synthetic runs without OpenSpec change directories", () => {
  const tempRoot = makeTempDir("specflow-run-synthetic-");
  try {
    const { repoPath } = createFixtureRepo(tempRoot);
    const start = runNodeCli("specflow-run", ["start", "_explore_20260409-010203", "--run-kind", "synthetic"], repoPath);
    assert.equal(start.status, 0, start.stderr);
    const startJson = JSON.parse(start.stdout) as { run_kind?: string; change_name: string | null; allowed_events: string[] };
    assert.equal(startJson.run_kind, "synthetic");
    assert.equal(startJson.change_name, null);
    assert.ok(startJson.allowed_events.includes("propose"));

    const advance = runNodeCli("specflow-run", ["advance", "_explore_20260409-010203", "explore_start"], repoPath);
    assert.equal(advance.status, 0, advance.stderr);
    const advanceJson = JSON.parse(advance.stdout) as { current_phase: string };
    assert.equal(advanceJson.current_phase, "explore");

    const status = runNodeCli("specflow-run", ["status", "_explore_20260409-010203"], repoPath);
    assert.equal(status.status, 0, status.stderr);
    const statusJson = JSON.parse(status.stdout) as { current_phase: string };
    assert.equal(statusJson.current_phase, "explore");
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-run rejects old run schema and removed revise event", () => {
  const tempRoot = makeTempDir("specflow-run-schema-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    const runDir = join(repoPath, ".specflow/runs", changeId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "run.json"),
      JSON.stringify(
        {
          run_id: changeId,
          change_name: changeId,
          current_phase: "design",
          status: "active",
          allowed_events: ["accept_design", "revise_design", "reject"],
          issue: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          history: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const oldSchema = runNodeCli("specflow-run", ["status", changeId], repoPath);
    assert.notEqual(oldSchema.status, 0);
    assert.match(oldSchema.stderr, /missing required fields/);
  } finally {
    removeTempDir(tempRoot);
  }
});
