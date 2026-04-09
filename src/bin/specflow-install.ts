import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { moduleRepoRoot } from "../lib/process.js";
import type { InstallPlan, Manifest } from "../types/contracts.js";
import { copyPath } from "../lib/fs.js";

function out(message: string): void {
  process.stdout.write(`${message}\n`);
}

function expandHome(path: string): string {
  return path.replace(/\$HOME/g, process.env.HOME ?? "");
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function mergeSettings(sourcePath: string, targetPath: string): void {
  const source = loadJson<{ permissions?: { allow?: string[] } }>(sourcePath);
  const existing = existsSync(targetPath)
    ? loadJson<{ permissions?: { allow?: string[] } }>(targetPath)
    : {};
  const nextAllow = new Set([
    ...(existing.permissions?.allow ?? []),
    ...(source.permissions?.allow ?? []),
  ]);
  const merged = {
    ...existing,
    permissions: {
      ...(existing.permissions ?? {}),
      allow: [...nextAllow].sort(),
    },
  };
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

function install(): void {
  const root = moduleRepoRoot(import.meta.url);
  const installPlan = loadJson<InstallPlan>(resolve(root, "dist/install-plan.json"));
  const manifest = loadJson<Manifest>(resolve(root, "dist/manifest.json"));

  out("=== specflow install ===");
  out(`Source: ${root}`);
  out("");

  for (const copy of installPlan.copies) {
    const sourcePath = resolve(root, copy.sourcePath);
    const targetPath = expandHome(copy.targetPath);
    if (copy.sourceKind === "directory" && existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }
    copyPath(sourcePath, targetPath);
    out(`copied ${copy.sourcePath} -> ${copy.targetPath}`);
  }

  const targetBin = expandHome("$HOME/bin");
  mkdirSync(targetBin, { recursive: true });
  for (const link of installPlan.links) {
    const sourcePath = resolve(root, link.sourcePath);
    const targetPath = expandHome(link.targetPath);
    rmSync(targetPath, { force: true });
    symlinkSync(sourcePath, targetPath);
    out(`linked ${link.targetPath}`);
  }

  for (const entry of readdirSync(targetBin)) {
    if (!entry.startsWith("specflow")) {
      continue;
    }
    const path = join(targetBin, entry);
    if (!lstatSync(path).isSymbolicLink()) {
      continue;
    }
    const expected = installPlan.links.some((link) => expandHome(link.targetPath) === path);
    if (expected) {
      continue;
    }
    rmSync(path, { force: true });
    out(`removed stale link ${entry}`);
  }

  const claudeCommandsDir = expandHome("$HOME/.claude/commands");
  mkdirSync(claudeCommandsDir, { recursive: true });
  for (const command of manifest.commands) {
    const sourcePath = resolve(root, command.filePath);
    const targetPath = join(claudeCommandsDir, command.filePath.split("/").pop() ?? `${command.id}.md`);
    copyPath(sourcePath, targetPath);
    out(`installed command ${command.id}`);
  }

  mergeSettings(
    resolve(root, installPlan.settingsMerge.sourcePath),
    expandHome(installPlan.settingsMerge.targetPath),
  );
  out("merged Claude permissions");
  out("");
  out("Done!");
}

install();
