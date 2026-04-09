import type { Checker, Registry, RegistryEntry, ValidationError } from "../types.js";

export const checkUniqueSlashNames: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const seen = new Map<string, string>();

  for (const entry of registry.commands) {
    const name = (entry as RegistryEntry).slashCommandName;
    if (name === undefined) continue;

    const existing = seen.get(name);
    if (existing !== undefined) {
      errors.push({
        id: entry.id,
        type: entry.type,
        check: "unique-slash-names",
        message: `Duplicate slash command name "${name}": also declared by "${existing}"`,
        filePath: entry.filePath,
      });
    } else {
      seen.set(name, entry.id);
    }
  }

  return errors;
};
