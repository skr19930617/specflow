import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Manifest, ManifestEntry, Registry } from "./types.js";

const MANIFEST_PATH = "dist/manifest.json";
const REGISTRY_VERSION = "1.0.0";

function toManifestEntry(entry: { id: string; type: string; filePath: string; references: readonly string[] }): ManifestEntry {
  return {
    id: entry.id,
    type: entry.type as ManifestEntry["type"],
    filePath: entry.filePath,
    references: [...entry.references].sort(),
  };
}

function sortedEntries(entries: readonly { id: string; type: string; filePath: string; references: readonly string[] }[]): readonly ManifestEntry[] {
  return [...entries]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(toManifestEntry);
}

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

export async function generateManifest(registry: Registry): Promise<void> {
  const manifest: Manifest = sortObjectKeys({
    agentRoles: sortedEntries(registry.agentRoles),
    commands: sortedEntries(registry.commands),
    handoffTargets: sortedEntries(registry.handoffTargets),
    metadata: sortObjectKeys({
      generatedAt: new Date().toISOString(),
      gitCommit: getGitCommit(),
      registryVersion: REGISTRY_VERSION,
    }),
    orchestrators: sortedEntries(registry.orchestrators),
    prompts: sortedEntries(registry.prompts),
  });

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
