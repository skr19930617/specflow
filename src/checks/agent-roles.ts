import type { Checker, Registry, ValidationError } from "../types.js";

export const checkAgentRoles: Checker = (registry: Registry): readonly ValidationError[] => {
  const errors: ValidationError[] = [];
  const validRoleIds = new Set(registry.agentRoles.map((r) => r.id));

  const allEntries = [
    ...registry.commands,
    ...registry.orchestrators,
  ];

  for (const entry of allEntries) {
    for (const ref of entry.references) {
      if (!ref.startsWith("role:")) continue;
      if (!validRoleIds.has(ref)) {
        errors.push({
          id: entry.id,
          type: entry.type,
          check: "agent-role-valid",
          message: `References non-existent agent role "${ref}". Valid roles: ${[...validRoleIds].join(", ")}`,
          filePath: entry.filePath,
        });
      }
    }
  }

  return errors;
};
