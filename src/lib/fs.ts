import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeText(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function copyPath(sourcePath: string, targetPath: string): void {
  const sourceStat = statSync(sourcePath);
  ensureDir(dirname(targetPath));
  if (sourceStat.isDirectory()) {
    cpSync(sourcePath, targetPath, { recursive: true, force: true });
    return;
  }
  copyFileSync(sourcePath, targetPath);
}

export function setExecutable(path: string): void {
  const currentMode = statSync(path).mode;
  chmodSync(path, currentMode | 0o755);
}
