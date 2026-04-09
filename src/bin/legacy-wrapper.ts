import { spawnSync } from "node:child_process";
import { moduleRepoRoot } from "../lib/process.js";
import { resolve } from "node:path";

export function runLegacyEntrypoint(moduleUrl: string, legacyName: string): never {
  const root = moduleRepoRoot(moduleUrl);
  const target = resolve(root, "legacy/v1/bin", legacyName);
  const result = spawnSync(target, process.argv.slice(2), {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}
