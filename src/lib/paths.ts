import { resolve } from "node:path";

export const repoRoot = process.cwd();

export function fromRepo(...parts: readonly string[]): string {
  return resolve(repoRoot, ...parts);
}
