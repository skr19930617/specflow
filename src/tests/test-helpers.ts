import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = process.cwd();

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function createFixtureRepo(root: string, changeId = "test-change"): { repoPath: string; changeId: string } {
  const repoPath = join(root, "repo");
  mkdirSync(repoPath, { recursive: true });
  spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
  spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: repoPath, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "specflow@example.com"], { cwd: repoPath, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Specflow Tests"], { cwd: repoPath, stdio: "ignore" });
  spawnSync("git", ["remote", "add", "origin", "https://github.com/test/repo.git"], { cwd: repoPath, stdio: "ignore" });

  const changeDir = join(repoPath, "openspec/changes", changeId);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, "proposal.md"), "# Proposal\n", "utf8");

  const workflowDir = join(repoPath, "global/workflow");
  mkdirSync(workflowDir, { recursive: true });
  copyFileSync(resolve(repoRoot, "global/workflow/state-machine.json"), join(workflowDir, "state-machine.json"));
  spawnSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repoPath, stdio: "ignore" });

  return { repoPath, changeId };
}

export function createFetchIssueStub(root: string): string {
  const path = join(root, "fetch-issue-stub.sh");
  writeFileSync(
    path,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "echo '{\"number\":71,\"title\":\"Stub issue\",\"body\":\"test\",\"url\":\"https://github.com/test/repo/issues/71\"}'",
      "",
    ].join("\n"),
    "utf8",
  );
  spawnSync("chmod", ["+x", path], { stdio: "ignore" });
  return path;
}

export function runNodeCli(
  cliName: string,
  args: readonly string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [resolve(repoRoot, "dist/bin", `${cliName}.js`), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

export function runLegacyCli(
  cliName: string,
  args: readonly string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(resolve(repoRoot, "legacy/v1/bin", cliName), [...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

export function normalizeRunState(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  delete parsed.created_at;
  delete parsed.updated_at;
  delete parsed.repo_path;
  delete parsed.worktree_path;
  if (Array.isArray(parsed.history)) {
    parsed.history = parsed.history.map((entry) => {
      const next = { ...(entry as Record<string, unknown>) };
      delete next.timestamp;
      return next;
    });
  }
  return parsed;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
