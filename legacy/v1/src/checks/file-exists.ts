import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Checker, Registry, ValidationError } from "../types.js";

export const checkFileExists: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const projectRoot = process.cwd();

  const allEntries = [
    ...registry.commands,
    ...registry.prompts,
    ...registry.orchestrators,
    ...registry.handoffTargets,
    ...registry.agentRoles,
  ];

  for (const entry of allEntries) {
    const absPath = resolve(projectRoot, entry.filePath);
    if (!existsSync(absPath)) {
      errors.push({
        id: entry.id,
        type: entry.type,
        check: "file-exists",
        message: `File not found: "${entry.filePath}" (resolved to "${absPath}")`,
        filePath: entry.filePath,
      });
    }
  }

  return errors;
};
