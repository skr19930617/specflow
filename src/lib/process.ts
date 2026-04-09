import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

export function exec(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function tryExec(command: string, args: readonly string[], cwd: string): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

export function moduleRepoRoot(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../..");
}
