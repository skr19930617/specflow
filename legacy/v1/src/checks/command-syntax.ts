import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Checker, Registry, ValidationError } from "../types.js";

const CORRECT_PATTERN = /openspec validate\s+"[^"]*"\s+--type\s+(?:change|spec)\s+--json/;
const OPENSPEC_VALIDATE = /openspec validate/;

export const checkCommandSyntax: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const projectRoot = process.cwd();

  for (const entry of registry.commands) {
    const absPath = resolve(projectRoot, entry.filePath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch {
      continue; // file-exists checker handles missing files
    }

    if (!OPENSPEC_VALIDATE.test(content)) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!OPENSPEC_VALIDATE.test(line)) continue;
      if (CORRECT_PATTERN.test(line)) continue;
      // Skip comment lines and markdown code fences
      if (line.trimStart().startsWith("#") || line.trimStart().startsWith("//")) continue;

      errors.push({
        id: entry.id,
        type: entry.type,
        check: "command-syntax",
        message: `Line ${i + 1}: "openspec validate" call does not match expected syntax: openspec validate "<ID>" --type <change|spec> --json`,
        filePath: entry.filePath,
      });
    }
  }

  return errors;
};
