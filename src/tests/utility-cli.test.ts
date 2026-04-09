import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addImplementationDiff,
  createFixtureRepo,
  createGhStub,
  createInstalledHome,
  createOpenspecStub,
  makeTempDir,
  prependPath,
  removeTempDir,
  repoRoot,
  runLegacyCli,
  runNodeCli,
} from "./test-helpers.js";

test("specflow-fetch-issue matches legacy output", () => {
  const tempRoot = makeTempDir("fetch-issue-");
  try {
    const stubDir = createGhStub(
      tempRoot,
      '{"number":71,"title":"Stub issue","body":"test","url":"https://github.com/test/repo/issues/71","labels":[],"assignees":[],"author":{"login":"bot"},"state":"OPEN"}\n',
    );
    const env = prependPath({ HOME: createInstalledHome(tempRoot) }, stubDir);
    const args = ["https://github.com/test/repo/issues/71"];
    const nodeResult = runNodeCli("specflow-fetch-issue", args, repoRoot, env);
    const legacyResult = runLegacyCli("specflow-fetch-issue", args, repoRoot, env);
    assert.equal(nodeResult.status, legacyResult.status);
    assert.equal(nodeResult.stdout, legacyResult.stdout);
    assert.equal(nodeResult.stderr, legacyResult.stderr);
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-filter-diff matches legacy output and summary", () => {
  const tempRoot = makeTempDir("filter-diff-");
  try {
    const { repoPath } = createFixtureRepo(tempRoot);
    writeFileSync(join(repoPath, "deleted.txt"), "gone\n", "utf8");
    writeFileSync(join(repoPath, "rename-me.txt"), "same\n", "utf8");
    writeFileSync(join(repoPath, "keep.lock"), "lock\n", "utf8");
    const add = (args: string[]) =>
      spawnSync("git", args, { cwd: repoPath, stdio: "ignore" });
    add(["add", "."]);
    add(["commit", "-m", "fixtures"]);
    add(["mv", "rename-me.txt", "renamed.txt"]);
    unlinkSync(join(repoPath, "deleted.txt"));
    addImplementationDiff(repoPath);
    writeFileSync(join(repoPath, "review-ledger.json"), "{}\n", "utf8");
    const env = { DIFF_EXCLUDE_PATTERNS: "*.lock" };
    const args = ["--", "."];
    const nodeResult = runNodeCli("specflow-filter-diff", args, repoPath, env);
    const legacyResult = runLegacyCli("specflow-filter-diff", args, repoPath, env);
    assert.equal(nodeResult.stdout, legacyResult.stdout);
    assert.deepEqual(JSON.parse(nodeResult.stderr.trim()), JSON.parse(legacyResult.stderr.trim()));
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-design-artifacts wraps openspec next and validate", () => {
  const tempRoot = makeTempDir("design-artifacts-");
  try {
    const { repoPath, changeId } = createFixtureRepo(tempRoot);
    const stubDir = createOpenspecStub(
      tempRoot,
      [
        "#!/usr/bin/env node",
        "const args = process.argv.slice(2);",
        "if (args[0] === 'status') {",
        "  process.stdout.write(JSON.stringify({ isComplete: false, artifacts: [{ id: 'design', status: 'ready' }] }));",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'instructions') {",
        "  process.stdout.write(JSON.stringify({ artifactId: 'design', outputPath: 'openspec/changes/test/design.md', template: '# T', instruction: 'Do it', dependencies: [] }));",
        "  process.exit(0);",
        "}",
        "if (args[0] === 'validate') {",
        "  process.stdout.write(JSON.stringify({ items: [{ valid: true }] }));",
        "  process.exit(0);",
        "}",
        "process.exit(1);",
        "",
      ].join("\n"),
    );
    const env = prependPath({}, stubDir);
    const nextResult = runNodeCli("specflow-design-artifacts", ["next", changeId], repoPath, env);
    assert.equal(nextResult.status, 0, nextResult.stderr);
    assert.equal(JSON.parse(nextResult.stdout).status, "ready");

    const validateResult = runNodeCli("specflow-design-artifacts", ["validate", changeId], repoPath, env);
    assert.equal(validateResult.status, 0, validateResult.stderr);
    assert.equal(JSON.parse(validateResult.stdout).status, "valid");
  } finally {
    removeTempDir(tempRoot);
  }
});

test("specflow-analyze returns structured project metadata", () => {
  const result = runNodeCli("specflow-analyze", [repoRoot], repoRoot);
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout) as { project_name: string; languages: string[]; package_manager: string | null };
  assert.equal(json.project_name, "spec-scripts");
  assert.ok(json.languages.includes("TypeScript"));
  assert.equal(json.package_manager, "npm");
});

test("specflow-init --update refreshes installed commands from manifest", () => {
  const tempRoot = makeTempDir("specflow-init-update-");
  try {
    const home = createInstalledHome(tempRoot);
    const repoPath = join(tempRoot, "repo");
    mkdirSync(repoPath, { recursive: true });
    spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
    writeFileSync(join(repoPath, "CLAUDE.md"), "custom\n", "utf8");
    const result = runNodeCli("specflow-init", ["--update"], repoPath, { HOME: home }, "n\n");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(repoPath, ".mcp.json")));
    assert.ok(existsSync(join(home, ".claude/commands/specflow.md")));
  } finally {
    removeTempDir(tempRoot);
  }
});
