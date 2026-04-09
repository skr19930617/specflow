import type { Checker, Registry, ValidationError } from "../types.js";

const PROMPT_REF_PREFIX = "prompt:";

export const checkPromptRefs: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const promptIds = new Set(registry.prompts.map((p) => p.id));

  const allEntries = [
    ...registry.commands,
    ...registry.orchestrators,
  ];

  for (const entry of allEntries) {
    for (const ref of entry.references) {
      if (!ref.startsWith(PROMPT_REF_PREFIX)) continue;
      const promptId = ref.slice(PROMPT_REF_PREFIX.length);
      if (!promptIds.has(promptId)) {
        errors.push({
          id: entry.id,
          type: entry.type,
          check: "prompt-ref-exists",
          message: `References non-existent prompt "${promptId}". Available prompts: ${[...promptIds].join(", ")}`,
          filePath: entry.filePath,
        });
      }
    }
  }

  return errors;
};
