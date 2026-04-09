import type { Checker, Registry, ValidationError } from "../types.js";

const HANDOFF_REF_PREFIX = "handoff:";

export const checkHandoffTargets: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const handoffIds = new Set(registry.handoffTargets.map((h) => h.id));
  const commandIds = new Set(registry.commands.map((c) => c.id));

  // Check that command references to handoff targets resolve
  for (const entry of registry.commands) {
    for (const ref of entry.references) {
      if (!ref.startsWith(HANDOFF_REF_PREFIX)) continue;
      const handoffCommandId = ref.slice(HANDOFF_REF_PREFIX.length);
      const expectedHandoffId = `handoff:${handoffCommandId}`;
      if (!handoffIds.has(expectedHandoffId)) {
        errors.push({
          id: entry.id,
          type: entry.type,
          check: "handoff-target-exists",
          message: `References non-existent handoff target "${expectedHandoffId}". Ensure it is registered in handoffTargets.`,
          filePath: entry.filePath,
        });
      }
    }
  }

  // Check that each handoff target resolves to a registered command
  for (const target of registry.handoffTargets) {
    if (!commandIds.has(target.targetCommandId)) {
      errors.push({
        id: target.id,
        type: target.type,
        check: "handoff-target-resolves",
        message: `Handoff target "${target.id}" references command "${target.targetCommandId}" which is not registered.`,
        filePath: target.filePath,
      });
    }
  }

  return errors;
};
