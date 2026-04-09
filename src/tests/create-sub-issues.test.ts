import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createGhSubIssueStub,
  makeTempDir,
  prependPath,
  readJson,
  removeTempDir,
  runLegacyCli,
  runNodeCli,
} from "./test-helpers.js";

function payload(skipComment = false) {
  return JSON.stringify({
    parent_issue_number: 71,
    repo: "test/repo",
    run_timestamp: "20260409-010203",
    sub_features: [
      {
        phase_number: 1,
        title: "Auth",
        description: "Implement auth",
        requirements: ["FR-001"],
        acceptance_criteria: ["Login works"],
        phase_total: 2,
      },
      {
        phase_number: 2,
        title: "Billing",
        description: "Implement billing",
        requirements: ["FR-002"],
        acceptance_criteria: ["Checkout works"],
        phase_total: 2,
      },
    ],
    ...(skipComment ? { skip_comment: true } : {}),
  });
}

function normalizeGhState(state: {
  next_issue_number: number;
  labels: unknown[];
  issues: unknown[];
  comments: unknown[];
}) {
  return {
    ...state,
    labels: [...state.labels].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    issues: [...state.issues].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    comments: [...state.comments].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

test("specflow-create-sub-issues matches legacy output and side effects on success", () => {
  const tempRoot = makeTempDir("create-sub-issues-success-");
  try {
    const nodeStub = createGhSubIssueStub(join(tempRoot, "node"));
    const legacyStub = createGhSubIssueStub(join(tempRoot, "legacy"));
    const input = payload();

    const nodeResult = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: nodeStub.statePath }, nodeStub.stubDir),
      input,
    );
    const legacyResult = runLegacyCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: legacyStub.statePath }, legacyStub.stubDir),
      input,
    );

    assert.equal(nodeResult.status, legacyResult.status);
    assert.deepEqual(JSON.parse(nodeResult.stdout), JSON.parse(legacyResult.stdout));
    assert.deepEqual(
      normalizeGhState(readJson(nodeStub.statePath)),
      normalizeGhState(readJson(legacyStub.statePath)),
    );
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-create-sub-issues matches legacy partial failure behavior", () => {
  const tempRoot = makeTempDir("create-sub-issues-partial-");
  try {
    const nodeStub = createGhSubIssueStub(join(tempRoot, "node"));
    const legacyStub = createGhSubIssueStub(join(tempRoot, "legacy"));
    const failConfig = {
      next_issue_number: 100,
      labels: [],
      issues: [],
      comments: [],
      fail_create_phases: [2],
      fail_comment: false,
    };
    writeFileSync(nodeStub.statePath, `${JSON.stringify(failConfig, null, 2)}\n`, "utf8");
    writeFileSync(legacyStub.statePath, `${JSON.stringify(failConfig, null, 2)}\n`, "utf8");

    const nodeResult = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: nodeStub.statePath }, nodeStub.stubDir),
      payload(),
    );
    const legacyResult = runLegacyCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: legacyStub.statePath }, legacyStub.stubDir),
      payload(),
    );

    assert.equal(nodeResult.status, 2);
    assert.equal(nodeResult.status, legacyResult.status);
    assert.deepEqual(JSON.parse(nodeResult.stdout), JSON.parse(legacyResult.stdout));
    assert.deepEqual(
      normalizeGhState(readJson(nodeStub.statePath)),
      normalizeGhState(readJson(legacyStub.statePath)),
    );
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-create-sub-issues reuses existing issue via decomposition guard", () => {
  const tempRoot = makeTempDir("create-sub-issues-duplicate-");
  try {
    const { stubDir, statePath } = createGhSubIssueStub(tempRoot);
    writeFileSync(
      statePath,
      `${JSON.stringify(
        {
          next_issue_number: 101,
          labels: [],
          issues: [
            {
              number: 100,
              url: "https://github.com/test/repo/issues/100",
              title: "Phase 1: Auth",
              body: "",
              label: "phase-1",
              repo: "test/repo",
              decomposition_id: "decompose-71-20260409-010203-phase-1",
            },
          ],
          comments: [],
          fail_create_phases: [],
          fail_comment: false,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const result = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: statePath }, stubDir),
      payload(),
    );
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { created: { issue_number: number }[] };
    assert.equal(json.created[0]?.issue_number, 100);
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-create-sub-issues respects skip_comment", () => {
  const tempRoot = makeTempDir("create-sub-issues-skip-comment-");
  try {
    const { stubDir, statePath } = createGhSubIssueStub(tempRoot);
    const result = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: statePath }, stubDir),
      payload(true),
    );
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout) as { summary_comment_posted: boolean };
    assert.equal(json.summary_comment_posted, false);
    const state = readJson<{ comments: unknown[] }>(statePath);
    assert.equal(state.comments.length, 0);
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-create-sub-issues rejects invalid input", () => {
  const tempRoot = makeTempDir("create-sub-issues-invalid-");
  try {
    const { stubDir, statePath } = createGhSubIssueStub(tempRoot);
    const invalidJson = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: statePath }, stubDir),
      "{",
    );
    assert.notEqual(invalidJson.status, 0);
    assert.match(invalidJson.stderr, /Invalid JSON/);

    const missingField = runNodeCli(
      "specflow-create-sub-issues",
      [],
      tempRoot,
      prependPath({ SPECFLOW_TEST_GH_STATE: statePath }, stubDir),
      JSON.stringify({ repo: "test/repo", run_timestamp: "20260409-010203", sub_features: [] }),
    );
    assert.notEqual(missingField.status, 0);
    assert.match(missingField.stderr, /Validation failed/);
  } finally {
    removeTempDir(tempRoot);
  }
});
