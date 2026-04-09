import { describe, it, expect } from "vitest";
import type { Registry } from "../types.js";
import { AssetType } from "../types.js";
import { checkFileExists } from "../checks/file-exists.js";
import { checkRegistryCompleteness } from "../checks/registry-completeness.js";
import { registry as realRegistry } from "../registry.js";

function emptyRegistry(overrides: Partial<Registry> = {}): Registry {
  return {
    commands: [],
    prompts: [],
    orchestrators: [],
    handoffTargets: [],
    agentRoles: [],
    ...overrides,
  };
}

describe("checkFileExists", () => {
  it("reports no errors for existing files (real registry paths)", () => {
    // Use a real command file that exists
    const reg = emptyRegistry({
      commands: [
        {
          id: "test",
          type: AssetType.Command,
          filePath: "global/commands/specflow.md",
          references: [],
        },
      ],
    });
    const errors = checkFileExists(reg);
    expect(errors).toEqual([]);
  });

  it("detects non-existent files", () => {
    const reg = emptyRegistry({
      commands: [
        {
          id: "ghost",
          type: AssetType.Command,
          filePath: "global/commands/does-not-exist.md",
          references: [],
        },
      ],
    });
    const errors = checkFileExists(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("file-exists");
  });
});

describe("checkRegistryCompleteness", () => {
  it("detects extra files on disk not in registry", () => {
    // Empty commands registry, but global/commands/ has files
    const reg = emptyRegistry({ commands: [] });
    const errors = checkRegistryCompleteness(reg);
    const commandErrors = errors.filter(
      (e) => e.type === AssetType.Command && e.check === "registry-completeness"
    );
    expect(commandErrors.length).toBeGreaterThan(0);
  });

  it("passes when registry matches filesystem", () => {
    const errors = checkRegistryCompleteness(realRegistry);
    expect(errors).toEqual([]);
  });
});
