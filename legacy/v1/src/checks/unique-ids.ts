import type { Checker, Registry, ValidationError } from "../types.js";

export const checkUniqueIds: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  for (const [groupName, entries] of Object.entries(registry)) {
    const seen = new Map<string, string>();
    for (const entry of entries as readonly { id: string; type: string; filePath: string }[]) {
      const existing = seen.get(entry.id);
      if (existing !== undefined) {
        errors.push({
          id: entry.id,
          type: entry.type as ValidationError["type"],
          check: "unique-ids",
          message: `Duplicate ID "${entry.id}" in ${groupName}: also declared at "${existing}"`,
          filePath: entry.filePath,
        });
      } else {
        seen.set(entry.id, entry.filePath);
      }
    }
  }

  return errors;
};
