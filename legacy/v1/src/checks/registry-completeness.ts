import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Checker, Registry, ValidationError } from "../types.js";
import { AssetType } from "../types.js";

interface ScanTarget {
  readonly dir: string;
  readonly pattern: (name: string, fullPath: string) => boolean;
  readonly assetType: AssetType;
  readonly registryGroup: keyof Registry;
}

const SCAN_TARGETS: readonly ScanTarget[] = [
  {
    dir: "global/commands",
    pattern: (name: string, _fullPath: string) => name.endsWith(".md"),
    assetType: AssetType.Command,
    registryGroup: "commands",
  },
  {
    dir: "global/prompts",
    pattern: (name: string, _fullPath: string) => name.endsWith(".md"),
    assetType: AssetType.Prompt,
    registryGroup: "prompts",
  },
  {
    dir: "bin",
    pattern: (_name: string, fullPath: string) => {
      try {
        const stat = statSync(fullPath);
        return (stat.mode & 0o111) !== 0;
      } catch {
        return false;
      }
    },
    assetType: AssetType.Orchestrator,
    registryGroup: "orchestrators",
  },
];

function scanDirectory(
  projectRoot: string,
  target: ScanTarget,
): readonly string[] {
  const absDir = resolve(projectRoot, target.dir);
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return [];
  }

  return entries
    .filter((name) => {
      const fullPath = join(absDir, name);
      return target.pattern(name, fullPath);
    })
    .map((name) => `${target.dir}/${name}`);
}

export const checkRegistryCompleteness: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const projectRoot = process.cwd();

  for (const target of SCAN_TARGETS) {
    const filesOnDisk = new Set(scanDirectory(projectRoot, target));
    const group = registry[target.registryGroup] as readonly { id: string; filePath: string }[];
    const registeredPaths = new Set(group.map((e) => e.filePath));

    // Files on disk but missing from registry
    for (const diskPath of filesOnDisk) {
      if (!registeredPaths.has(diskPath)) {
        errors.push({
          id: diskPath,
          type: target.assetType,
          check: "registry-completeness",
          message: `File "${diskPath}" exists on disk but is not registered in ${target.registryGroup}. Add it to the registry.`,
          filePath: diskPath,
        });
      }
    }

    // Registered but not on disk (for file-backed types)
    for (const entry of group) {
      if (entry.filePath.startsWith(target.dir + "/") && !filesOnDisk.has(entry.filePath)) {
        errors.push({
          id: entry.id,
          type: target.assetType,
          check: "registry-completeness",
          message: `Registered entry "${entry.id}" points to "${entry.filePath}" which is not found in ${target.dir}/. Remove it from the registry or create the file.`,
          filePath: entry.filePath,
        });
      }
    }
  }

  return errors;
};
